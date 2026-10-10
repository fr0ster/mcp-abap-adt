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
import type {
  AbapDebugger,
  abapDebuggerDocuments,
  IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseDebuggeeEnd } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtResponse,
  IDebuggerBreakpoint,
  IDebuggerIdentity,
  IDebuggerStepMethod,
  IDebuggerStepToLineMethod,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { DebuggerIds } from './ids';
import {
  type AttachReading,
  type BreakpointReading,
  breakpointKey,
  type DebuggeeReading,
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
  | 'attach_refused';
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
  placed: BreakpointReading[];
  refused: Array<{ requested: IDebuggerBreakpoint; error: string }>;
}

export class DebugListenerError extends Error {}
export class DebugStateError extends Error {}
export class DebugRequestError extends Error {}
export class DebugCleanupError extends Error {}

interface Listener {
  connection: IAbapConnection;
  debugger: Debugger;
}
interface Stop {
  connection: IAbapConnection;
  debugger: Debugger;
  view: StopView;
}

const bodyOf = (a: IAdtResponse<unknown>): string =>
  a.ok ? String(a.getResult().value ?? '') : '';
const messageOf = (a: IAdtResponse<unknown>): string =>
  a.ok ? '' : a.getError().message;
const thrown = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asFailure = (e: unknown) =>
  ({
    ok: false as const,
    getError: () => ({ origin: 'connection', message: thrown(e) }),
  }) as unknown as IAdtResponse<string>;

export class DebugSession<O = unknown> {
  protected readonly serial = new Serial();
  protected origin?: O;
  protected user?: string;
  protected mode: IDebuggerListenerConflict = 'refuse';
  protected control?: Listener;
  protected readonly armed = new Map<string, BreakpointReading>();
  protected listener?: Listener;
  protected current?: Stop;
  protected failure?: string;
  protected generation = 0;
  protected readonly notices: DebugState[] = [];
  private readonly waiters = new Set<() => void>();
  private readonly closedConnections = new WeakSet<object>();

