/**
 * The ABAP debugger's state between tool calls — one per server instance.
 *
 * What it needs was measured (2026-10-10, on premise and on the cloud): a
 * breakpoint stops a program only while a listener poll is open; an
 * unattached debuggee resumes by itself after ~30 s; after an attach only the
 * attaching ABAP session works the stop. So a long poll stands while nothing
 * is stopped, a catch is attached at once on a connection of its own, and
 * that connection serves the stop. One debuggee at a time. Nothing ends on a
 * timer of ours. Every change goes through one Serial; the long poll runs
 * outside it and its answer is dropped when the generation moved on.
 */
import {
  type AbapDebugger,
  AdtBatchConnection,
  type abapDebuggerDocuments,
  type IDebuggerListenerConflict,
  readListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseDebuggeeEnd,
  analyseDebuggerFreed,
  analyseException,
  readExceptionSubType,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtResponse,
  IDebuggeeIds,
  IDebuggerBreakpoint,
  IDebuggerBreakpointSync,
  IDebuggerIdentity,
  IDebuggerSettings,
  IDebuggerStepMethod,
  IDebuggerStepToLineMethod,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  type AdtHeadersContext,
  adtHeadersOf,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import {
  type FailureEntry,
  isCredentialFailure,
  isCredentialPayload,
  unlessCredentialFailure,
} from '../answer';
import {
  carryingFailure,
  carryingPayload,
  noteLeftBehind,
  payloadCarriedBy,
} from '../strategies/step';
import {
  type BreakpointNotPlaced,
  mergeDefinitions,
  pairRows,
  type RequestedBreakpoint,
  type UnexpectedRow,
  wireOf,
} from './arming';
import {
  asFailure,
  cleanupPayload,
  credentialRefusalIn,
  type DebugFailure,
  describeFailures,
  failedEntry,
  isFromThrow,
  leaveBehind,
  thrownFailure,
} from './failures';
import type { BreakpointConflict, DebuggerIds } from './ids';
import type { RunKind } from './objectUri';
import {
  type AttachReading,
  type BreakpointReading,
  type DebuggeeReading,
  failureText,
  readAttach,
  readBreakpoints,
  readDebuggee,
  readDebuggeeEnd,
  readSettings,
  readStack,
  readVariables,
  type SettingsReading,
  type StackReading,
  type VariablesReading,
} from './readings';
import { Serial } from './serial';

export const LISTEN_HOLD_SECONDS = 60;
export const FIRST_POLL_HOLD_SECONDS = 3;
export const WAIT_MAX_SECONDS = 30;

export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget {
  kind: RunKind;
  name: string;
}
export type RunOutcome =
  | { ok: true; output: string }
  | { ok: false; message: string };
/**
 * The ABAP session a debugger connection opens: stateful for what SAP's
 * design binds to one session (the listener, the attach, the breakpoints'
 * requests), stateless for the program's run.
 */
export type DebugSessionKind = 'stateful' | 'stateless';
export interface DebugSessionPorts<O = unknown> {
  /** A connection of its own, `stateful` unless `session` says otherwise. */
  openConnection(
    origin: O,
    session?: DebugSessionKind,
  ): Promise<IAbapConnection>;
  closeConnection(connection: IAbapConnection): Promise<void>;
  /**
   * Forgets a connection whose ABAP session the system freed itself
   * (`terminateDebugger`): nothing more is sent on it, not even a logoff.
   */
  dropConnection(connection: IAbapConnection): void;
  abapDebugger(
    connection: IAbapConnection,
    onConflict: IDebuggerListenerConflict,
  ): Debugger;
  requestUser(origin: O): Promise<string>;
  /**
   * `debuggee` makes the run carry those ids, so a terminal-mode listener under
   * them catches it; without it only a user-mode listener does.
   */
  run(
    connection: IAbapConnection,
    target: RunTarget,
    debuggee?: IDebuggeeIds,
  ): Promise<RunOutcome>;
}
export interface StopView {
  debuggee: DebuggeeReading;
  attach: AttachReading;
  stack: StackReading;
  /** Reading the stack failed: the method's error as it is, with its step; the stop stands. */
  stackError?: DebugFailure;
  /** The settings in force after this attach applied the preferences. */
  settings?: SettingsReading;
  /** Why applying them failed — the method's error as it is, with its step; the stop stands. */
  settingsError?: DebugFailure;
  raw: { debuggee: string; attach: string; stack: string };
}
export type EndReason =
  | 'debuggee_ended'
  | 'terminated'
  | 'run_finished'
  | 'attach_refused'
  | 'attach_impossible';
export type DebugState =
  | { state: 'idle' }
  | { state: 'listening' }
  | { state: 'stopped'; stop: StopView }
  | {
      state: 'ended';
      reason: EndReason;
      run?: RunOutcome;
      message?: string;
      /** A refused attach: the method's error as it is, with its step. */
      failure?: DebugFailure;
    };
export interface DebugView<T> {
  value: T;
  raw: string;
}
export interface BreakpointsAnswer {
  /** The full resulting set, the surviving earlier breakpoints included. */
  placed: BreakpointReading[];
  /** This call's definitions the system did not place, each with the reason its row gave. */
  refused: BreakpointNotPlaced[];
  /** Earlier definitions no longer placed. */
  lost: BreakpointNotPlaced[];
  /** Answer rows that pair with no definition sent; a conforming system answers none. */
  unexpected: UnexpectedRow[];
}
export type DebuggingMode = 'user' | 'terminal';
/** What a caller may set; `showDataAging` is left out, so it stays off, the system's default. */
export type DebugSettings = Omit<IDebuggerSettings, 'showDataAging'>;
export interface DebugStartOptions {
  /** At least one: a start with an empty list is refused before the wire. */
  breakpoints: IDebuggerBreakpoint[];
  run?: RunTarget;
  /** User mode: whose requests are caught; the connected user when omitted. */
  requestUser?: string;
  /**
   * `user` (the default) or `terminal`, which catches only the runs this
   * session starts: they carry its terminal id and IDE id.
   */
  debuggingMode?: DebuggingMode;
  /** Applied after each attach; see `setSettings`. */
  settings?: DebugSettings;
}
/** Whose requests a call of the one-request path debugs: the arguments it was given. */
export interface OnceIdentity {
  requestUser?: string;
  debuggingMode?: DebuggingMode;
}
/** A step of the one-request path: SAP's step result, or the end it reports. */
export type OnceStep =
  | { step: AttachReading }
  | { ended: 'debuggee_ended' | 'terminated' };
export interface DebugSessionOptions {
  /** The host's choice; `replace` when omitted. */
  breakpointConflict?: BreakpointConflict;
}

export class DebugListenerError extends Error {}
export class DebugStateError extends Error {}
export class DebugRequestError extends Error {}
/**
 * What a stop could not undo: each failure in the shape of every other
 * failure — the method's error as it is, with its step. `notes`: what the stop
 * answered beside the failure and that is no debt (SAP's final refusal, the
 * breakpoints it leaves on the system), entries too — answered with it, since
 * a later stop has nothing left to answer them again. The consumer gets
 * `{ failures, notes? }`; the message describes them for an in-process reader.
 */
export class DebugCleanupError extends Error {
  readonly failures: readonly DebugFailure[];
  readonly notes: readonly DebugFailure[];
  /** The steps not attempted once the credential was refused. */
  readonly notAttempted: readonly string[];
  constructor(
    failures: readonly DebugFailure[],
    notes: readonly DebugFailure[] = [],
    notAttempted: readonly string[] = [],
  ) {
    super(describeFailures([...failures, ...notes]));
    this.failures = failures;
    this.notes = notes;
    this.notAttempted = notAttempted;
    // A credential refusal is the answer as it came, with its step; the
    // steps after it were not attempted (`cleanupPayload`).
    carryingPayload(this, cleanupPayload(failures, notes, notAttempted));
  }
}
/**
 * Refused before anything was sent, or refused by the system before anything
 * of ours was left to undo. `placed`: breakpoints the system keeps, when a
 * start was refused after its arming placed them.
 */
export class DebugRefusedError extends Error {
  constructor(
    message: string,
    readonly placed?: BreakpointReading[],
  ) {
    super(message);
  }
}
/** Another debugger holds the user's debugging (409), as `readListenerConflict` reads it. */
export class DebugConflictError extends DebugListenerError {
  constructor(
    readonly conflictText: string,
    readonly ideUser?: string,
  ) {
    super(
      `another debugger holds this debugging: ${conflictText}${ideUser ? ` (IDE user ${ideUser})` : ''}`,
    );
  }
}

/** The polls the system has answered: whether an open poll has settled, read without waiting. */
const settledPolls = new WeakSet<Promise<IAdtResponse<string>>>();

/**
 * The failure of a release a stop did not send: the listener's stop failed
 * and a breakpoint's delete did not succeed, so the debuggee stays held.
 */
export const DEBUGGEE_KEPT_WORDS =
  "not sent: the listener's stop failed and a breakpoint may still be set, where the debuggee would stop again. It stays held for the next stop.";

interface Listener {
  connection: IAbapConnection;
  debugger: Debugger;
  /** The last poll, until its answer was handled: a stop waits for it and handles a catch in it. */
  open?: Promise<IAdtResponse<string>>;
}
interface Stop {
  connection: IAbapConnection;
  debugger: Debugger;
  view: StopView;
  /** Whether this attach has had its first setDebuggerSettings. */
  settingsSent?: boolean;
  /**
   * Attached by the one-request path (the compact debugger): the cleanup
   * closes its connection — the logoff ends the attachment — and sends no
   * release step on it.
   */
  once?: true;
}
/** An attached debuggee whose release failed: only its attaching session can release it. */
interface OwedRelease {
  connection: IAbapConnection;
  debugger: Debugger;
  what: string;
}

const bodyOf = (a: IAdtResponse<unknown>): string =>
  a.ok ? String(a.getResult().value ?? '') : '';
const messageOf = (a: IAdtResponse<unknown>): string =>
  a.ok ? '' : failureText(a.getError());
const thrown = (e: unknown) => (e instanceof Error ? e.message : String(e));
/**
 * A listener failure that was a throw (a connection, a collaborator): it
 * carries its entry — the carried method's error as it is, a credential
 * failure as it came, else the throw as ours (`client_threw`) — with the step.
 */
const listenerThrown = (e: unknown, step: string): DebugListenerError =>
  carryingPayload(new DebugListenerError(thrown(e)), thrownFailure(e, step));
/** A debug error that carries the method's error as it is, with its step. */
const failedAt = <E extends Error>(
  error: E,
  a: IAdtResponse<unknown>,
  step: string,
): E =>
  a.ok || isFromThrow(a.getError())
    ? error
    : carryingFailure(error, a.getError(), step);

/** The debuggee an attach of the one-request path names: its id and server, the rest unread. */
function attachedDebuggee(
  debuggeeId: string,
  server?: string,
): DebuggeeReading {
  return {
    debuggeeId,
    user: '',
    program: '',
    include: '',
    line: 0,
    uri: '',
    objectType: '',
    objectName: '',
    instance: server ?? '',
    kind: '',
    attachImpossible: false,
    terminalId: '',
    ideId: '',
    isSameServer: true,
    canAdtCrossServer: false,
  };
}

/** A condition on a breakpoint other than a line is refused before the wire, naming it. */
export function refuseConditionOffLine(
  list: readonly IDebuggerBreakpoint[],
): void {
  list.forEach((b, i) => {
    if (b.kind !== 'line' && (b as { condition?: string }).condition)
      throw new DebugRefusedError(
        `breakpoints[${i}] (${b.kind}): a condition applies to a line breakpoint only`,
      );
  });
}

/**
 * The system refused the request user: `403 notAuthorized` or `404
 * invalidUser`, read from the subtype of the answer's `exc:exception`. Measured
 * on premise (2026-10-11), BASIS 816, for a request user that does not exist:
 * `setBreakpoints` answers `403 notAuthorized` and places nothing,
 * `stopListener` answers `404 invalidUser`. From the server source (server
 * source, BASIS 816, read 2026-10-11): `setBreakpoints` checks the connected
 * user's debug authorisation as well, so a missing authorisation and a request
 * user that does not exist are both refused there, before anything is placed.
 * A listen or a stopListener refused the same way after a successful arming is
 * a safety net a conforming server does not reach. Any other failure is not
 * read as this.
 */
function refusesUser(answer: IAdtResponse<unknown>): boolean {
  if (answer.ok) return false;
  const response = answer.getError().response;
  const subType = readExceptionSubType(response?.data);
  return (
    (response?.status === 403 && subType === 'notAuthorized') ||
    (response?.status === 404 && subType === 'invalidUser')
  );
}

/** A placed breakpoint as the model reads it: its id, its kind and what it is on. */
function describePlaced(b: BreakpointReading): string {
  const on =
    b.uri ??
    b.exceptionClass ??
    b.statement ??
    ([b.msgId, b.msgNo].filter(Boolean).join(' ') || undefined);
  return `${b.id ?? '?'} (${b.kind}${on ? ` ${on}` : ''})`;
}

/**
 * The credential failure a start's throw is or carries, as its entry with its
 * step: a chain failure or a `401` thrown, or a listener's throw carrying one
 * (`listenerThrown`, `listenerError`). `undefined` for any other failure.
 */
function credentialEntryOf(error: unknown): DebugFailure | undefined {
  if (isCredentialFailure(error)) return thrownFailure(error, 'start');
  const carried = payloadCarriedBy(error) as FailureEntry | undefined;
  return carried !== undefined && isCredentialPayload(carried)
    ? carried
    : undefined;
}

/** A failed listener answer: the holder named when it is the system's conflict. */
function listenerError(
  answer: IAdtResponse<unknown>,
  step: string,
): DebugListenerError {
  if (!answer.ok && isFromThrow(answer.getError()))
    return carryingPayload(
      new DebugListenerError(messageOf(answer)),
      failedEntry(answer, step),
    );
  const held = answer.ok ? undefined : readListenerConflict(answer.getError());
  return failedAt(
    held
      ? new DebugConflictError(held.conflictText, held.ideUser)
      : new DebugListenerError(messageOf(answer)),
    answer,
    step,
  );
}

/** A stack answer read into `stop`'s view — a new view; the stop's own is the caller's to replace. */
function stackView(
  stop: Stop,
  stack: IAdtResponse<string>,
): DebugView<StopView> {
  if (!stack.ok) {
    throw failedAt(
      new DebugRequestError(messageOf(stack)),
      stack,
      'read stack',
    );
  }
  const view: StopView = {
    ...stop.view,
    stack: readStack(bodyOf(stack)),
    stackError: undefined,
    raw: { ...stop.view.raw, stack: bodyOf(stack) },
  };
  return { value: view, raw: bodyOf(stack) };
}

/** A variables answer, read; its failure at `step`. */
function variablesView(
  answer: IAdtResponse<string>,
  step: string,
): DebugView<VariablesReading> {
  if (!answer.ok) {
    throw failedAt(new DebugRequestError(messageOf(answer)), answer, step);
  }
  return { value: readVariables(bodyOf(answer)), raw: bodyOf(answer) };
}

/** A stack position answer: the position asked; its failure at `set stack position`. */
function positionView(
  answer: IAdtResponse<unknown>,
  position: number,
): DebugView<{ position: number }> {
  if (!answer.ok)
    throw failedAt(
      new DebugRequestError(messageOf(answer)),
      answer,
      'set stack position',
    );
  return { value: { position }, raw: bodyOf(answer) };
}

const readVariablesOf = (
  context: AdtHeadersContext,
  d: Debugger,
  names: string[],
) =>
  withAdtHeaders(context, 'debugger.getVariables', (headers) =>
    d.getVariables(
      names.map((n) => n.toUpperCase()),
      { headers },
    ),
  );
const readChildVariablesOf = (
  context: AdtHeadersContext,
  d: Debugger,
  parents: string[],
) =>
  withAdtHeaders(context, 'debugger.getChildVariables', (headers) =>
    d.getChildVariables(
      parents.map((n) => n.toUpperCase()),
      { headers },
    ),
  );
const writeVariableOf = (d: Debugger, name: string, value: string) =>
  d.setVariableValue(name.toUpperCase(), value);

export class DebugSession<O = unknown> {
  protected readonly serial = new Serial();
  protected origin?: O;
  protected mode: IDebuggerListenerConflict = 'refuse';
  protected control?: Listener;
  protected readonly armed = new Map<string, BreakpointReading>();
  /** The breakpoint definitions as the callers gave them, deduplicated and tagged: what every change sends again. */
  protected requested: RequestedBreakpoint[] = [];
  /** A paired placed row's id → its definition's tag. */
  protected readonly pairedWith = new Map<string, string>();
  /** The last tag handed out. Never reset — not by a stop, not by a new start — so a tag is never reused. */
  private tags = 0;
  protected listener?: Listener;
  protected current?: Stop;
  protected failure?: string;
  /** The failed listen behind `failure`, carrying the method's error. */
  private failedListen?: DebugListenerError;
  protected generation = 0;
  protected readonly notices: DebugState[] = [];
  private readonly waiters = new Set<() => void>();
  private readonly closedConnections = new WeakSet<object>();
  protected readonly breakpointConflict: BreakpointConflict;
  /** The identity of this debug session: fixed by a start, kept until a cleanup succeeded completely. */
  protected fixed?: IDebuggerIdentity;
  /** True once something that changes the system was sent: the cleanup owes a stopListener. */
  protected changed = false;
  /** The settings the caller set; applied after each attach. */
  protected preferences: DebugSettings = {};
  /** The last answer of setDebuggerSettings. */
  protected effective?: SettingsReading;

  constructor(
    protected readonly ports: DebugSessionPorts<O>,
    readonly ids: DebuggerIds & { stated?: boolean; terminalStated?: boolean },
    options: DebugSessionOptions = {},
  ) {
    this.breakpointConflict = options.breakpointConflict ?? 'replace';
  }

  bind(origin: O): this {
    this.origin = origin;
    return this;
  }

  // --- plumbing -------------------------------------------------------------
  protected requireOrigin(): O {
    if (this.origin === undefined)
      throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  /** The identity in force: undefined before a start and after a complete cleanup. */
  currentIdentity(): IDebuggerIdentity | undefined {
    return this.fixed;
  }
  protected requireIdentity(): IDebuggerIdentity {
    if (!this.fixed)
      throw new DebugStateError('this debug session has not started');
    return this.fixed;
  }
  /** From a start's arguments; a mode they do not fit is refused before the wire. */
  protected async identityFor(
    options: Pick<DebugStartOptions, 'requestUser' | 'debuggingMode'>,
  ): Promise<IDebuggerIdentity> {
    // Presence is checked before any normalisation: a supplied blank is refused in
    // every mode, never read as "not supplied".
    const supplied = options.requestUser !== undefined;
    const named = options.requestUser?.trim();
    if (supplied && !named)
      throw new DebugRefusedError('request_user is empty');
    if (options.debuggingMode === 'terminal') {
      if (supplied)
        throw new DebugRefusedError(
          'request_user does not apply to terminal mode: the system reads no request user there',
        );
      return {
        debuggingMode: 'terminal',
        terminalId: this.ids.terminalId,
        ideId: this.ids.ideId,
      };
    }
    const requestUser = (
      named || (await this.ports.requestUser(this.requireOrigin()))
    ).toUpperCase();
    return {
      debuggingMode: 'user',
      requestUser,
      terminalId: this.ids.terminalId,
      ideId: this.ids.ideId,
    };
  }
  /**
   * Asks on the control connection — never on a polling one — whether another
   * debugger holds the user's debugging, and refuses on a 409 before anything is
   * sent. Changes nothing. Runs under listener mode `refuse` (the user's ruling,
   * 2026-10-12), whatever the breakpoint conflict says, and under
   * `refuse-if-held` in every mode; under take-over with `replace` there is no
   * check.
   *
   * Why under `refuse`: the listen's own 409 comes too late. Measured on premise
   * (2026-10-12, BASIS 816), same user, two ideIds, user mode, refuse, the first
   * IDE armed and listening: the check before anything else answers 409 and the
   * first IDE is untouched; an arming, then a listen refused 409, leaves its
   * listener standing but replaces its breakpoints — the user-mode set belongs
   * to the user, the ideId does not separate it — so the run stops at the
   * newcomer's line; a stopListener after that ends the first IDE's listener at
   * once; a deletion after that leaves its set gone all the same.
   *
   * Our own listener under the same ideId is no conflict (measured on premise,
   * 2026-10-10), so this protects against another IDE, not against ourselves.
   *
   * Not atomic. A listener another IDE starts between this check and our listen
   * has its set replaced by our arming, and our rollback's stopListener after
   * the listen's 409 ends its listener. That race is accepted and documented,
   * not handled (the user's ruling, 2026-10-12).
   */
  private async preflight(identity: IDebuggerIdentity): Promise<void> {
    if (this.mode !== 'refuse' && this.breakpointConflict !== 'refuse-if-held')
      return;
    const checked = await (await this.controlDebugger())
      .checkListener(identity)
      .catch(asFailure);
    if (!checked.ok) {
      const error = listenerError(checked, 'check listener');
      throw error instanceof DebugConflictError
        ? error
        : failedAt(
            new DebugRequestError(messageOf(checked)),
            checked,
            'check listener',
          );
    }
  }
  /** Closes the control connection; a close that throws is kept for the next stop and named. */
  private async closeControl(): Promise<DebugFailure[]> {
    const control = this.control;
    this.control = undefined;
    const kept = await this.closeOrRecord(
      control?.connection,
      "the breakpoints' connection",
    );
    return kept ? [kept] : [];
  }
  protected async open(
    session: DebugSessionKind = 'stateful',
  ): Promise<IAbapConnection> {
    return this.ports.openConnection(this.requireOrigin(), session);
  }
  /**
   * Closes once. The connector's `disconnect()` never throws by contract (it
   * dispatches the logoff and returns); a port that does throw leaves the
   * connection unmarked, so a later cleanup tries again.
   */
  protected async close(
    connection: IAbapConnection | undefined,
  ): Promise<void> {
    if (!connection || this.closedConnections.has(connection)) return;
    await this.ports.closeConnection(connection);
    this.closedConnections.add(connection);
  }
  protected async controlDebugger(): Promise<Debugger> {
    if (!this.control) {
      const connection = await this.open();
      this.control = {
        connection,
        debugger: this.ports.abapDebugger(connection, this.mode),
      };
    }
    return this.control.debugger;
  }
  private observer?: () => void;
  observe(onChange: () => void): void {
    this.observer = onChange;
  }
  protected notify(): void {
    for (const w of [...this.waiters]) w();
    this.observer?.();
  }

  /** Every change goes through here: one at a time, and observers hear of it afterwards — whatever it did. */
  protected mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.serial.run(async () => {
      try {
        return await work();
      } finally {
        this.notify();
      }
    });
  }
  private owns(listener: Listener, generation: number): boolean {
    return this.listener === listener && this.generation === generation;
  }

  // --- breakpoints ------------------------------------------------------------
  setBreakpoints(
    list: IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointsAnswer>> {
    return this.mutate(async () => {
      refuseConditionOffLine(list);
      await this.preflight(this.requireIdentity());
      return this.armLocked(list);
    });
  }

  /** `bp` and the next count: short, `[a-z0-9]` only, unique within the instance. */
  private nextTag(): string {
    this.tags += 1;
    return `bp${this.tags}`;
  }

  /**
   * Inside the serial: the kept definitions and the new ones, sent as one set
   * (it replaces the key's set), each with its tag. No validationOnly request
   * is ever made: it replaces the set as well. A failed replacement keeps both
   * lists, and the next change sends them again.
   */
  private async armLocked(
    added: readonly IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointsAnswer>> {
    const identity = this.requireIdentity();
    const dbg = await this.controlDebugger();
    const earlier = new Set(this.requested.map((r) => r.clientId));
    const sent = mergeDefinitions(this.requested, added, () => this.nextTag());
    const changedBefore = this.changed;
    this.changed = true;
    const answer = await withAdtHeaders(
      adtHeadersOf(this.origin),
      'debugger.setBreakpoints',
      (headers) => dbg.setBreakpoints(identity, sent.map(wireOf), { headers }),
    );
    if (!answer.ok) {
      // Our choice on an explicit reading (refusesUser): 403 notAuthorized (measured
      // for a request user that does not exist; from the server source, also a
      // connected user without debug authorisation) or 404 invalidUser placed
      // nothing, so this arming changed nothing — a start takes the before-change
      // branch, a replacement keeps both lists — and SAP's message reaches the
      // model as it is. Any other failure leaves the state unknown.
      if (refusesUser(answer)) {
        this.changed = changedBefore;
        throw failedAt(
          new DebugRefusedError(messageOf(answer)),
          answer,
          'set breakpoints',
        );
      }
      throw failedAt(
        new DebugRequestError(messageOf(answer)),
        answer,
        'set breakpoints',
      );
    }
    const raw = bodyOf(answer);
    const pairing = pairRows(sent, earlier, readBreakpoints(raw));
    this.armed.clear();
    for (const row of pairing.placed) this.armed.set(row.id!, row);
    this.requested = pairing.requested;
    this.pairedWith.clear();
    for (const [id, tag] of pairing.paired) this.pairedWith.set(id, tag);
    return {
      value: {
        placed: pairing.placed,
        refused: pairing.refused,
        lost: pairing.lost,
        unexpected: pairing.unexpected,
      },
      raw,
    };
  }

  /**
   * By id: the breakpoint leaves both lists, and nothing else is sent. Refused
   * before the wire for an id this session does not hold: sent, it would change
   * nothing in `requested`, and the next change would arm it again.
   */
  deleteBreakpoint(id: string): Promise<void> {
    return this.mutate(async () => {
      const identity = this.requireIdentity(); // before a start: not started, not "not armed"
      if (!this.armed.has(id))
        throw new DebugRefusedError(
          `no breakpoint ${id} is armed in this debug session`,
        );
      const answer = await (await this.controlDebugger()).deleteBreakpoint(
        identity,
        id,
      );
      if (!answer.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'delete breakpoint',
        );
      }
      this.forget(id);
    });
  }

  /** The row leaves `armed`, and the definition its tag pairs it with leaves `requested`. */
  private forget(id: string): void {
    this.armed.delete(id);
    const tag = this.pairedWith.get(id);
    this.pairedWith.delete(id);
    if (tag !== undefined)
      this.requested = this.requested.filter((r) => r.clientId !== tag);
  }

  /** Both lists empty: nothing of ours is left armed under the key. */
  private forgetAll(): void {
    this.armed.clear();
    this.requested = [];
    this.pairedWith.clear();
  }

  /**
   * Inside the cleanup, once nothing of ours is armed under the key: the
   * listener is let go. Its open poll is awaited — SAP lets go of the user's
   * listener when it answers it (130–570 ms after a stop, at most the poll's
   * hold, measured on premise 2026-10-11); until then a start of another ideId
   * meets 409 conflictDetected — a catch in it is released, and its
   * connection closes.
   */
  private async retireListener(
    listener: Listener | undefined,
    open: Promise<IAdtResponse<string>> | undefined,
    failures: DebugFailure[],
    skipped: (step: string) => boolean,
  ): Promise<void> {
    this.listener = undefined;
    if (!listener) return;
    if (open) {
      const last = await open;
      listener.open = undefined;
      if (!last.ok) failures.push(failedEntry(last, 'listen'));
      else {
        // A catch in it — during the stop, or just before and not yet handled.
        const caught = readDebuggee(bodyOf(last));
        if (
          caught &&
          !skipped(
            `release a debuggee caught during the stop (${caught.debuggeeId})`,
          )
        )
          await this.releaseCaught(caught, failures);
      }
    }
    await this.closeOrKeep(
      listener.connection,
      "the listener's connection",
      failures,
    );
  }

  /** The definitions every change sends again, as the callers gave them. */
  requestedBreakpoints(): IDebuggerBreakpoint[] {
    return this.requested.map((r) => r.definition);
  }

  listBreakpoints(): BreakpointReading[] {
    return [...this.armed.values()];
  }

  // --- listener -----------------------------------------------------------------
  /**
   * Starts the debug session. The connected user needs debug authorisation
   * (`S_DEVELOP` DEBUG); SAP's refusal of it, or of the request user, reaches
   * the model as SAP says it, and breakpoints are never removed for it.
   */
  start(
    conflict: IDebuggerListenerConflict,
    options: DebugStartOptions,
  ): Promise<DebugState & { breakpoints?: BreakpointsAnswer }> {
    return this.mutate(async () => {
      if (this.listener || this.current)
        throw new DebugStateError(
          'a listener is already running for this debug session',
        );
      // Anything kept for a later stop — an identity, an owed stopListener, armed
      // breakpoints, a failure the cleanup named, a connection not closed, a release
      // owed, a control connection that served the identity — refuses a new start:
      // it would switch the identity over that state, and the next stop would address
      // the old key's breakpoints under the new one.
      if (this.keepsCleanup())
        throw new DebugStateError(
          'the cleanup of this debug session is not complete: DebugStop it, then start again',
        );
      // Refusals before the wire: nothing is opened, nothing is sent.
      // A start arms at least one breakpoint (the user's decision, 2026-10-11): a
      // caller that forgot them learns it here, not from a listener that can catch
      // nothing it asked for.
      // Typed as required; `?? []` gives an untyped caller of the library the same
      // refusal instead of a TypeError.
      const breakpoints = options.breakpoints ?? [];
      if (!breakpoints.length)
        throw new DebugRefusedError('a start needs at least one breakpoint');
      refuseConditionOffLine(breakpoints);
      const identity = await this.identityFor(options);
      this.mode = conflict;
      this.failure = undefined;
      this.fixed = identity;
      this.preferences = { ...(options.settings ?? {}) };
      // The guard above leaves no control connection kept from an earlier run: one
      // there now was opened by this start. Checked all the same, so a refusal before
      // any change can never close one that served another identity.
      const ownControl = this.control === undefined;
      let armed: DebugView<BreakpointsAnswer> | undefined;
      try {
        // 1. the preflight (under refuse, or refuse-if-held); 2. the reconciliation
        // (stated ids only: its stopListener deletes the user's breakpoints and ends
        // a listener another IDE of the user holds, so it runs only after the
        // preflight); 3. the arming, then listening.
        await this.preflight(identity);
        await this.beforeFirstListen(identity);
        armed = await this.armLocked(breakpoints);
        const connection = await this.open();
        const listener: Listener = {
          connection,
          debugger: this.ports.abapDebugger(connection, conflict),
        };
        const generation = ++this.generation;
        this.listener = listener;
        const first = await this.poll(
          listener,
          identity,
          FIRST_POLL_HOLD_SECONDS,
        );
        listener.open = undefined; // handled here
        // A 404 invalidUser on a listen was never measured; it is read like the 403.
        if (!first.ok && refusesUser(first)) {
          // Our choice on an explicit reading (refusesUser), a safety net: after an
          // arming the system accepted, a conforming server does not refuse the listen
          // for the user (setBreakpoints checks the same authorisation). If it does,
          // the start is refused with SAP's message and nothing is rolled back: the
          // breakpoints are not ours to remove for a lack of rights — whoever has the
          // rights debugs them — so no stopListener and no deletion. They stay on the
          // system, the answer names them, and the session lets go of them: the
          // before-change branch below closes what this start opened and ends it.
          const placed = this.listBreakpoints();
          this.forgetAll();
          this.changed = false;
          const kept = `the breakpoints placed stay on the system: ${placed.map(describePlaced).join(', ')}`;
          const refused = failedAt(
            new DebugRefusedError(
              placed.length ? `${messageOf(first)}; ${kept}` : messageOf(first),
              placed,
            ),
            first,
            'listen',
          );
          if (placed.length) noteLeftBehind(refused, kept);
          throw refused;
        }
        // The arming changed the system already, so any other failed listen
        // takes the cleanup after a change.
        if (!first.ok) throw listenerError(first, 'listen');
        this.changed = true;
        const caught = readDebuggee(bodyOf(first));
        if (caught) await this.attachTo(caught, bodyOf(first), generation);
        if (!this.current && this.owns(listener, generation))
          void this.loop(listener, generation);
        if (options.run && this.owns(listener, generation))
          this.startRun(options.run, generation);
        // Inside the protected part: an attach that failed is reported here (report() throws its failure).
        return {
          ...this.report(),
          ...(armed ? { breakpoints: armed.value } : {}),
        };
      } catch (error) {
        if (!this.changed) {
          // Refused before any change — a preflight 409, a failure of the preflight
          // itself, an arming refused for the user, or a first listen refused for the
          // user (its breakpoints are left to the system, see above). No
          // stopListener and no deletion: only the connections this start opened close.
          // A close that fails is kept like any other cleanup failure: the identity
          // stays, a new start is refused, DebugStop finishes it.
          const failures = [
            ...(await this.dropListener()),
            ...(ownControl ? await this.closeControl() : []),
          ];
          this.settle(failures);
          if (failures.length === 0) throw error;
          const notClosed = `not closed: ${describeFailures(failures)}`;
          const failed =
            error instanceof Error
              ? error
              : new DebugListenerError(thrown(error));
          leaveBehind(failed, { message: 'not closed', failures });
          failed.message = `${failed.message}; ${notClosed}`;
          throw failed;
        }
        // A start that failed after a change runs the stop's cleanup. It no longer
        // deletes the ids "placed here": after a replacement they do not say what this
        // start added.
        this.cleanupNotes = [];
        // A start the credential refused: its cleanup sends nothing — every
        // request would be refused again — and names what it did not attempt.
        const refusedStart = credentialEntryOf(error);
        const failures = await this.cleanupLocked(refusedStart);
        const notes = this.cleanupNotes.splice(0);
        this.failure = undefined;
        this.notices.length = 0;
        this.settle(failures, this.cleanupNotAttempted);
        if (refusedStart)
          throw new DebugCleanupError(
            [refusedStart, ...failures],
            notes,
            this.cleanupNotAttempted,
          );
        if (notes.length === 0 && failures.length === 0) throw error;
        const told = [
          ...(notes.length ? [describeFailures(notes)] : []),
          ...(failures.length
            ? [`not undone: ${describeFailures(failures)}`]
            : []),
        ].join('; ');
        const failed =
          error instanceof Error
            ? error
            : new DebugListenerError(thrown(error));
        leaveBehind(failed, {
          ...(failures.length ? { message: 'not undone', failures } : {}),
          ...(notes.length ? { notes } : {}),
        });
        failed.message = `${failed.message}; ${told}`;
        throw failed;
      }
    });
  }

  private poll(
    listener: Listener,
    identity: IDebuggerIdentity,
    holdSeconds: number,
  ): Promise<IAdtResponse<string>> {
    const sent = listener.debugger.listen(identity, { holdSeconds });
    const answer = sent.catch(asFailure);
    // Marked on the answer itself, the first tick after it comes.
    const settle = () => settledPolls.add(answer);
    sent.then(settle, settle);
    listener.open = answer; // cleared once its answer is handled (onPoll, start)
    return answer;
  }

  /** Never rejects: whatever throws in it becomes the listener's failure, reported by the next wait. */
  private async loop(listener: Listener, generation: number): Promise<void> {
    try {
      const identity = this.requireIdentity();
      for (;;) {
        if (!this.owns(listener, generation) || this.current) return;
        const answer = await this.poll(listener, identity, LISTEN_HOLD_SECONDS);
        const goOn = await this.mutate(() =>
          this.onPoll(listener, generation, answer),
        );
        if (!goOn) return;
      }
    } catch (error) {
      // Only a loop that still owns the current generation records anything: a stale one
      // (stopped, dropped or superseded) changes nothing. A listener this loop dropped itself
      // already has its failure set.
      if (this.owns(listener, generation)) {
        if (this.failure === undefined) {
          this.failure = thrown(error);
          this.failedListen = listenerThrown(error, 'listen');
        }
        await this.dropListener(); // a close that throws is kept and recorded
      }
      this.notify();
    }
  }

  private async onPoll(
    listener: Listener,
    generation: number,
    answer: IAdtResponse<string>,
  ): Promise<boolean> {
    if (!this.owns(listener, generation)) return false; // a stop took it, and its answer
    listener.open = undefined; // handled here
    if (!answer.ok) {
      const failed = listenerError(answer, 'listen');
      this.failure = failed.message;
      this.failedListen = failed;
      await this.dropListener();
      this.notify();
      return false;
    }
    const raw = bodyOf(answer);
    const debuggee = readDebuggee(raw);
    if (!debuggee) return true;
    const attached = await this.attachTo(debuggee, raw, generation);
    this.notify();
    return !attached && this.owns(listener, generation);
  }

  /** Runs inside the serial. True when a stop now exists. */
  private async attachTo(
    debuggee: DebuggeeReading,
    rawDebuggee: string,
    generation: number,
  ): Promise<boolean> {
    // SAP says this catch cannot be attached: report it as SAP decided instead of a failed attach.
    // The listener goes on polling; the run continues as SAP decides.
    if (debuggee.attachImpossible) {
      this.notices.push({
        state: 'ended',
        reason: 'attach_impossible',
        message: 'the debuggee cannot be attached (SAP: attach impossible)',
      });
      return false;
    }
    let connection: IAbapConnection | undefined;
    try {
      const identity = this.requireIdentity();
      connection = await this.open();
      const dbg = this.ports.abapDebugger(connection, this.mode);
      const attached = await dbg.attach(
        identity,
        debuggee.debuggeeId,
        debuggee.instance ? { server: debuggee.instance } : {},
      );
      if (!attached.ok) {
        this.notices.push({
          state: 'ended',
          reason: 'attach_refused',
          failure: failedEntry(attached, 'attach'),
        });
        await this.closeOrRecord(connection, "the debuggee's connection");
        return false;
      }
      if (generation !== this.generation) {
        // Overtaken while attaching: released at once. A release that fails is recorded,
        // and the debuggee is kept with its connection for the next stop to release.
        const notReleased = await this.release(dbg, 'the debuggee');
        if (notReleased) {
          this.cleanupFailures.push(notReleased);
          this.owed.add({ connection, debugger: dbg, what: 'the debuggee' });
        } else
          await this.closeOrRecord(connection, "the debuggee's connection");
        return false;
      }
      const stack = await dbg.getStack();
      this.current = {
        connection,
        debugger: dbg,
        view: {
          debuggee,
          attach: readAttach(bodyOf(attached)),
          stack: stack.ok
            ? readStack(bodyOf(stack))
            : { cursor: 0, frames: [] },
          ...(stack.ok ? {} : { stackError: failedEntry(stack, 'read stack') }),
          raw: {
            debuggee: rawDebuggee,
            attach: bodyOf(attached),
            stack: bodyOf(stack),
          },
        },
      };
      // A new attach: the previous one's settings are not this stop's.
      this.effective = undefined;
      // The preferences after each attach; a failure leaves the stop standing and is named.
      if (Object.keys(this.preferences).length > 0) {
        const stop = this.current;
        await this.applySettings(stop).catch((e: unknown) => {
          stop.view = {
            ...stop.view,
            settingsError: thrownFailure(e, 'set settings'),
          };
        });
      }
      return true;
    } catch (error) {
      // The failure and the drop below happen whatever the close does; a close that throws is kept.
      await this.closeOrRecord(connection, "the debuggee's connection");
      this.failure = thrown(error);
      this.failedListen = listenerThrown(error, 'attach');
      await this.dropListener();
      return false;
    }
  }

  /** Lets an attached debuggee run on. Never throws: answers why it was not released. */
  private async release(
    dbg: Debugger,
    what: string,
  ): Promise<DebugFailure | undefined> {
    const released = await dbg
      .step('stepContinue', { analyse: analyseDebuggeeEnd })
      .catch(asFailure);
    return released.ok ? undefined : failedEntry(released, `release ${what}`);
  }

  /**
   * Inside stop: a poll answered with a catch that no session will work. It is
   * attached on a connection of its own and released at once, so it does not wait
   * for the system to let it go (unattached, it is held about 30 seconds). An attach
   * after the listener was stopped succeeds (measured on premise, 2026-10-11); a
   * failure is answered all the same. Never throws.
   */
  private async releaseCaught(
    debuggee: DebuggeeReading,
    failures: DebugFailure[],
  ): Promise<void> {
    if (debuggee.attachImpossible) return; // the system decided: it runs on by itself
    const what = `a debuggee caught during the stop (${debuggee.debuggeeId})`;
    let connection: IAbapConnection | undefined;
    try {
      const identity = this.requireIdentity();
      connection = await this.open();
      const dbg = this.ports.abapDebugger(connection, this.mode);
      const attached = await dbg
        .attach(
          identity,
          debuggee.debuggeeId,
          debuggee.instance ? { server: debuggee.instance } : {},
        )
        .catch(asFailure);
      if (!attached.ok) failures.push(failedEntry(attached, `attach ${what}`));
      else {
        const notReleased = await this.release(dbg, what);
        if (notReleased) {
          // Kept with the session that attached it: the next stop retries the release there.
          failures.push(notReleased);
          this.owed.add({ connection, debugger: dbg, what });
          return;
        }
      }
    } catch (error) {
      failures.push(thrownFailure(error, `release ${what}`));
    }
    await this.closeOrKeep(connection, `${what}'s connection`, failures);
  }

  /** Never throws: a close that throws is kept for the next stop, recorded, and answered. */
  protected async dropListener(): Promise<DebugFailure[]> {
    const listener = this.listener;
    this.listener = undefined;
    this.generation++;
    const kept = await this.closeOrRecord(
      listener?.connection,
      "the listener's connection",
    );
    return kept ? [kept] : [];
  }

  // --- waiting ----------------------------------------------------------------
  async wait(holdSeconds = 10): Promise<DebugState> {
    const ms = Math.min(Math.max(holdSeconds, 0), WAIT_MAX_SECONDS) * 1000;
    const ready = () =>
      this.failure !== undefined ||
      this.notices.length > 0 ||
      !!this.current ||
      !this.listener;
    if (!ready() && ms > 0) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        this.waiters.add(done);
      });
    }
    return this.report();
  }

  protected report(): DebugState {
    if (this.failure !== undefined) {
      const message = this.failure;
      const carried = this.failedListen;
      this.failure = undefined;
      this.failedListen = undefined;
      this.observer?.(); // consuming it may leave nothing held
      throw carried !== undefined && carried.message === message
        ? carried
        : new DebugListenerError(message);
    }
    const notice = this.notices.shift();
    if (notice) {
      this.observer?.();
      return notice;
    }
    if (this.current) return { state: 'stopped', stop: this.current.view };
    return this.listener ? { state: 'listening' } : { state: 'idle' };
  }

  // --- the stop -------------------------------------------------------------------
  protected requireStop(): Stop {
    if (!this.current)
      throw new DebugStateError('no debuggee is stopped in this debug session');
    return this.current;
  }

  /** Inside the serial: the stop ended; resume the listener. */
  protected async releaseStop(stop: Stop): Promise<void> {
    if (this.current !== stop) return;
    this.current = undefined;
    await this.close(stop.connection);
    const listener = this.listener;
    if (listener && this.failure === undefined)
      void this.loop(listener, this.generation);
  }

  private async afterMove(
    stop: Stop,
    answer: IAdtResponse<unknown>,
    step: string,
  ): Promise<DebugState> {
    if (!answer.ok) {
      throw failedAt(new DebugRequestError(messageOf(answer)), answer, step);
    }
    const end = readDebuggeeEnd(bodyOf(answer));
    if (end) {
      await this.releaseStop(stop);
      return {
        state: 'ended',
        reason: end === 'terminateDebuggee' ? 'terminated' : 'debuggee_ended',
      };
    }
    const stack = await stop.debugger.getStack();
    stop.view = {
      ...stop.view,
      // The step answer does not carry isPostMortem; the stop's own stays.
      attach: {
        ...readAttach(bodyOf(answer)),
        isPostMortem: stop.view.attach.isPostMortem,
      },
      stack: stack.ok ? readStack(bodyOf(stack)) : stop.view.stack,
      ...(stack.ok
        ? { stackError: undefined }
        : { stackError: failedEntry(stack, 'read stack') }),
      raw: { ...stop.view.raw, stack: bodyOf(stack) },
    };
    return { state: 'stopped', stop: stop.view };
  }

  step(method: IDebuggerStepMethod): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterMove(
        stop,
        await stop.debugger.step(method, { analyse: analyseDebuggeeEnd }),
        'step',
      );
    });
  }

  stepToLine(
    method: IDebuggerStepToLineMethod,
    uri: string,
  ): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterMove(
        stop,
        await stop.debugger.stepToLine(method, uri, {
          analyse: analyseDebuggeeEnd,
        }),
        'step to line',
      );
    });
  }

  /** The default strategy answers nothing for `done`: success is the end itself. */
  terminate(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.terminateDebuggee({
        analyse: analyseDebuggeeEnd,
      });
      if (!answer.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'terminate debuggee',
        );
      }
      await this.releaseStop(stop);
      return { state: 'ended', reason: 'terminated' };
    });
  }

  /** The debugger leaves and the program runs on; an armed breakpoint can catch it again. */
  detach(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.detachDebugger();
      if (!answer.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'detach',
        );
      }
      await this.leaveStop(stop, 'close');
      return this.report();
    });
  }

  /** Frees the debugger; the program runs on, and the session listens on. */
  releaseDebugger(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      // terminateDebugger frees this ABAP session, and the system answers that with a
      // plain ICF 500 (errata "The debugger freeing its session is answered as an ICF
      // 500", measured on premise (2026-10-11), BASIS 816): analyseDebuggerFreed takes
      // exactly that shape as no failure. An ADT document, an HTML 500 or a 400 stay
      // failures, and the attachment is kept for DebugStop.
      const answer = await stop.debugger.terminateDebugger({
        analyse: analyseDebuggerFreed,
      });
      if (!answer.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'terminate debugger',
        );
      }
      await this.leaveStop(stop, 'drop');
      return this.report();
    });
  }

  /**
   * Inside the serial: the stop is left — its connection closed (a close that
   * throws is kept and recorded), or, freed by the system, dropped without a
   * request — and the listener polls again. The breakpoints stay.
   */
  private async leaveStop(stop: Stop, how: 'close' | 'drop'): Promise<void> {
    if (this.current !== stop) return;
    this.current = undefined;
    if (how === 'drop') this.ports.dropConnection(stop.connection);
    else await this.closeOrRecord(stop.connection, "the debuggee's connection");
    const listener = this.listener;
    if (listener && this.failure === undefined)
      void this.loop(listener, this.generation);
  }

  getStack(): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const read = stackView(stop, await stop.debugger.getStack());
      stop.view = read.value;
      return read;
    });
  }

  setStackPosition(position: number): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const moved = await stop.debugger.setStackPosition(position);
      if (!moved.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(moved)),
          moved,
          'set stack position',
        );
      }
      const stack = await stop.debugger.getStack();
      if (!stack.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(stack)),
          stack,
          'read stack',
        );
      }
      stop.view = {
        ...stop.view,
        stack: readStack(bodyOf(stack)),
        raw: { ...stop.view.raw, stack: bodyOf(stack) },
      };
      return { value: stop.view, raw: bodyOf(stack) };
    });
  }

  private variables(
    step: string,
    call: (d: Debugger) => Promise<IAdtResponse<string>>,
  ): Promise<DebugView<VariablesReading>> {
    return this.mutate(async () =>
      variablesView(await call(this.requireStop().debugger), step),
    );
  }
  getVariables(names: string[]) {
    return this.variables('read variables', (d) =>
      readVariablesOf(adtHeadersOf(this.origin), d, names),
    );
  }
  getChildVariables(parents: string[]) {
    return this.variables('read child variables', (d) =>
      readChildVariablesOf(adtHeadersOf(this.origin), d, parents),
    );
  }
  setVariable(name: string, value: string) {
    return this.variables('set variable', (d) =>
      writeVariableOf(d, name, value),
    );
  }

  // --- the debugger batch (spec §7) ---------------------------------------------
  /**
   * The debugger batch of the stop: an `AdtBatchConnection` with endpoint
   * `debugger` over the stop's connection — the attached stateful session —
   * whose envelope goes out on it. Sends nothing; refused with no stop.
   */
  openBatch(
    options: {
      logger?: ILogger;
      /** What the batch's envelopes go out through, placed over the connection (the envelope watch). */
      through?: (connection: IAbapConnection) => IAbapConnection;
    } = {},
  ): AdtBatchConnection {
    const stop = this.requireStop();
    return new AdtBatchConnection(
      options.through?.(stop.connection) ?? stop.connection,
      {
        endpoint: 'debugger',
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      },
    );
  }

  /**
   * The batch path: each `record…` checks there is a stop and sends its one
   * request on a fresh debugger over `recorder` — a per-call recorder of the
   * debugger batch — so the request is recorded and its answer comes when
   * the batch is sent. It runs outside the serial: the second recorded call
   * records while the first waits for its answer. Nothing of the stop
   * changes: its view and its connection stay as they are, whatever the
   * answer says.
   */
  private batchDebugger(recorder: IAbapConnection): {
    stop: Stop;
    debugger: Debugger;
  } {
    const stop = this.requireStop();
    return { stop, debugger: this.ports.abapDebugger(recorder, this.mode) };
  }
  /** Batch path: a step, answered with SAP's step result, or the end it reports. */
  async recordStep(
    recorder: IAbapConnection,
    method: IDebuggerStepMethod,
  ): Promise<DebugView<OnceStep>> {
    const { stop, debugger: dbg } = this.batchDebugger(recorder);
    return this.afterStepOnce(
      stop,
      await dbg.step(method, { analyse: analyseDebuggeeEnd }),
      'step',
    );
  }
  /** Batch path: run or jump to the line `uri` names. */
  async recordStepToLine(
    recorder: IAbapConnection,
    method: IDebuggerStepToLineMethod,
    uri: string,
  ): Promise<DebugView<OnceStep>> {
    const { stop, debugger: dbg } = this.batchDebugger(recorder);
    return this.afterStepOnce(
      stop,
      await dbg.stepToLine(method, uri, { analyse: analyseDebuggeeEnd }),
      'step to line',
    );
  }
  /** Batch path: the stack, answered in the stop's view; the stop's own view stays. */
  async recordStack(recorder: IAbapConnection): Promise<DebugView<StopView>> {
    const { stop, debugger: dbg } = this.batchDebugger(recorder);
    return stackView(stop, await dbg.getStack());
  }
  /** Batch path: the variables by name. */
  async recordVariables(
    recorder: IAbapConnection,
    names: string[],
  ): Promise<DebugView<VariablesReading>> {
    const { debugger: dbg } = this.batchDebugger(recorder);
    return variablesView(
      await readVariablesOf(adtHeadersOf(this.origin), dbg, names),
      'read variables',
    );
  }
  /** Batch path: the members of `parents`. */
  async recordChildVariables(
    recorder: IAbapConnection,
    parents: string[],
  ): Promise<DebugView<VariablesReading>> {
    const { debugger: dbg } = this.batchDebugger(recorder);
    return variablesView(
      await readChildVariablesOf(adtHeadersOf(this.origin), dbg, parents),
      'read child variables',
    );
  }
  /** Batch path: the frame variables are read in. */
  async recordStackPosition(
    recorder: IAbapConnection,
    position: number,
  ): Promise<DebugView<{ position: number }>> {
    const { debugger: dbg } = this.batchDebugger(recorder);
    return positionView(await dbg.setStackPosition(position), position);
  }
  /** Batch path: a variable set to `value`. */
  async recordSetVariable(
    recorder: IAbapConnection,
    name: string,
    value: string,
  ): Promise<DebugView<VariablesReading>> {
    const { debugger: dbg } = this.batchDebugger(recorder);
    return variablesView(
      await writeVariableOf(dbg, name, value),
      'set variable',
    );
  }

  private document(
    step: string,
    call: (d: Debugger) => Promise<IAdtResponse<unknown>>,
  ): Promise<DebugView<string>> {
    return this.mutate(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) {
        throw failedAt(new DebugRequestError(messageOf(answer)), answer, step);
      }
      return { value: bodyOf(answer), raw: bodyOf(answer) };
    });
  }
  createWatchpoint(name: string, condition?: string) {
    return this.document('create watchpoint', (d) =>
      d.createWatchpoint(name.toUpperCase(), condition ? { condition } : {}),
    );
  }
  listWatchpoints() {
    return this.document('list watchpoints', (d) => d.listWatchpoints());
  }
  async deleteWatchpoint(id: string) {
    await this.document('delete watchpoint', (d) => d.deleteWatchpoint(id));
  }
  getMemorySizes() {
    return this.document('read memory sizes', (d) => d.getMemorySizes());
  }
  createMemorySnapshot() {
    return this.document('create memory snapshot', (d) =>
      d.createMemorySnapshot(),
    );
  }

  // --- one request per call (the compact debugger) -----------------------------
  /**
   * Each method below sends exactly one `AbapDebugger` request and answers what
   * SAP answered, read; nothing is sent around it and nothing runs after it in
   * the background — no listen loop, no attach on a catch, no stack read after
   * a step. Connections are opened when a role first needs one (an open sends
   * nothing) and kept until `endOnce` or the cleanup, which close them, so no
   * other call sends a logoff.
   */
  /** The listener connection of the one-request path, and its listen while one is open. */
  private onceListener?: {
    connection: IAbapConnection;
    open?: Promise<IAdtResponse<string>>;
  };
  /** The attaching session of the one-request path, opened by its first attach: every attach goes on it. */
  private onceAttaching?: { connection: IAbapConnection; debugger: Debugger };

  /**
   * The identity in force, or one fixed now from the call's arguments. A call
   * that states another request user or mode than the fixed one is refused
   * before the wire.
   */
  private async onceIdentity(
    options: OnceIdentity,
  ): Promise<IDebuggerIdentity> {
    if (!this.fixed) {
      this.fixed = await this.identityFor(options);
      return this.fixed;
    }
    const fixed = this.fixed;
    if (
      options.debuggingMode !== undefined &&
      options.debuggingMode !== fixed.debuggingMode
    )
      throw new DebugRefusedError(
        `debugging_mode: this debug session is in ${fixed.debuggingMode} mode`,
      );
    if (options.requestUser !== undefined) {
      const named = options.requestUser.trim().toUpperCase();
      if (fixed.debuggingMode !== 'user' || named !== fixed.requestUser)
        throw new DebugRefusedError(
          fixed.debuggingMode === 'user'
            ? `request_user: this debug session debugs ${fixed.requestUser}`
            : 'request_user does not apply to terminal mode: the system reads no request user there',
        );
    }
    return fixed;
  }

  /** The control connection's debugger, under the conflict behaviour asked for. */
  private async onceControl(conflict: IDebuggerListenerConflict) {
    await this.controlDebugger();
    const control = this.control as Listener;
    return this.ports.abapDebugger(control.connection, conflict);
  }

  /** One request: whether another debugger holds this identity's debugging (409 is the conflict). */
  checkListenerOnce(
    options: OnceIdentity,
  ): Promise<DebugView<{ conflict: false }>> {
    return this.mutate(async () => {
      const identity = await this.onceIdentity(options);
      const answer = await (await this.onceControl('refuse')).checkListener(
        identity,
      );
      if (!answer.ok) throw listenerError(answer, 'check listener');
      return { value: { conflict: false }, raw: bodyOf(answer) };
    });
  }

  /** One request: the identity's breakpoint set replaced by `list`; the rows SAP answered. */
  setBreakpointsOnce(
    options: OnceIdentity,
    list: IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointReading[]>> {
    return this.mutate(async () => {
      refuseConditionOffLine(list);
      const identity = await this.onceIdentity(options);
      const dbg = await this.onceControl(this.mode);
      this.changed = true;
      const answer = await withAdtHeaders(
        adtHeadersOf(this.origin),
        'debugger.setBreakpoints',
        (headers) => dbg.setBreakpoints(identity, list, { headers }),
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'set breakpoints',
        );
      const rows = readBreakpoints(bodyOf(answer));
      this.armed.clear();
      for (const row of rows) if (row.id) this.armed.set(row.id, row);
      return { value: rows, raw: bodyOf(answer) };
    });
  }

  /** One request: the full set, or the named objects' part of it, replaced; the rows SAP answered. */
  syncBreakpointsOnce(
    options: OnceIdentity,
    sync: IDebuggerBreakpointSync,
  ): Promise<DebugView<BreakpointReading[]>> {
    return this.mutate(async () => {
      refuseConditionOffLine(sync.breakpoints);
      const identity = await this.onceIdentity(options);
      const dbg = await this.onceControl(this.mode);
      this.changed = true;
      const answer = await withAdtHeaders(
        adtHeadersOf(this.origin),
        'debugger.syncBreakpoints',
        (headers) => dbg.syncBreakpoints(identity, sync, { headers }),
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'sync breakpoints',
        );
      const rows = readBreakpoints(bodyOf(answer));
      if (sync.scope === 'full') this.armed.clear();
      for (const row of rows) if (row.id) this.armed.set(row.id, row);
      return { value: rows, raw: bodyOf(answer) };
    });
  }

  /** One request: the breakpoint `id` deleted. */
  deleteBreakpointOnce(
    options: OnceIdentity,
    id: string,
  ): Promise<DebugView<{ deleted: string }>> {
    return this.mutate(async () => {
      const identity = await this.onceIdentity(options);
      const answer = await (await this.onceControl(this.mode)).deleteBreakpoint(
        identity,
        id,
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'delete breakpoint',
        );
      this.forget(id);
      return { value: { deleted: id }, raw: bodyOf(answer) };
    });
  }

  /** One request: the identity's listener stopped, which deletes its breakpoints. */
  stopListenerOnce(
    options: OnceIdentity,
  ): Promise<DebugView<{ stopped: true }>> {
    return this.mutate(async () => {
      const identity = await this.onceIdentity(options);
      const answer = await (await this.onceControl(this.mode)).stopListener(
        identity,
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'stop listener',
        );
      this.forgetAll();
      this.changed = false;
      return { value: { stopped: true }, raw: bodyOf(answer) };
    });
  }

  /**
   * One request: a listen SAP holds for exactly `holdSeconds`, answered with
   * the debuggee it caught or empty. It runs outside the serial, so the other
   * calls go on while it holds.
   */
  async listenOnce(
    options: OnceIdentity,
    holdSeconds: number,
    conflict: IDebuggerListenerConflict,
  ): Promise<DebugView<DebuggeeReading | { caught: false }>> {
    const { identity, dbg, listener } = await this.mutate(async () => {
      const identity = await this.onceIdentity(options);
      if (!this.onceListener)
        this.onceListener = { connection: await this.open() };
      this.changed = true;
      return {
        identity,
        listener: this.onceListener,
        dbg: this.ports.abapDebugger(this.onceListener.connection, conflict),
      };
    });
    let open: Promise<IAdtResponse<string>> | undefined;
    try {
      const sent = dbg.listen(identity, { holdSeconds });
      open = sent.catch(asFailure);
      listener.open = open;
      const answer = await sent;
      if (!answer.ok) throw listenerError(answer, 'listen');
      const caught = readDebuggee(bodyOf(answer));
      return { value: caught ?? { caught: false }, raw: bodyOf(answer) };
    } finally {
      if (listener.open === open) listener.open = undefined;
      this.notify();
    }
  }

  /**
   * One request: the debuggee attached on the attaching session — opened by the
   * first attach, the same session for every later one — which serves every
   * step and reading.
   */
  attachOnce(
    options: OnceIdentity,
    debuggeeId: string,
    server?: string,
  ): Promise<DebugView<AttachReading>> {
    return this.mutate(async () => {
      const identity = await this.onceIdentity(options);
      if (!this.onceAttaching) {
        const connection = await this.open();
        this.onceAttaching = {
          connection,
          debugger: this.ports.abapDebugger(connection, this.mode),
        };
      }
      const { connection, debugger: dbg } = this.onceAttaching;
      const answer = await dbg.attach(
        identity,
        debuggeeId,
        server ? { server } : {},
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'attach',
        );
      const attach = readAttach(bodyOf(answer));
      this.current = {
        connection,
        debugger: dbg,
        once: true,
        view: {
          debuggee: attachedDebuggee(debuggeeId, server),
          attach,
          stack: { cursor: 0, frames: [] },
          raw: { debuggee: '', attach: bodyOf(answer), stack: '' },
        },
      };
      this.effective = undefined;
      return { value: attach, raw: bodyOf(answer) };
    });
  }

  /** One request: a step, answered with SAP's step result, or the end it reports. */
  stepOnce(method: IDebuggerStepMethod): Promise<DebugView<OnceStep>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterStepOnce(
        stop,
        await stop.debugger.step(method, { analyse: analyseDebuggeeEnd }),
        'step',
      );
    });
  }

  /** One request: run or jump to the line `uri` names. */
  stepToLineOnce(
    method: IDebuggerStepToLineMethod,
    uri: string,
  ): Promise<DebugView<OnceStep>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterStepOnce(
        stop,
        await stop.debugger.stepToLine(method, uri, {
          analyse: analyseDebuggeeEnd,
        }),
        'step to line',
      );
    });
  }

  private afterStepOnce(
    stop: Stop,
    answer: IAdtResponse<unknown>,
    step: string,
  ): DebugView<OnceStep> {
    if (!answer.ok)
      throw failedAt(new DebugRequestError(messageOf(answer)), answer, step);
    const raw = bodyOf(answer);
    const end = readDebuggeeEnd(raw);
    if (end) {
      return {
        value: {
          ended: end === 'terminateDebuggee' ? 'terminated' : 'debuggee_ended',
        },
        raw,
      };
    }
    return { value: { step: readAttach(raw) }, raw };
  }

  /** One request: the frame variables are read in. */
  setStackPositionOnce(
    position: number,
  ): Promise<DebugView<{ position: number }>> {
    return this.mutate(async () =>
      positionView(
        await this.requireStop().debugger.setStackPosition(position),
        position,
      ),
    );
  }

  /** One request: `detachDebugger` without an id, on the attaching session — the debuggee runs on. */
  detachOnce(): Promise<DebugView<{ detached: true }>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.detachDebugger();
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'detach',
        );
      return { value: { detached: true }, raw: bodyOf(answer) };
    });
  }

  /** One request: the debuggee ended where it stands. */
  terminateDebuggeeOnce(): Promise<DebugView<{ terminated: true }>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      // SAP's answer as it came: a 500 that SAP sends when it succeeded reaches the caller.
      const answer = await stop.debugger.terminateDebuggee({
        analyse: analyseException,
      });
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'terminate debuggee',
        );
      return { value: { terminated: true }, raw: bodyOf(answer) };
    });
  }

  /** One request: the debugger freed; the program runs on and the attaching session ends. */
  terminateDebuggerOnce(): Promise<DebugView<{ freed: true }>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      // SAP's answer as it came: a 500 that SAP sends when it succeeded reaches the caller.
      const answer = await stop.debugger.terminateDebugger({
        analyse: analyseException,
      });
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'terminate debugger',
        );
      return { value: { freed: true }, raw: bodyOf(answer) };
    });
  }

  /** One request: the settings given, sent once; the settings SAP answered in force. */
  setDebuggerSettingsOnce(
    settings: DebugSettings,
  ): Promise<DebugView<SettingsReading>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await withAdtHeaders(
        adtHeadersOf(this.origin),
        'debugger.setDebuggerSettings',
        (headers) => stop.debugger.setDebuggerSettings(settings, { headers }),
      );
      if (!answer.ok)
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'set settings',
        );
      const raw = bodyOf(answer);
      this.effective = readSettings(raw);
      return { value: this.effective, raw };
    });
  }

  /**
   * The end of the one-request path: one logoff per connection the debug state
   * opened — the attaching session (an attached debuggee runs on), the
   * listener, the control connection — and nothing else: no
   * stopListener, no detach, no release step. The user's breakpoints stay set
   * on the system until a stopListener of that user (measured 2026-10-17).
   * Then everything the state held is forgotten, the identity with it. A close
   * that throws keeps its connection for a later end or stop, and is answered.
   */
  endOnce(): Promise<DebugView<{ ended: true; logoffs: number }>> {
    return this.mutate(async () => {
      const failures: DebugFailure[] = [];
      let logoffs = 0;
      const close = async (c: IAbapConnection | undefined, what: string) => {
        if (!c) return;
        logoffs += 1;
        await this.closeOrKeep(c, what, failures);
      };
      const attaching = this.onceAttaching;
      this.onceAttaching = undefined;
      const stop = this.current;
      this.current = undefined;
      await close(attaching?.connection, "the debuggee's connection");
      if (stop && stop.connection !== attaching?.connection)
        await close(stop.connection, "the debuggee's connection");
      const listener = this.onceListener;
      this.onceListener = undefined;
      await close(listener?.connection, "the listener's connection");
      const control = this.control;
      this.control = undefined;
      await close(control?.connection, "the breakpoints' connection");
      for (const connection of [...this.unclosed])
        await close(connection, 'a connection');
      this.forgetAll();
      this.changed = false;
      this.fixed = undefined;
      this.preferences = {};
      this.effective = undefined;
      this.cleanupFailures = failures;
      if (failures.length) throw new DebugCleanupError(failures);
      return { value: { ended: true, logoffs }, raw: '' };
    });
  }

  // --- lifecycle -------------------------------------------------------------
  private run?: { generation: number; connection?: IAbapConnection };
  private reconciled = false;
  private cleanupFailures: DebugFailure[] = [];
  /** What the current cleanup has to tell that is no debt: SAP's final refusal of the stopListener. */
  private cleanupNotes: DebugFailure[] = [];
  /** The steps the last cleanup did not attempt once the credential was refused. */
  private cleanupNotAttempted: string[] = [];
  /** Connections whose work is done but whose close threw: the next stop closes them. */
  private readonly unclosed = new Set<IAbapConnection>();
  /** Attached debuggees whose release failed, each with its connection: the next stop retries. */
  private readonly owed = new Set<OwedRelease>();

  /** Inside stop: a close that throws keeps the connection for the next stop and is named. */
  private async closeOrKeep(
    connection: IAbapConnection | undefined,
    what: string,
    failures: DebugFailure[],
  ): Promise<void> {
    if (!connection) return;
    try {
      await this.close(connection);
      this.unclosed.delete(connection);
    } catch (e) {
      this.unclosed.add(connection);
      failures.push(thrownFailure(e, `close ${what}`));
    }
  }

  /**
   * Outside stop: the same keep-for-retry close, recorded in failures() so
   * the state stays held until a stop closes it. Never throws; answers the failure.
   */
  private async closeOrRecord(
    connection: IAbapConnection | undefined,
    what: string,
  ): Promise<DebugFailure | undefined> {
    const failures: DebugFailure[] = [];
    await this.closeOrKeep(connection, what, failures);
    this.cleanupFailures.push(...failures);
    return failures[0];
  }

  protected async beforeFirstListen(
    identity: IDebuggerIdentity,
  ): Promise<void> {
    // Only a stated id can have a predecessor; in terminal mode it takes a stated
    // terminal id. Whether a stop under a stated terminal id and a random IDE id
    // reaches a predecessor's terminal-mode listener is not measured.
    const stated =
      identity.debuggingMode === 'terminal'
        ? this.ids.terminalStated
        : this.ids.stated;
    if (!stated || this.reconciled) return;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    // It counts as done only once the request was sent: a start that failed before it retries.
    // stopListener deletes the key's breakpoints too, which the arming then replaces.
    // A connection that cannot be opened sends nothing: that start failed before any change.
    const control = await this.controlDebugger();
    this.changed = true;
    // A credential failure ends the start as it came; any other is no failure.
    await control.stopListener(identity).catch(unlessCredentialFailure);
    this.reconciled = true;
  }

  /**
   * The ids our own run carries under terminal mode, so the listener under
   * them catches it; none in user mode, where the request user is the key.
   */
  protected debuggeeIds(): IDebuggeeIds | undefined {
    const identity = this.fixed;
    return identity?.debuggingMode === 'terminal'
      ? { terminalId: identity.terminalId, ideId: identity.ideId }
      : undefined;
  }

  protected startRun(target: RunTarget, generation: number): void {
    this.run = { generation };
    // Taken now: the identity this start fixed, whatever a later stop clears.
    const debuggee = this.debuggeeIds();
    void (async () => {
      let connection: IAbapConnection | undefined;
      let outcome: RunOutcome | undefined;
      try {
        // A run is one request: a stateless session (measured 2026-10-17: a
        // run on a stateless connection is caught and held as any).
        connection = await this.open('stateless');
        if (this.run?.generation === generation) {
          this.run.connection = connection;
          outcome = await this.ports.run(connection, target, debuggee);
        }
      } catch (error) {
        outcome = { ok: false, message: thrown(error) };
      }
      // A close that throws keeps the connection for the next stop and is recorded.
      await this.closeOrRecord(connection, "the run's connection");
      if (outcome && this.run?.generation === generation) {
        this.run = undefined;
        this.notices.push({
          state: 'ended',
          reason: 'run_finished',
          run: outcome,
        });
      }
      this.notify();
    })().catch(() => this.notify());
  }

  /** The settings the caller set, kept until a complete cleanup. */
  preferredSettings(): DebugSettings {
    return { ...this.preferences };
  }

  /** The settings in force: the last answer of setDebuggerSettings. */
  settingsInForce(): SettingsReading | undefined {
    return this.effective;
  }

  /** At the current stop: merges into the preferences, applies them, answers the settings in force. */
  setSettings(patch: DebugSettings): Promise<DebugView<SettingsReading>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      this.preferences = { ...this.preferences, ...patch };
      return this.applySettings(stop);
    });
  }

  /**
   * Sends the preferences at a stop. The first call after an attach ignores
   * systemDebugging=false (server source, BASIS 816, read 2026-10-11), and its
   * answer cannot show it, so then they are sent a second time; what is
   * reported is the last answer. A failed call does not count as the first.
   */
  private async applySettings(stop: Stop): Promise<DebugView<SettingsReading>> {
    const first = !stop.settingsSent;
    let answer = await withAdtHeaders(
      adtHeadersOf(this.origin),
      'debugger.setDebuggerSettings',
      (headers) =>
        stop.debugger.setDebuggerSettings(this.preferences, { headers }),
    );
    if (!answer.ok) {
      throw failedAt(
        new DebugRequestError(messageOf(answer)),
        answer,
        'set settings',
      );
    }
    // Only a call that succeeded counts as the first: after a failed one the
    // second send stays owed (an extra request is harmless, a missed one is not).
    stop.settingsSent = true;
    if (first && this.preferences.systemDebugging === false) {
      answer = await withAdtHeaders(
        adtHeadersOf(this.origin),
        'debugger.setDebuggerSettings',
        (headers) =>
          stop.debugger.setDebuggerSettings(this.preferences, { headers }),
      );
      if (!answer.ok) {
        throw failedAt(
          new DebugRequestError(messageOf(answer)),
          answer,
          'set settings',
        );
      }
    }
    const raw = bodyOf(answer);
    this.effective = readSettings(raw);
    stop.view = {
      ...stop.view,
      settings: this.effective,
      settingsError: undefined,
    };
    return { value: this.effective, raw };
  }

  /**
   * Inside the serial: everything off — DebugStop, a start that failed after a
   * change, dispose, shutdown. stopListener deletes the key's breakpoints
   * (measured on premise (2026-10-11), BASIS 816), so it is the authoritative
   * cleanup: only when it fails are the breakpoints deleted by id. Never
   * throws; answers what it could not undo, which stays for the next stop.
   * It needs the connected user's debug authorisation (`S_DEVELOP` DEBUG) as
   * the start does; SAP's refusal reaches the model as SAP says it.
   *
   * A credential failure (the chain's refusal, or a `401`) stops it: no
   * request after it is sent — each would ask the credential again — and each
   * step left is named in `cleanupNotAttempted`, kept for the next stop. Only
   * the closes still run: a logoff carries the session's cookies, nothing
   * asked of the credential provider.
   */
  private async cleanupLocked(
    refusedBefore?: DebugFailure,
  ): Promise<DebugFailure[]> {
    this.generation++;
    const failures: DebugFailure[] = [];
    const notAttempted: string[] = [];
    this.cleanupNotAttempted = notAttempted;
    /** Whether `step` is not sent: the credential was refused before it. */
    const skipped = (step: string): boolean => {
      if (
        refusedBefore === undefined &&
        credentialRefusalIn(failures) === undefined
      )
        return false;
      notAttempted.push(step);
      return true;
    };
    try {
      for (const connection of [...this.unclosed])
        await this.closeOrKeep(connection, 'a connection', failures);
      // The releases an earlier stop left owed: one owed during this stop's
      // listener stop is this stop's failure, retried by the next.
      const owedBefore = [...this.owed];
      /**
       * Whether a breakpoint may still be set: the listener's stop failed and a
       * delete by id did not succeed (or was not sent). A debuggee let go then
       * could stop at it again — in a loop, at once — so no held debuggee is
       * released: each stays held, a failure in fixed words, for the next stop.
       */
      let breakpointsMayStay = false;
      const keptHeld = (step: string): boolean => {
        if (!breakpointsMayStay) return false;
        failures.push({ message: DEBUGGEE_KEPT_WORDS, step });
        return true;
      };
      // 1. The listener is stopped, and the key's breakpoints with it — first,
      // so a debuggee let go below runs to its end: a continue from a
      // breakpoint in a loop would stop there again while it is armed.
      if (this.changed && !skipped('stop listener')) {
        const identity = this.requireIdentity();
        const control = await this.controlDebugger();
        const listener = this.listener;
        const open = listener?.open; // taken before the stop: its answer may come at once
        const stopped = await control.stopListener(identity).catch(asFailure);
        if (stopped.ok) {
          // 3. Nothing is left to delete by id, and no per-id failure of an earlier stop
          // stands: settle() replaces the failures with this cleanup's. The tag counter
          // stays: a tag is never reused in this instance. `changed` stays until settle()
          // finds the cleanup complete, so a stop that keeps anything owes the stopListener again.
          this.forgetAll();
          // The listener's stop is done: a later stop that retries what else was kept
          // must not send it again — under user mode it would end a listener another
          // IDE of the same user started in between.
          this.changed = false;
          // Measured on premise (2026-10-12): a poll sent just before the stop (the loop
          // polls again at once after a run ends) can reach the system after the
          // stopListener; nothing then wakes it, and it holds its full hold. So while
          // that poll has not settled, the listener is stopped once more, on the same
          // identity. No timer: only whether the answer has come. Its failure is no
          // debt — the first stop succeeded and deleted the key's breakpoints; at worst
          // the poll holds until the system answers it. One retry narrows the race and
          // does not close it (a 60 s stop was seen once with it); documented, not
          // handled further (DEBUGGER.md, What ends a session).
          if (open && !settledPolls.has(open))
            await control.stopListener(identity).catch(() => undefined);
          await this.retireListener(listener, open, failures, skipped);
        } else if (refusesUser(stopped)) {
          // Our choice on an explicit reading (refusesUser), a safety net: 404
          // invalidUser (measured for a request user that does not exist) or 403
          // notAuthorized is final. After an arming the system accepted, a conforming
          // server does not answer it (setBreakpoints checks the same authorisation).
          // No per-id deletes: breakpoints are not ours to remove for a lack of
          // rights — whoever has the rights debugs them. The session lets go of them
          // (the system keeps them), no failure is recorded, and the session ends.
          // SAP's answer still reaches the model, as a note that is no debt, naming
          // the breakpoints that stay on the system.
          const placed = this.listBreakpoints();
          const refused = failedEntry(stopped, 'stop listener');
          this.cleanupNotes.push(
            placed.length
              ? {
                  ...refused,
                  cleanup: {
                    message: `the breakpoints placed stay on the system: ${placed.map(describePlaced).join(', ')}`,
                  },
                }
              : refused,
          );
          this.forgetAll();
          // Final: no later stop retries it.
          this.changed = false;
          // Unlike after a stopListener that succeeded, the system's listener was not
          // stopped, so nothing wakes an open poll: the wait for its answer can last
          // the poll's full hold — the system's clock, not ours.
          await this.retireListener(listener, open, failures, skipped);
        } else {
          // 4. Deleted by id, as before; what fails stays for the next stop.
          failures.push(failedEntry(stopped, 'stop listener'));
          for (const id of [...this.armed.keys()]) {
            if (skipped(`delete breakpoint ${id}`)) continue;
            const deleted = await control
              .deleteBreakpoint(identity, id)
              .catch(asFailure);
            if (deleted.ok) this.forget(id);
            else failures.push(failedEntry(deleted, `delete breakpoint ${id}`));
          }
          breakpointsMayStay = this.armed.size > 0;
        }
      } else if (this.listener && !this.changed) {
        // Nothing was sent that changes the system: a listener here only closes.
        const listener = this.listener;
        this.listener = undefined;
        await this.closeOrKeep(
          listener.connection,
          "the listener's connection",
          failures,
        );
      }
      for (const owed of owedBefore) {
        if (skipped(`release ${owed.what}`)) continue;
        if (keptHeld(`release ${owed.what}`)) continue;
        const notReleased = await this.release(owed.debugger, owed.what);
        if (notReleased) {
          failures.push(notReleased); // kept: a later stop retries
          continue;
        }
        // Released: only its connection may be left, and a retry must not release twice.
        this.owed.delete(owed);
        await this.closeOrKeep(
          owed.connection,
          `${owed.what}'s connection`,
          failures,
        );
      }
      // The attaching session of the one-request path ends with its logoff,
      // which ends its attachment; no release step is sent on it.
      const attaching = this.onceAttaching;
      if (this.current?.once) this.current = undefined;
      if (attaching) {
        this.onceAttaching = undefined;
        await this.closeOrKeep(
          attaching.connection,
          "the debuggee's connection",
          failures,
        );
      }
      // 2. A held stop is released, with no breakpoint left to stop it again.
      const stop = this.current;
      if (
        stop &&
        !skipped('release the debuggee') &&
        !keptHeld('release the debuggee')
      ) {
        const released = await stop.debugger
          .step('stepContinue', { analyse: analyseDebuggeeEnd })
          .catch(asFailure);
        if (released.ok) {
          // Released: only its connection may be left, and a retry must not release twice.
          this.current = undefined;
          await this.closeOrKeep(
            stop.connection,
            "the debuggee's connection",
            failures,
          );
        } else {
          failures.push(failedEntry(released, 'release the debuggee')); // kept: a later stop retries
        }
      }
      // The one-request path's listener: its open listen answers once the
      // listener is stopped; then its connection closes.
      const onceListener = this.onceListener;
      if (onceListener) {
        if (onceListener.open) await onceListener.open;
        this.onceListener = undefined;
        await this.closeOrKeep(
          onceListener.connection,
          "the listener's connection",
          failures,
        );
      }
      if (!failures.length && this.control) {
        const control = this.control;
        this.control = undefined;
        await this.closeOrKeep(
          control.connection,
          "the breakpoints' connection",
          failures,
        );
      }
    } catch (error) {
      failures.push(thrownFailure(error, 'stop'));
    } finally {
      // The run's request is the one a held debuggee stands in: its logoff
      // would end that session. While a debuggee stays held (not released, or
      // owed), the run and its connection stay for the stop that releases it;
      // the instance's terminal close and the process's logoffs close it
      // whatever is held.
      if (!this.current && this.owed.size === 0) {
        const run = this.run;
        this.run = undefined;
        await this.closeOrKeep(
          run?.connection,
          "the run's connection",
          failures,
        );
      }
    }
    return failures;
  }

  /**
   * What the cleanup could not undo stays named for the next stop. The
   * identity — the request user, the mode — and the settings go only with a
   * complete cleanup: while anything is kept, a retry addresses the same key. The
   * owed stopListener goes as soon as the listener's stop succeeded or was refused
   * for the user (cleanupLocked), never sent twice.
   */
  private settle(
    failures: DebugFailure[],
    notAttempted: readonly string[] = [],
  ): void {
    this.cleanupFailures = failures;
    // A step not attempted is kept like a failure: the next stop sends it.
    if (failures.length > 0 || notAttempted.length > 0) return;
    this.fixed = undefined;
    this.changed = false;
    this.preferences = {};
    this.effective = undefined;
  }

  /** Anything a later stop still has to undo — what refuses a new start. */
  private keepsCleanup(): boolean {
    return (
      this.fixed !== undefined ||
      this.changed ||
      this.armed.size > 0 ||
      this.control !== undefined ||
      !!this.run ||
      this.cleanupFailures.length > 0 ||
      this.unclosed.size > 0 ||
      this.owed.size > 0 ||
      !!this.onceListener ||
      !!this.onceAttaching
    );
  }

  /**
   * Everything off — DebugStop, dispose, shutdown. Required, not best effort.
   * A stopped listener counts as off once the system answered its open poll.
   * Never throws anything but DebugCleanupError, and whatever failed stays for the next stop.
   * Answers the notes that are no debt: SAP's final refusal of the stopListener.
   */
  stop(): Promise<DebugFailure[]> {
    return this.mutate(async () => {
      this.cleanupNotes = [];
      const failures = await this.cleanupLocked();
      const notes = this.cleanupNotes.splice(0);
      this.failure = undefined;
      this.notices.length = 0;
      this.settle(failures, this.cleanupNotAttempted);
      this.notify(); // also tells the instance state (observe) that this part may hold nothing now
      if (failures.length)
        throw new DebugCleanupError(failures, notes, this.cleanupNotAttempted);
      return notes;
    });
  }

  holdsState(): boolean {
    return (
      !!this.listener ||
      !!this.current ||
      this.armed.size > 0 ||
      // An identity is held, or a stopListener is owed: only a cleanup ends them.
      this.changed ||
      this.fixed !== undefined ||
      this.notices.length > 0 ||
      !!this.run ||
      this.failure !== undefined ||
      this.cleanupFailures.length > 0 ||
      this.unclosed.size > 0 ||
      this.owed.size > 0 ||
      !!this.onceListener ||
      !!this.onceAttaching
    );
  }

  /** What the last stop could not undo, each in the shape of every other failure. */
  failures(): DebugFailure[] {
    return [...this.cleanupFailures];
  }
}
