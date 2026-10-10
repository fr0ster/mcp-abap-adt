/**
 * The AMDP debugger's state — one per server instance, one AMDP session at a
 * time. Events on one session, commands on another (measured); events are read
 * in the background so a wait is bounded by its own hold. A sync is answered
 * with a request id and confirmed by its SYNC_BREAKPOINTS event, correlated
 * apart from the public event queue; a run starts only after that. A stop never
 * releases a suspended debuggee (measured), so stop() deletes it first. A stop
 * the system accepted ends the open event read (a STOP event ~260 ms later,
 * measured on premise 2026-10-11), so stop() returns once that read answered
 * and the read loop, with its last batch, released a break it carries and
 * closed both connections. A stop that was not accepted does not wait: the
 * read then ends when the system says. Nothing ends on a timer of ours; the
 * one bounded wait is a sync's confirmation, inside its own call, at
 * WAIT_MAX_SECONDS.
 */
import { randomUUID } from 'node:crypto';
import type {
  AmdpDebugger,
  amdpDebuggerDocuments,
} from '@mcp-abap-adt/adt-clients';
import type { IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AmdpBreakpointState,
  type AmdpEvent,
  locationId,
  readAmdpEvents,
  readAmdpPreview,
  readAmdpStart,
} from './amdpReadings';
import {
  DebugCleanupError,
  DebugListenerError,
  DebugRequestError,
  DebugStateError,
  type DebugView,
  type RunOutcome,
  type RunTarget,
  WAIT_MAX_SECONDS,
} from './DebugSession';
import { lineUriOf } from './objectUri';
import { failureText } from './readings';
import { Serial } from './serial';

export type AmdpDebuggerT = AmdpDebugger<typeof amdpDebuggerDocuments>;
export interface AmdpSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(c: IAbapConnection): Promise<void>;
  amdpDebugger(c: IAbapConnection): AmdpDebuggerT;
  requestUser(origin: O): Promise<string>;
  run(c: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface AmdpBreakpoint {
  class_name: string;
  line: number;
}
export type AmdpState =
  | { state: 'idle' }
  | { state: 'waiting' }
  | { state: 'event'; events: AmdpEvent[] }
  | { state: 'ended'; reason: 'run_finished'; run: RunOutcome };

interface Open {
  events: IAbapConnection;
  commands: IAbapConnection;
  onEvents: AmdpDebuggerT;
  onCommands: AmdpDebuggerT;
  mainId: string;
  hanaSession: string;
  stopping: boolean; // retired: stop() (or a failure) took it; the read loop's next batch is its last
  released: Set<string>; // debuggees already deleted
  unreleased: Set<string>; // debuggees still owed a deletion
  cleared: boolean; // the empty breakpoint sync was answered ok
  stopped: boolean; // the stop request was answered ok
  readDone: boolean; // the read loop's last batch was handled
  reading?: Promise<IAdtResponse<unknown>>; // the event read the system holds open
  readFailed?: string; // the event read failed: a sync waiting for confirmation hears it at once
  failureReported: boolean; // that failure was already thrown by a sync
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
  }) as unknown as IAdtResponse<never>;
type Wire = { headers?: Record<string, unknown>; data?: unknown };
const wireOf = (a: IAdtResponse<unknown>): Wire =>
  (a.ok ? (a.getResult().value ?? {}) : {}) as Wire;

export class AmdpSession<O = unknown> {
  private readonly serial = new Serial();
  private origin?: O;
  private open?: Open;
  private closing?: Open; // retired, its cleanup not finished
  private debuggeeId?: string;
  private breaks = 0; // counts ON_BREAK, to tell a break that came during a step
  private queue: AmdpEvent[] = [];
  private readonly syncs = new Map<string, AmdpEvent>(); // SYNC_BREAKPOINTS by request id, apart from the queue
  private readonly abandoned = new Set<string>(); // syncs no call waits for any more
  private notices: AmdpState[] = [];
  private failure?: string;
  private cleanupFailures: string[] = [];
  /** Runs in flight, each its own token: stop() forgets them all, so a late end changes nothing. */
  private readonly runs = new Set<{ connection?: IAbapConnection }>();
  private readonly waiters = new Set<() => void>();
  private readonly closedConnections = new WeakSet<object>();
  /** Connections whose work is done but whose close threw: the next stop closes them. */
  private readonly unclosed = new Set<IAbapConnection>();
  private changed?: () => void;