  constructor(
    protected readonly ports: DebugSessionPorts<O>,
    readonly ids: DebuggerIds & { stated?: boolean },
  ) {}

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
  protected async identity(): Promise<IDebuggerIdentity> {
    this.user ??= (
      await this.ports.requestUser(this.requireOrigin())
    ).toUpperCase();
    return {
      requestUser: this.user,
      terminalId: this.ids.terminalId,
      ideId: this.ids.ideId,
    };
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
  private changed?: () => void;
  observe(onChange: () => void): void {
    this.changed = onChange;
  }
  protected notify(): void {
    for (const w of [...this.waiters]) w();
    this.changed?.();
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
    return this.mutate(() => this.armLocked(list));
  }

  /** Inside the serial. */
  private async armLocked(
    list: IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointsAnswer>> {
    {
      const identity = await this.identity();
      const dbg = await this.controlDebugger();
      const answer = await dbg.setBreakpoints(identity, list);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      const raw = bodyOf(answer);
      const rows = readBreakpoints(raw);
      const placed = rows.filter((r) => r.id);
      for (const p of placed) this.armed.set(p.id!, p); // recorded at once: whatever happens next, they can be undone
      const placedKeys = new Set(placed.map(breakpointKey));
      const unmatched = list.filter((b) => !placedKeys.has(breakpointKey(b)));
      const errors = rows.filter((r) => r.error);
      const refused: BreakpointsAnswer['refused'] = [];
      for (const kind of new Set(unmatched.map((b) => b.kind))) {
        const asked = unmatched.filter((b) => b.kind === kind);
        const said = errors.filter((e) => e.kind === kind);
        if (asked.length === 1 && said.length === 1) {
          refused.push({ requested: asked[0], error: said[0].error! });
          continue;
        }
        for (const requested of asked) {
          // ambiguous within the kind: ask each on its own
          const one = await dbg
            .setBreakpoints(identity, [requested], { validationOnly: true })
            .catch(asFailure);
          const error = one.ok
            ? readBreakpoints(bodyOf(one)).find((r) => r.error)?.error
            : `the reason could not be read: ${messageOf(one)}`;
          refused.push({
            requested,
            error: error ?? 'refused without a reason',
          });
        }
      }
      return { value: { placed, refused }, raw };
    }
  }

  deleteBreakpoint(id: string): Promise<void> {
    return this.mutate(async () => {
      const answer = await (await this.controlDebugger()).deleteBreakpoint(
        await this.identity(),
        id,
      );
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      this.armed.delete(id);
    });
  }

  listBreakpoints(): BreakpointReading[] {
    return [...this.armed.values()];
  }

  // --- listener -----------------------------------------------------------------
  start(
    mode: IDebuggerListenerConflict,
    options: { breakpoints?: IDebuggerBreakpoint[]; run?: RunTarget } = {},
  ): Promise<DebugState & { breakpoints?: BreakpointsAnswer }> {
    return this.mutate(async () => {
      if (this.listener || this.current)
        throw new DebugStateError(
          'a listener is already running for this debug session',
        );
      const identity = await this.identity();
      this.mode = mode;
      this.failure = undefined;
      await this.beforeFirstListen(identity); // Task 5: reconciliation
      const before = new Set(this.armed.keys());
      const placedHere = () =>
        [...this.armed.values()].filter((b) => !before.has(b.id!));
      let armed: DebugView<BreakpointsAnswer> | undefined;
      try {
        armed = options.breakpoints?.length
          ? await this.armLocked(options.breakpoints)
          : undefined;
        const connection = await this.open();
        const listener: Listener = {
          connection,
          debugger: this.ports.abapDebugger(connection, mode),
        };
        const generation = ++this.generation;
        this.listener = listener;
        const first = await this.poll(
          listener,
          identity,
          FIRST_POLL_HOLD_SECONDS,
        );
        if (!first.ok) throw new DebugListenerError(messageOf(first));
        const caught = readDebuggee(bodyOf(first));
        if (caught) await this.attachTo(caught, bodyOf(first), generation);
        if (!this.current && this.owns(listener, generation))
          void this.loop(listener, generation);
        if (options.run && this.owns(listener, generation))
          this.startRun(options.run, generation); // Task 5
        // Inside the protected part: an attach that failed is reported here (report() throws its failure).
        return {
          ...this.report(),
          ...(armed ? { breakpoints: armed.value } : {}),
        };
      } catch (error) {
        // A refused or failed start leaves nothing it armed. Each undo runs whatever the other did,
        // and what could not be undone is named in the error the start fails with.
        const failures: string[] = [];
        failures.push(...(await this.releaseLocked()));
        const run = this.run;
        this.run = undefined;
        await this.close(run?.connection).catch((e) => {
          failures.push(`the run's connection was not closed: ${thrown(e)}`);
        });
        await this.dropListener().catch((e) => {
          failures.push(
            `the listener's connection was not closed: ${thrown(e)}`,
          );
        });
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
    try {
      await this.close(stop.connection);
      return [];
    } catch (e) {
      return [`the debuggee's connection was not closed: ${thrown(e)}`];
    }
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
      if (deleted?.ok) this.armed.delete(p.id!);
      else
        failures.push(
          `breakpoint ${p.id} is still armed: ${deleted ? messageOf(deleted) : 'no connection to delete it on'}`,
        );
    }
    if (this.armed.size === 0 && this.control) {
      try {
        await this.close(this.control.connection);
        this.control = undefined;
      } catch (e) {
        // The control stays, so a later cleanup closes it again.
        failures.push(
          `the breakpoints' connection was not closed: ${thrown(e)}`,
        );
      }
    }
    return failures;
  }

  private poll(
    listener: Listener,
    identity: IDebuggerIdentity,
    holdSeconds: number,
  ): Promise<IAdtResponse<string>> {
    return listener.debugger.listen(identity, { holdSeconds }).catch(asFailure);
  }

  /** Never rejects: whatever throws in it becomes the listener's failure, reported by the next wait. */
  private async loop(listener: Listener, generation: number): Promise<void> {
    try {
      const identity = await this.identity();
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
        await this.dropListener().catch(() => undefined);
      }
      this.notify();
    }
  }

  private async onPoll(
    listener: Listener,
    generation: number,
    answer: IAdtResponse<string>,
  ): Promise<boolean> {
    if (!this.owns(listener, generation)) return false;
    if (!answer.ok) {
      this.failure = messageOf(answer);
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
    let connection: IAbapConnection | undefined;
    try {
      const identity = await this.identity();
      connection = await this.open();
      const dbg = this.ports.abapDebugger(connection, this.mode);
      const attached = await dbg.attach(
        identity.requestUser,
        debuggee.debuggeeId,
        debuggee.instance ? { server: debuggee.instance } : {},
      );
      if (!attached.ok) {
        this.notices.push({
          state: 'ended',
          reason: 'attach_refused',
          message: messageOf(attached),
        });
        await this.close(connection);
        return false;
      }
      if (generation !== this.generation) {
        await dbg
          .step('stepContinue', { analyse: analyseDebuggeeEnd })
          .catch(() => undefined);
        await this.close(connection);
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
      // Best effort: the failure and the drop below must happen whatever the close does.
      await this.close(connection).catch(() => undefined);
      this.failure = thrown(error);
      await this.dropListener();
      return false;
    }
  }

  protected async dropListener(): Promise<void> {
    const listener = this.listener;
    this.listener = undefined;
    this.generation++;
    await this.close(listener?.connection);
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
      this.changed?.(); // consuming it may leave nothing held
      throw new DebugListenerError(message);
    }
    const notice = this.notices.shift();
    if (notice) {
      this.changed?.();
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

  protected async beforeFirstListen(
    identity: IDebuggerIdentity,
  ): Promise<void> {
    if (!this.ids.stated || this.reconciled) return;
    this.reconciled = true;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    await (await this.controlDebugger())
      .stopListener(identity)
      .catch(() => undefined);
  }

  protected startRun(target: RunTarget, generation: number): void {
    this.run = { generation };
    void (async () => {
      let connection: IAbapConnection | undefined;
      let outcome: RunOutcome;
      try {
        connection = await this.open();
        if (this.run?.generation !== generation) return;
        this.run.connection = connection;
        outcome = await this.ports.run(connection, target);
      } catch (error) {
        outcome = { ok: false, message: thrown(error) };
      } finally {
        await this.close(connection);
      }
      if (this.run?.generation !== generation) return;
      this.run = undefined;
      this.notices.push({
        state: 'ended',
        reason: 'run_finished',
        run: outcome,
      });
      this.notify();
    })();
  }

  /** Everything off — DebugStop, dispose, shutdown. Required, not best effort. */
  stop(): Promise<void> {
    return this.mutate(async () => {
      this.generation++;
      const failures: string[] = [];
      const stop = this.current;
      if (stop) {
        const released = await stop.debugger
          .step('stepContinue', { analyse: analyseDebuggeeEnd })
          .catch(asFailure);
        if (released.ok) {
          this.current = undefined;
          await this.close(stop.connection);
        } else {
          failures.push(`release the debuggee: ${messageOf(released)}`); // kept: a later stop retries
        }
      }
      if (this.armed.size > 0 || this.listener) {
        try {
          const identity = await this.identity();
          const control = await this.controlDebugger();
          for (const id of [...this.armed.keys()]) {
            const deleted = await control
              .deleteBreakpoint(identity, id)
              .catch(asFailure);
            if (deleted.ok) this.armed.delete(id);
            else failures.push(`breakpoint ${id}: ${messageOf(deleted)}`);
          }
          if (this.listener) {
            const stopped = await control
              .stopListener(identity)
              .catch(asFailure);
            if (stopped.ok) {
              const listener = this.listener;
              this.listener = undefined;
              await this.close(listener.connection);
            } else {
              failures.push(`listener: ${messageOf(stopped)}`); // kept: a later stop retries
            }
          }
        } catch (error) {
          failures.push(thrown(error));
        }
      }
      if (!failures.length) {
        await this.close(this.control?.connection);
        this.control = undefined;
      }
      await this.close(this.run?.connection);
      this.run = undefined;
      this.failure = undefined;
      this.notices.length = 0;
      this.cleanupFailures = failures;
      this.notify(); // also tells the instance state (observe) that this part may hold nothing now
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
      this.cleanupFailures.length > 0
    );
  }

  /** What the last stop could not undo. */
  failures(): string[] {
    return [...this.cleanupFailures];
  }

  describe() {
    return {
      kind: 'abap' as const,
      state: this.current
        ? ('stopped' as const)
        : this.listener
          ? ('listening' as const)
          : ('idle' as const),
      breakpoints: this.armed.size,
      terminal_id: this.ids.terminalId,
      ide_id: this.ids.ideId,
    };
  }
}
