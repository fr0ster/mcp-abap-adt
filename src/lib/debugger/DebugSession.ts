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
  type abapDebuggerDocuments,
  type IDebuggerListenerConflict,
  readListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseDebuggeeEnd } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtResponse,
  IDebuggerBreakpoint,
  IDebuggerIdentity,
  IDebuggerSettings,
  IDebuggerStepMethod,
  IDebuggerStepToLineMethod,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type BreakpointNotPlaced,
  mergeDefinitions,
  pairRows,
  type RequestedBreakpoint,
  type UnexpectedRow,
  wireOf,
} from './arming';
import type { BreakpointConflict, DebuggerIds } from './ids';
import {
  type AttachReading,
  type BreakpointReading,
  type DebuggeeReading,
  failureText,
  readAttach,
  readBreakpoints,
  readDebuggee,
  readDebuggeeEnd,
  readStack,
  readVariables,
  type StackReading,
  type VariablesReading,
} from './readings';
import { Serial } from './serial';

export const LISTEN_HOLD_SECONDS = 60;
export const FIRST_POLL_HOLD_SECONDS = 3;
export const WAIT_MAX_SECONDS = 30;

export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget {
  kind: 'class' | 'program';
  name: string;
}
export type RunOutcome =
  | { ok: true; output: string }
  | { ok: false; message: string };
export interface DebugSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(connection: IAbapConnection): Promise<void>;
  abapDebugger(
    connection: IAbapConnection,
    onConflict: IDebuggerListenerConflict,
  ): Debugger;
  requestUser(origin: O): Promise<string>;
  run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface StopView {
  debuggee: DebuggeeReading;
  attach: AttachReading;
  stack: StackReading;
  stackError?: string;
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
  | { state: 'ended'; reason: EndReason; run?: RunOutcome; message?: string };
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
  breakpoints?: IDebuggerBreakpoint[];
  run?: RunTarget;
  /** User mode: whose requests are caught; the connected user when omitted. */
  requestUser?: string;
  /** `user` (the default) or `terminal`, which keys on the configured terminal id. */
  debuggingMode?: DebuggingMode;
  /** Applied after each attach; see `setSettings`. */
  settings?: DebugSettings;
}
export interface DebugSessionOptions {
  /** The host's choice; `replace` when omitted. */
  breakpointConflict?: BreakpointConflict;
}

export class DebugListenerError extends Error {}
export class DebugStateError extends Error {}
export class DebugRequestError extends Error {}
export class DebugCleanupError extends Error {}
/** Refused before anything was sent. */
export class DebugRefusedError extends Error {}
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
const asFailure = (e: unknown) =>
  ({
    ok: false as const,
    getError: () => ({ origin: 'connection', message: thrown(e) }),
  }) as unknown as IAdtResponse<string>;

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