  constructor(private readonly ports: AmdpSessionPorts<O>) {}
  bind(origin: O): this {
    this.origin = origin;
    return this;
  }
  observe(onChange: () => void): void {
    this.changed = onChange;
  }

  // --- plumbing -------------------------------------------------------------
  private requireOrigin(): O {
    if (this.origin === undefined)
      throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  private requireOpen(): Open {
    if (!this.open)
      throw new DebugStateError('no AMDP debug session is running');
    return this.open;
  }
  private requireDebuggee(): string {
    if (!this.debuggeeId)
      throw new DebugStateError('no AMDP debuggee is stopped');
    return this.debuggeeId;
  }
  private notify(): void {
    for (const w of [...this.waiters]) w();
    this.changed?.();
  }
  /** Every change goes through here: one at a time, and observers hear of it afterwards — whatever it did. */
  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.serial.run(async () => {
      try {
        return await work();
      } finally {
        this.notify();
      }
    });
  }
  /** Closes once; a port that throws leaves the connection unmarked, so a later cleanup tries again. */
  private async close(c: IAbapConnection | undefined): Promise<void> {
    if (!c || this.closedConnections.has(c)) return;
    await this.ports.closeConnection(c);
    this.closedConnections.add(c);
  }
  /** A close that throws keeps the connection for the next stop and is named. */
  private async closeOrKeep(
    c: IAbapConnection | undefined,
    what: string,
    failures: string[],
  ): Promise<void> {
    if (!c) return;
    try {
      await this.close(c);
      this.unclosed.delete(c);
    } catch (e) {
      this.unclosed.add(c);
      failures.push(`${what} was not closed: ${thrown(e)}`);
    }
  }
  /** Inside the serial: the session is no longer the running one; its cleanup is owed. */
  private retire(open: Open): void {
    if (this.debuggeeId && !open.released.has(this.debuggeeId))
      open.unreleased.add(this.debuggeeId);
    open.stopping = true;
    if (this.open === open) this.open = undefined;
    this.closing = open;
    this.debuggeeId = undefined;
    this.syncs.clear();
  }

  // --- start -------------------------------------------------------------------
  start(options: {
    stopExisting: boolean;
    breakpoints: AmdpBreakpoint[];
    run?: RunTarget;
  }): Promise<{ mainId: string; breakpoints: AmdpBreakpointState[] }> {
    return this.mutate(async () => {
      if (this.open || this.closing)
        throw new DebugStateError(
          'an AMDP debug session is already running for this debug session',
        );
      const origin = this.requireOrigin();
      const user = (await this.ports.requestUser(origin)).toUpperCase();
      // Until the session is recorded as ours, whatever was opened is closed on any failure.
      let events: IAbapConnection | undefined;
      let commands: IAbapConnection | undefined;
      let open: Open;
      try {
        events = await this.ports.openConnection(origin);
        commands = await this.ports.openConnection(origin);
        const onEvents = this.ports.amdpDebugger(events);
        const onCommands = this.ports.amdpDebugger(commands);
        const started = await onEvents.start(user, {
          stopExisting: options.stopExisting,
        });
        if (!started.ok) throw new DebugListenerError(messageOf(started));
        const { mainId, hanaSession } = readAmdpStart(wireOf(started));
        if (!mainId)
          throw new DebugListenerError(
            'the AMDP debugger started without naming its session',
          );
        open = {
          events,
          commands,
          onEvents,
          onCommands,
          mainId,
          hanaSession,
          stopping: false,
          released: new Set(),
          unreleased: new Set(),
          cleared: false,
          stopped: false,
          readDone: false,
          failureReported: false,
        };
      } catch (error) {
        const failures: string[] = [];
        await this.closeOrKeep(events, "the events' connection", failures);
        await this.closeOrKeep(commands, "the commands' connection", failures);
        throw withNotUndone(error, failures);
      }
      this.open = open;
      this.failure = undefined;
      this.cleanupFailures = [];
      void this.readLoop(open);
      try {
        const states = await this.sync(open, options.breakpoints);
        if (options.run) this.startRun(options.run);
        return { mainId: open.mainId, breakpoints: states };
      } catch (error) {
        // A start that fails leaves no session: the same retained cleanup as a stop;
        // what it could not undo is named in the error and kept for the next stop.
        this.retire(open);
        const failures = await this.finishClosing(open, []);
        this.cleanupFailures = failures;
        throw withNotUndone(error, failures);
      }
    });
  }