/** A failed listener answer: the holder named when it is the system's conflict. */
function listenerError(answer: IAdtResponse<unknown>): DebugListenerError {
  const held = answer.ok ? undefined : readListenerConflict(answer.getError());
  return held
    ? new DebugConflictError(held.conflictText, held.ideUser)
    : new DebugListenerError(messageOf(answer));
}

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
  protected generation = 0;
  protected readonly notices: DebugState[] = [];
  private readonly waiters = new Set<() => void>();
  private readonly closedConnections = new WeakSet<object>();
  protected readonly breakpointConflict: BreakpointConflict;
  /** The identity of this debug session: fixed by a start, kept until a cleanup succeeded completely. */
  protected fixed?: IDebuggerIdentity;
  /** True once something that changes the system was sent: the cleanup owes a stopListener. */
  protected changed = false;
  /** The settings the caller set; applied after each attach (Task 6). */
  protected preferences: DebugSettings = {};

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
    options: DebugStartOptions,
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
      if (!this.ids.terminalStated)
        throw new DebugRefusedError(
          'terminal mode: no terminal id is configured',
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
   * refuse-if-held: asks on the control connection — never on a polling one —
   * whether another debugger holds the key. Changes nothing. Our own listener
   * under the same ideId is no conflict (measured on premise, 2026-10-10), so
   * this protects against another IDE, not against ourselves. Not atomic: a
   * listener started between this check and the arming is not seen.
   */
  private async preflight(identity: IDebuggerIdentity): Promise<void> {
    if (this.breakpointConflict !== 'refuse-if-held') return;
    const checked = await (await this.controlDebugger())
      .checkListener(identity)
      .catch(asFailure);
    if (!checked.ok) {
      const error = listenerError(checked);
      throw error instanceof DebugConflictError
        ? error
        : new DebugRequestError(messageOf(checked));
    }
  }
  /** Closes the control connection; a close that throws is kept for the next stop and named. */
  private async closeControl(): Promise<string[]> {
    const control = this.control;
    this.control = undefined;
    const kept = await this.closeOrRecord(
      control?.connection,
      "the breakpoints' connection",
    );
    return kept ? [kept] : [];
  }
  protected async open(): Promise<IAbapConnection> {
    return this.ports.openConnection(this.requireOrigin());
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
    this.changed = true;
    const answer = await dbg.setBreakpoints(identity, sent.map(wireOf));
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
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
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
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

  /** The definitions every change sends again, as the callers gave them. */
  requestedBreakpoints(): IDebuggerBreakpoint[] {
    return this.requested.map((r) => r.definition);
  }

  listBreakpoints(): BreakpointReading[] {
    return [...this.armed.values()];
  }

  // --- listener -----------------------------------------------------------------
  start(
    conflict: IDebuggerListenerConflict,
    options: DebugStartOptions = {},
  ): Promise<DebugState & { breakpoints?: BreakpointsAnswer }> {
    return this.mutate(async () => {
      if (this.listener || this.current)
        throw new DebugStateError(
          'a listener is already running for this debug session',
        );
      // Refusals before the wire: nothing is opened, nothing is sent.
      refuseConditionOffLine(options.breakpoints ?? []);
      const identity = await this.identityFor(options);
      this.mode = conflict;
      this.failure = undefined;
      this.fixed = identity;
      this.preferences = { ...(options.settings ?? {}) };
      const before = new Set(this.armed.keys());
      const placedHere = () =>
        [...this.armed.values()].filter((b) => !before.has(b.id!));
      let armed: DebugView<BreakpointsAnswer> | undefined;
      try {
        // 1. the preflight; 2. the reconciliation (stopListener deletes the key's
        // breakpoints, so it runs only after the preflight); 3. the arming, then listening.
        await this.preflight(identity);
        await this.beforeFirstListen(identity);
        armed = options.breakpoints?.length
          ? await this.armLocked(options.breakpoints)
          : undefined;
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
        if (!first.ok) {
          const error = listenerError(first);
          // A refused listener (409) changed nothing; any other failure leaves its state unknown.
          if (!(error instanceof DebugConflictError)) this.changed = true;
          throw error;
        }
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
          // itself, a first listen refused 409 with nothing armed or reconciled. No
          // stopListener and no deletion: only the connections this start opened close.
          const failures = [
            ...(await this.dropListener()),
            ...(await this.closeControl()),
          ];
          // The identity and the settings go only with a complete cleanup (Task 4
          // replaces this branch by `settle(failures)`).
          if (failures.length === 0) {
            this.fixed = undefined;
            this.preferences = {};
            throw error;
          }
          const notClosed = `not closed: ${failures.join('; ')}`;
          if (error instanceof Error) {
            error.message = `${error.message}; ${notClosed}`;
            throw error;
          }
          throw new DebugListenerError(`${thrown(error)}; ${notClosed}`);
        }
        // A refused or failed start leaves nothing it armed. Each undo runs whatever the other did,
        // and what could not be undone is named in the error the start fails with.
        const failures: string[] = [];
        failures.push(...(await this.releaseLocked()));
        const run = this.run;
        this.run = undefined;
        const runKept = await this.closeOrRecord(
          run?.connection,
          "the run's connection",
        );
        if (runKept) failures.push(runKept);
        failures.push(...(await this.dropListener()));
        failures.push(...(await this.undoArmed(identity, placedHere())));
        if (failures.length === 0) throw error;
        const notUndone = `not undone: ${failures.join('; ')}`;
        if (error instanceof Error) {
          error.message = `${error.message}; ${notUndone}`;
          throw error;
        }
        throw new DebugListenerError(`${thrown(error)}; ${notUndone}`);
      }
    });
  }

  /**
   * Inside the serial, for a failed start: a stop it attached is released. One that
   * cannot be released stays for DebugStop. Never throws: it answers what it could not undo.
   */
  private async releaseLocked(): Promise<string[]> {
    const stop = this.current;
    if (!stop) return [];
    const released = await stop.debugger
      .step('stepContinue', { analyse: analyseDebuggeeEnd })
      .catch(asFailure);
    if (!released.ok)
      return [`the debuggee was not released: ${messageOf(released)}`];
    this.current = undefined;
    const kept = await this.closeOrRecord(
      stop.connection,
      "the debuggee's connection",
    );
    return kept ? [kept] : [];
  }

  /**
   * A refused start leaves nothing armed: what it placed is deleted; what cannot be
   * stays armed for DebugStop. Never throws: it answers what it could not undo.
   */
  private async undoArmed(
    identity: IDebuggerIdentity,
    placed: BreakpointReading[],
  ): Promise<string[]> {
    const failures: string[] = [];
    const control = this.control?.debugger;
    for (const p of placed) {
      const deleted = control
        ? await control.deleteBreakpoint(identity, p.id!).catch(asFailure)
        : undefined;
      if (deleted?.ok) this.forget(p.id!);
      else
        failures.push(
          `breakpoint ${p.id} is still armed: ${deleted ? messageOf(deleted) : 'no connection to delete it on'}`,
        );
    }
    if (this.armed.size === 0 && this.control) {
      const control = this.control;
      this.control = undefined;
      // A close that throws keeps the connection for the next stop.
      const kept = await this.closeOrRecord(
        control.connection,
        "the breakpoints' connection",
      );
      if (kept) failures.push(kept);
    }
    return failures;
  }

  private poll(
    listener: Listener,
    identity: IDebuggerIdentity,
    holdSeconds: number,
  ): Promise<IAdtResponse<string>> {
    const answer = listener.debugger
      .listen(identity, { holdSeconds })
      .catch(asFailure);
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
        this.failure ??= thrown(error);
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
      this.failure = listenerError(answer).message;
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
          message: messageOf(attached),
        });
        await this.closeOrRecord(connection, "the debuggee's connection");
        return false;
      }
      if (generation !== this.generation) {
        // Overtaken while attaching: released at once. A release that fails is recorded,
        // and the debuggee is kept with its connection for the next stop to release.
        const notReleased = await this.release(dbg);
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
          ...(stack.ok ? {} : { stackError: messageOf(stack) }),
          raw: {
            debuggee: rawDebuggee,
            attach: bodyOf(attached),
            stack: bodyOf(stack),
          },
        },
      };
      return true;
    } catch (error) {
      // The failure and the drop below happen whatever the close does; a close that throws is kept.
      await this.closeOrRecord(connection, "the debuggee's connection");
      this.failure = thrown(error);
      await this.dropListener();
      return false;
    }
  }

  /** Lets an attached debuggee run on. Never throws: answers why it was not released. */
  private async release(dbg: Debugger): Promise<string | undefined> {
    const released = await dbg
      .step('stepContinue', { analyse: analyseDebuggeeEnd })
      .catch(asFailure);
    return released.ok
      ? undefined
      : `the debuggee was not released: ${messageOf(released)}`;
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
    failures: string[],
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
      if (!attached.ok)
        failures.push(`${what} was not attached: ${messageOf(attached)}`);
      else {
        const notReleased = await this.release(dbg);
        if (notReleased) {
          // Kept with the session that attached it: the next stop retries the release there.
          failures.push(`${what}: ${notReleased}`);
          this.owed.add({ connection, debugger: dbg, what });
          return;
        }
      }
    } catch (error) {
      failures.push(`${what} was not released: ${thrown(error)}`);
    }
    await this.closeOrKeep(connection, `${what}'s connection`, failures);
  }

  /** Never throws: a close that throws is kept for the next stop, recorded, and answered. */
  protected async dropListener(): Promise<string[]> {
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
      this.failure = undefined;
      this.observer?.(); // consuming it may leave nothing held
      throw new DebugListenerError(message);
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
  ): Promise<DebugState> {
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
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
        : { stackError: messageOf(stack) }),
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
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      await this.releaseStop(stop);
      return { state: 'ended', reason: 'terminated' };
    });
  }

  getStack(): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const stack = await stop.debugger.getStack();
      if (!stack.ok) throw new DebugRequestError(messageOf(stack));
      stop.view = {
        ...stop.view,
        stack: readStack(bodyOf(stack)),
        stackError: undefined,
        raw: { ...stop.view.raw, stack: bodyOf(stack) },
      };
      return { value: stop.view, raw: bodyOf(stack) };
    });
  }

  setStackPosition(position: number): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const moved = await stop.debugger.setStackPosition(position);
      if (!moved.ok) throw new DebugRequestError(messageOf(moved));
      const stack = await stop.debugger.getStack();
      if (!stack.ok) throw new DebugRequestError(messageOf(stack));
      stop.view = {
        ...stop.view,
        stack: readStack(bodyOf(stack)),
        raw: { ...stop.view.raw, stack: bodyOf(stack) },
      };
      return { value: stop.view, raw: bodyOf(stack) };
    });
  }

  private variables(
    call: (d: Debugger) => Promise<IAdtResponse<string>>,
  ): Promise<DebugView<VariablesReading>> {
    return this.mutate(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      return { value: readVariables(bodyOf(answer)), raw: bodyOf(answer) };
    });
  }
  getVariables(names: string[]) {
    return this.variables((d) =>
      d.getVariables(names.map((n) => n.toUpperCase())),
    );
  }
  getChildVariables(parents: string[]) {
    return this.variables((d) =>
      d.getChildVariables(parents.map((n) => n.toUpperCase())),
    );
  }
  setVariable(name: string, value: string) {
    return this.variables((d) => d.setVariableValue(name.toUpperCase(), value));
  }

  private document(
    call: (d: Debugger) => Promise<IAdtResponse<unknown>>,
  ): Promise<DebugView<string>> {
    return this.mutate(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      return { value: bodyOf(answer), raw: bodyOf(answer) };
    });
  }
  createWatchpoint(name: string, condition?: string) {
    return this.document((d) =>
      d.createWatchpoint(name.toUpperCase(), condition ? { condition } : {}),
    );
  }
  listWatchpoints() {
    return this.document((d) => d.listWatchpoints());
  }
  async deleteWatchpoint(id: string) {
    await this.document((d) => d.deleteWatchpoint(id));
  }
  getMemorySizes() {
    return this.document((d) => d.getMemorySizes());
  }
  createMemorySnapshot() {
    return this.document((d) => d.createMemorySnapshot());
  }

  // --- lifecycle -------------------------------------------------------------
  private run?: { generation: number; connection?: IAbapConnection };
  private reconciled = false;
  private cleanupFailures: string[] = [];
  /** Connections whose work is done but whose close threw: the next stop closes them. */
  private readonly unclosed = new Set<IAbapConnection>();
  /** Attached debuggees whose release failed, each with its connection: the next stop retries. */
  private readonly owed = new Set<OwedRelease>();

  /** Inside stop: a close that throws keeps the connection for the next stop and is named. */
  private async closeOrKeep(
    connection: IAbapConnection | undefined,
    what: string,
    failures: string[],
  ): Promise<void> {
    if (!connection) return;
    try {
      await this.close(connection);
      this.unclosed.delete(connection);
    } catch (e) {
      this.unclosed.add(connection);
      failures.push(`${what} was not closed: ${thrown(e)}`);
    }
  }

  /**
   * Outside stop: the same keep-for-retry close, recorded in failures() so
   * the state stays held until a stop closes it. Never throws; answers the failure.
   */
  private async closeOrRecord(
    connection: IAbapConnection | undefined,
    what: string,
  ): Promise<string | undefined> {
    const failures: string[] = [];
    await this.closeOrKeep(connection, what, failures);
    this.cleanupFailures.push(...failures);
    return failures[0];
  }

  protected async beforeFirstListen(
    identity: IDebuggerIdentity,
  ): Promise<void> {
    if (!this.ids.stated || this.reconciled) return;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    // It counts as done only once the request was sent: a start that failed before it retries.
    // stopListener deletes the key's breakpoints too, which the arming then replaces.
    // A connection that cannot be opened sends nothing: that start failed before any change.
    const control = await this.controlDebugger();
    this.changed = true;
    await control.stopListener(identity).catch(() => undefined);
    this.reconciled = true;
  }

  protected startRun(target: RunTarget, generation: number): void {
    this.run = { generation };
    void (async () => {
      let connection: IAbapConnection | undefined;
      let outcome: RunOutcome | undefined;
      try {
        connection = await this.open();
        if (this.run?.generation === generation) {
          this.run.connection = connection;
          outcome = await this.ports.run(connection, target);
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

  /**
   * Everything off — DebugStop, dispose, shutdown. Required, not best effort.
   * A stopped listener counts as off once the system answered its open poll.
   * Never throws anything but DebugCleanupError, and whatever failed stays for the next stop.
   */
  stop(): Promise<void> {
    return this.mutate(async () => {
      this.generation++;
      const failures: string[] = [];
      try {
        for (const connection of [...this.unclosed])
          await this.closeOrKeep(connection, 'a connection', failures);
        for (const owed of [...this.owed]) {
          const notReleased = await this.release(owed.debugger);
          if (notReleased) {
            failures.push(`${owed.what}: ${notReleased}`); // kept: a later stop retries
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
        const stop = this.current;
        if (stop) {
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
            failures.push(`release the debuggee: ${messageOf(released)}`); // kept: a later stop retries
          }
        }
        if (this.armed.size > 0 || this.listener) {
          const identity = this.requireIdentity();
          const control = await this.controlDebugger();
          for (const id of [...this.armed.keys()]) {
            const deleted = await control
              .deleteBreakpoint(identity, id)
              .catch(asFailure);
            if (deleted.ok) this.forget(id);
            else failures.push(`breakpoint ${id}: ${messageOf(deleted)}`);
          }
          if (this.listener) {
            const open = this.listener.open; // taken before the stop: its answer may come at once
            const stopped = await control
              .stopListener(identity)
              .catch(asFailure);
            if (stopped.ok) {
              const listener = this.listener;
              this.listener = undefined;
              // Accepted is not done: SAP lets go of the user's listener when it answers the
              // open poll (130–570 ms after the stop, at most the poll's hold, measured on
              // premise 2026-10-11). Until then a start of another ideId meets 409
              // conflictDetected, so the stop returns only after that answer.
              if (open) {
                const last = await open;
                listener.open = undefined;
                if (!last.ok)
                  failures.push(`the listener's last poll: ${messageOf(last)}`);
                else {
                  // A catch in it — during the stop, or just before and not yet handled.
                  const caught = readDebuggee(bodyOf(last));
                  if (caught) await this.releaseCaught(caught, failures);
                }
              }
              await this.closeOrKeep(
                listener.connection,
                "the listener's connection",
                failures,
              );
            } else {
              failures.push(`listener: ${messageOf(stopped)}`); // kept: a later stop retries
            }
          }
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
        failures.push(thrown(error));
      } finally {
        const run = this.run;
        this.run = undefined;
        await this.closeOrKeep(
          run?.connection,
          "the run's connection",
          failures,
        );
        this.failure = undefined;
        this.notices.length = 0;
        this.cleanupFailures = failures;
        this.notify(); // also tells the instance state (observe) that this part may hold nothing now
      }
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
  }

  holdsState(): boolean {
    return (
      !!this.listener ||
      !!this.current ||
      this.armed.size > 0 ||
      this.notices.length > 0 ||
      !!this.run ||
      this.failure !== undefined ||
      this.cleanupFailures.length > 0 ||
      this.unclosed.size > 0 ||
      this.owed.size > 0
    );
  }

  /** What the last stop could not undo. */
  failures(): string[] {
    return [...this.cleanupFailures];
  }
}