  /** Sends a sync and waits, inside this call, for its own SYNC_BREAKPOINTS. */
  private async sync(
    open: Open,
    list: AmdpBreakpoint[],
  ): Promise<AmdpBreakpointState[]> {
    const breakpoints = list.map((b) => ({
      clientId: randomUUID(),
      uri: lineUriOf(
        { object_type: 'CLAS', object_name: b.class_name },
        b.line,
      ),
    }));
    const answer = await open.onCommands.syncBreakpoints(
      open.mainId,
      breakpoints,
    );
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
    const requestId = locationId(wireOf(answer));
    if (!requestId)
      throw new DebugRequestError(
        'the breakpoints were sent but the answer named no request to confirm them by',
      );
    const settled = () =>
      this.syncs.has(requestId) ||
      this.open !== open ||
      open.readFailed !== undefined;
    if (!settled()) {
      await new Promise<void>((resolve) => {
        const done = () => {
          if (!settled()) return;
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        // The brief's explicit bound for a call that waits on the system, not a session timeout.
        const timer = setTimeout(() => {
          this.waiters.delete(done);
          resolve();
        }, WAIT_MAX_SECONDS * 1000);
        this.waiters.add(done);
      });
    }
    const event = this.syncs.get(requestId);
    this.syncs.delete(requestId);
    if (event) return event.breakpoints;
    if (open.readFailed !== undefined) {
      open.failureReported = true;
      throw new DebugListenerError(open.readFailed);
    }
    this.abandoned.add(requestId); // a late confirmation is dropped, not kept
    throw new DebugRequestError(
      'the breakpoints were sent but the system did not confirm them within this call; nothing was run',
    );
  }

  // --- the event read -----------------------------------------------------------
  /** Takes a batch of a running session — synchronous, so it lands even while a command is in the serial. */
  private take(events: AmdpEvent[]): void {
    for (const e of events) {
      if (e.kind === 'SYNC_BREAKPOINTS') {
        if (this.abandoned.delete(e.requestId)) continue;
        this.syncs.set(e.requestId, e);
        continue;
      }
      if (e.kind === 'ON_BREAK') {
        this.debuggeeId = e.debuggeeId;
        this.breaks++;
      }
      if (e.kind === 'ON_EXECUTION_END' && e.debuggeeId === this.debuggeeId)
        this.debuggeeId = undefined;
      this.queue.push(e);
    }
  }

  /** Never rejects: whatever throws in it becomes the session's failure, reported by the next wait. */
  private async readLoop(open: Open): Promise<void> {
    try {
      for (;;) {
        const reading = open.onEvents.getEvents(open.mainId).catch(asFailure);
        open.reading = reading;
        const answer = await reading;
        let events: AmdpEvent[] = [];
        let failed = answer.ok ? undefined : messageOf(answer);
        if (answer.ok) {
          try {
            events = readAmdpEvents(bodyOf(answer));
          } catch (e) {
            failed = `the events could not be read: ${thrown(e)}`;
          }
        }
        const current = !open.stopping && this.open === open;
        if (current && failed === undefined) {
          this.take(events);
          this.notify();
          continue;
        }
        if (current && failed !== undefined) {
          open.readFailed = failed;
          this.notify(); // a sync waiting in the serial hears it now, not after its bound
        }
        await this.lastBatch(open, events);
        return;
      }
    } catch (error) {
      // Thrown outside an answer (the ask itself, an observer): the same end as a failed read.
      // A stale loop changes nothing.
      const message = `the event read failed: ${thrown(error)}`;
      if (!open.stopping && this.open === open) open.readFailed ??= message;
      try {
        await this.lastBatch(open, []);
      } catch {
        if (this.open === open || this.closing === open) {
          open.readDone = true;
          this.failure ??= open.readFailed ?? message;
        }
      }
    }
  }

  /**
   * The read loop's last turn, in the serial. A session still running failed: it is
   * retired through the same retained cleanup as a stop, and its failure, with what
   * that cleanup could not undo, is what the next wait throws. A retired one: this
   * batch is its last; it releases a break it carries and closes what is left.
   */
  private lastBatch(open: Open, events: AmdpEvent[]): Promise<void> {
    return this.mutate(async () => {
      open.readDone = true;
      const failedHere = !open.stopping && this.open === open;
      if (failedHere) this.retire(open);
      const owed = this.closing === open;
      const failures = owed ? await this.finishClosing(open, events) : [];
      if (owed) this.cleanupFailures = failures;
      if (failedHere && !open.failureReported)
        this.failure = `${open.readFailed ?? 'the event read failed'}${
          failures.length ? `; not undone: ${failures.join('; ')}` : ''
        }`;
    });
  }

  /**
   * Inside the serial: release every break known to be suspended — the last
   * batch's and any kept from a failed attempt — clear the breakpoints and stop
   * the session where that was not answered yet, and close both sessions once
   * the read loop is done and nothing is left. Nothing already accepted is
   * sent again. What fails stays in `closing` for the next stop(). Never
   * throws: it answers what it could not undo.
   */
  private async finishClosing(
    open: Open,
    lastBatch: AmdpEvent[],
  ): Promise<string[]> {
    if (this.closing !== open) return [];
    for (const e of lastBatch)
      if (e.kind === 'ON_BREAK' && !open.released.has(e.debuggeeId))
        open.unreleased.add(e.debuggeeId);
    const failures: string[] = [];
    if (!open.cleared) {
      const cleared = await open.onCommands
        .syncBreakpoints(open.mainId, [])
        .catch(asFailure);
      if (cleared.ok) open.cleared = true;
      else failures.push(`clear breakpoints: ${messageOf(cleared)}`);
    }
    for (const id of [...open.unreleased]) {
      const released = await open.onCommands
        .deleteDebuggee(open.mainId, id)
        .catch(asFailure);
      if (released.ok) {
        open.unreleased.delete(id);
        open.released.add(id);
      } else failures.push(`release debuggee ${id}: ${messageOf(released)}`);
    }
    if (!open.stopped) {
      const stopped = await open.onCommands.stop(open.mainId).catch(asFailure);
      if (stopped.ok) open.stopped = true;
      else failures.push(`stop: ${messageOf(stopped)}`);
    }
    if (failures.length || !open.readDone) return failures; // kept: retried by stop(), or finished by the read loop
    // Done with the session; a connection whose close throws stays in `unclosed` for the next stop.
    this.closing = undefined;
    await this.closeOrKeep(open.events, "the events' connection", failures);
    await this.closeOrKeep(open.commands, "the commands' connection", failures);
    return failures;
  }

  // --- commands ------------------------------------------------------------------
  setBreakpoints(
    list: AmdpBreakpoint[],
  ): Promise<DebugView<AmdpBreakpointState[]>> {
    return this.mutate(async () => {
      const states = await this.sync(this.requireOpen(), list);
      return { value: states, raw: JSON.stringify(states) };
    });
  }

  async wait(holdSeconds = 10): Promise<AmdpState> {
    const ms = Math.min(Math.max(holdSeconds, 0), WAIT_MAX_SECONDS) * 1000;
    const ready = () =>
      this.failure !== undefined ||
      this.queue.length > 0 ||
      this.notices.length > 0 ||
      !this.open;
    if (!ready() && ms > 0) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const done = () => {
          if (ready()) finish();
        };
        const timer = setTimeout(finish, ms);
        this.waiters.add(done);
      });
    }
    if (this.failure !== undefined) {
      const message = this.failure;
      this.failure = undefined;
      this.changed?.(); // consuming it may leave nothing held
      throw new DebugListenerError(message);
    }
    if (this.queue.length) {
      const events = this.queue.splice(0);
      this.changed?.();
      return { state: 'event', events };
    }
    const notice = this.notices.shift();
    if (notice) {
      this.changed?.();
      return notice;
    }
    return this.open ? { state: 'waiting' } : { state: 'idle' };
  }

  step(step: 'over' | 'continue'): Promise<DebugView<string>> {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const debuggee = this.requireDebuggee();
      const breaksBefore = this.breaks;
      const answer = await open.onCommands.step(open.mainId, debuggee, step);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      // Moving until the next ON_BREAK — unless one already arrived while the step was answered.
      if (this.breaks === breaksBefore) this.debuggeeId = undefined;
      return { value: 'moving', raw: '' };
    });
  }

  getTable(
    variable: string,
    query?: string,
  ): Promise<
    DebugView<{ rows: Array<Record<string, string>>; columns: string[] }>
  > {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const answer = await open.onCommands.getDataPreview({
        sessionId: open.hanaSession,
        debuggerId: open.mainId,
        debuggeeId: this.requireDebuggee(),
        variableName: variable.toUpperCase(),
        rowNumber: 100,
        ...(query ? { query } : {}),
      });
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      const raw = bodyOf(answer);
      return { value: readAmdpPreview(raw), raw };
    });
  }

  cancel(): Promise<void> {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const debuggee = this.requireDebuggee();
      const answer = await open.onCommands.deleteDebuggee(
        open.mainId,
        debuggee,
      );
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      open.released.add(debuggee);
      this.debuggeeId = undefined;
    });
  }

  // --- lifecycle -------------------------------------------------------------
  /**
   * Releases a suspended debuggee, empties the breakpoints, stops the session.
   * A second call retries what a first left (`closing`, `unclosed`). The
   * connections close when the read loop's last batch has arrived and nothing
   * is left to undo. Never throws anything but DebugCleanupError.
   */
  async stop(): Promise<void> {
    let ending: Open | undefined;
    await this.mutate(async () => {
      const failures: string[] = [];
      try {
        for (const c of [...this.unclosed])
          await this.closeOrKeep(c, 'a connection', failures);
        if (this.open) this.retire(this.open);
        if (this.closing) {
          const open = this.closing;
          failures.push(...(await this.finishClosing(open, [])));
          // Accepted: the system answers the open read now. Its answer is awaited here; the
          // read loop handles it as the last batch once this call leaves the serial.
          if (open.stopped && !open.readDone && open.reading) {
            await open.reading;
            ending = open;
          }
        }
      } catch (error) {
        failures.push(thrown(error));
      } finally {
        const runs = [...this.runs];
        this.runs.clear();
        for (const run of runs)
          await this.closeOrKeep(
            run.connection,
            "the run's connection",
            failures,
          );
        this.queue = [];
        this.notices = [];
        this.failure = undefined;
        this.syncs.clear();
        this.abandoned.clear();
        this.cleanupFailures = failures;
      }
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
    // The read already answered: its last batch is in the serial behind this call,
    // and what it could not undo is this stop's failure too.
    if (ending) {
      await this.lastBatchHandled(ending);
      if (this.cleanupFailures.length)
        throw new DebugCleanupError(this.cleanupFailures.join('; '));
    }
  }

  private lastBatchHandled(open: Open): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!open.readDone) return;
        this.waiters.delete(check);
        resolve();
      };
      this.waiters.add(check);
      check();
    });
  }

  /** Runs a target on a connection of its own; its outcome arrives through wait(). */
  /** Never rejects: a failed run or close becomes the run's outcome or an owed close. */
  startRun(target: RunTarget): void {
    const origin = this.requireOrigin();
    const run: { connection?: IAbapConnection } = {};
    this.runs.add(run);
    void (async () => {
      let connection: IAbapConnection | undefined;
      let outcome: RunOutcome;
      try {
        connection = await this.ports.openConnection(origin);
        if (this.runs.has(run)) run.connection = connection;
        outcome = await this.ports.run(connection, target);
      } catch (error) {
        outcome = { ok: false, message: thrown(error) };
      }
      try {
        await this.close(connection);
        this.unclosed.delete(connection as IAbapConnection);
      } catch {
        if (connection) this.unclosed.add(connection); // the next stop closes it
      }
      if (this.runs.delete(run)) {
        this.notices.push({
          state: 'ended',
          reason: 'run_finished',
          run: outcome,
        });
      }
      this.notify();
    })().catch(() => this.notify());
  }

  holdsState(): boolean {
    return (
      !!this.open ||
      !!this.closing ||
      this.queue.length > 0 ||
      this.notices.length > 0 ||
      this.runs.size > 0 ||
      this.failure !== undefined ||
      this.cleanupFailures.length > 0 ||
      this.unclosed.size > 0
    );
  }

  /** Still finishing on its own: retired, the last event batch not yet arrived. */
  pending(): boolean {
    return !!this.closing && !this.closing.readDone;
  }

  /** What the last cleanup could not undo. */
  failures(): string[] {
    return [...this.cleanupFailures];
  }
}

/** The original error, with what could not be undone appended. */
function withNotUndone(error: unknown, failures: string[]): unknown {
  if (failures.length === 0) return error;
  const notUndone = `not undone: ${failures.join('; ')}`;
  if (error instanceof Error) {
    error.message = `${error.message}; ${notUndone}`;
    return error;
  }
  return new DebugListenerError(`${thrown(error)}; ${notUndone}`);
}
