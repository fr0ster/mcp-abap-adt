/**
 * The state an MCP server instance holds between tool calls, and its handle.
 *
 * Generic on purpose: the host keeps instances by this handle (MCP SEP-2567 —
 * no protocol session; state named by an explicit handle), whatever the state
 * is. The debugger is one part; locks will be another. State ends by an
 * explicit stop, the host, the backend, process shutdown — or the idle bound
 * (`idleBound.ts`): the user's one exception to "no timeouts", counted from
 * the end of the last tool call and paused while any call runs.
 */
import { randomBytes } from 'node:crypto';
import { logger as processLogger } from '../logger';
import { DEFAULT_STATE_IDLE_MINUTES, parseStateIdleMinutes } from './idleBound';

/**
 * One stateful part of an instance.
 * pending: cleanup is still finishing on its own (an AMDP session waits for
 * its last event batch). failures: what a cleanup could not undo, kept for a
 * retry.
 */
export interface StatePart {
  holdsState(): boolean;
  pending(): boolean;
  failures(): string[];
  dispose(): Promise<void>;
  observe(onChange: () => void): void;
}

/** An unknown handle and a handle whose state is gone get this one answer. */
export class StateUnavailableError extends Error {
  constructor() {
    super('state is not available');
    this.name = 'StateUnavailableError';
  }
}

/** What a disposal could not undo, named part by part. */
export class StateCleanupError extends Error {
  constructor(readonly failures: string[]) {
    super(failures.join('; '));
    this.name = 'StateCleanupError';
  }
}

/** 32 upper-case hex characters, 128 random bits. */
const newHandle = () => randomBytes(16).toString('hex').toUpperCase();
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Where a failing observer, and the idle bound's end of the state, are reported. */
export interface StateLogger {
  error(message: string): void;
  info?(message: string): void;
}

/**
 * The state's lifecycle lines on stderr, always on: the idle bound's end of a
 * state, a cleanup that failed, an observer that threw. Safe under stdio
 * (stdout is the protocol's). Hosts whose transport logger is silenced pass
 * this one for the state.
 */
export const stderrStateLogger: StateLogger = {
  info: (message: string) => {
    process.stderr.write(`[INFO] ${message}\n`);
  },
  error: (message: string) => {
    process.stderr.write(`[ERROR] ${message}\n`);
  },
};

/**
 * The state logger a server uses: the state logger given; else the logger an
 * embedder passed EXPLICITLY (a host's own logger is where it looks); else
 * stderr. A host that defaults its transport logger to a silent one must not
 * pass that default here — it passes nothing, and stderr answers.
 */
export function stateLoggerOf(options: {
  stateLogger?: StateLogger;
  logger?: StateLogger;
}): StateLogger {
  return options.stateLogger ?? options.logger ?? stderrStateLogger;
}

export interface InstanceStateOptions {
  logger?: StateLogger;
  /**
   * The idle bound: held state ends after this many minutes without a tool
   * call. A whole number, at least 30 (the default); anything else is refused.
   */
  idleMinutes?: number;
}

export class InstanceState {
  private readonly log: StateLogger;
  /** The idle bound, in minutes. */
  readonly idleMinutes: number;

  constructor(options: InstanceStateOptions = {}) {
    this.log = options.logger ?? processLogger;
    this.idleMinutes =
      options.idleMinutes === undefined
        ? DEFAULT_STATE_IDLE_MINUTES
        : parseStateIdleMinutes(options.idleMinutes, 'stateIdleMinutes');
  }

  private current = newHandle();
  private readonly parts: StatePart[] = [];
  private readonly emptyListeners: Array<() => void> = [];
  private readonly changeListeners = new Set<() => void>();
  private wasHolding = false;
  private endRequested = false;
  /** Tool calls of this instance still running: while any runs, the bound does not. */
  private callsInFlight = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** A disposal is running (the bound's own included): the bound waits for its outcome. */
  private disposing = 0;
  /** The host let the instance go: the bound is never armed again. */
  private closed = false;
  /** The bound's stop is under way: "ended" is said once the state is empty. */
  private idleEnding = false;

  get handle(): string {
    return this.current;
  }

  attach(part: StatePart): void {
    this.parts.push(part);
    part.observe(() => this.changed());
    this.changed(); // samples a part that already holds
  }

  holdsState(): boolean {
    return this.parts.some((p) => p.holdsState());
  }

  pending(): boolean {
    return this.parts.some((p) => p.pending());
  }

  failures(): string[] {
    return this.parts.flatMap((p) => p.failures());
  }

  /** For a call on existing state: the handle must be this one and something must be held. */
  check(handle: unknown): void {
    if (
      typeof handle !== 'string' ||
      handle !== this.current ||
      !this.holdsState() ||
      // A complete stop is disposing: no call runs on a session being stopped.
      (this.endRequested && this.disposing > 0)
    ) {
      throw new StateUnavailableError();
    }
  }

  /**
   * A complete stop was asked: the handle is invalidated for good once nothing
   * is held — now, or when an asynchronous part finishes. The request stands
   * until the instance is empty, whichever path empties it: a stop that could
   * not undo everything keeps the handle valid for a retry, and the handle
   * ends when that retry, the backend, the host or any later cleanup empties
   * the instance.
   */
  endWhenEmpty(): void {
    this.endRequested = true;
    this.changed();
  }

  /** Fires once per transition from holding to empty. */
  onEmpty(listener: () => void): void {
    this.emptyListeners.push(listener);
  }

  /** Every change; answers its unsubscribe. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /** A tool call entered: the user is active; the bound pauses until every call has ended. */
  callStarted(): void {
    this.callsInFlight++;
    this.disarm();
  }

  /** A tool call settled: the bound counts from here. */
  callEnded(): void {
    if (this.callsInFlight > 0) this.callsInFlight--;
    this.reviewBound();
  }

  /**
   * Armed only while something is held and nothing runs. A change of a part
   * (a listener's own re-poll) never restarts a running bound: only a call does.
   */
  private reviewBound(): void {
    if (
      this.closed ||
      this.disposing > 0 ||
      this.callsInFlight > 0 ||
      !this.holdsState()
    ) {
      this.disarm();
      return;
    }
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      void this.expire();
    }, this.idleMinutes * 60_000);
    this.idleTimer.unref(); // never keeps the process alive
  }

  private disarm(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /**
   * The user has not called for the whole bound: a complete stop, the same as
   * the stop tools' — the handle ends once nothing is held. What the disposal
   * could not undo is reported and kept for a retry (the bound arms again).
   * The handle is a bearer secret and never reaches the log.
   */
  private async expire(): Promise<void> {
    const minutes = this.idleMinutes;
    this.endWhenEmpty();
    this.idleEnding = true; // changed() says "ended" when the state empties
    let failed: string | undefined;
    try {
      await this.dispose();
    } catch (error) {
      failed = messageOf(error);
    }
    if (!this.idleEnding) return; // emptied: "ended" was said
    if (this.holdsState() && this.pending() && failed === undefined) {
      this.log.info?.(
        `instance state: held state ending after ${minutes} minutes without a call; its cleanup is still finishing`,
      );
      return; // "ended" follows when it empties
    }
    this.idleEnding = false;
    const failures = this.failures();
    this.log.error(
      `instance state: held state not ended after ${minutes} minutes without a call — its cleanup failed (kept for a retry): ${failures.length ? failures.join('; ') : (failed ?? 'state is still held')}`,
    );
  }

  /** Every transition goes through here; state is updated before anyone is told. */
  private changed(): void {
    const holding = this.holdsState();
    const emptied = this.wasHolding && !holding;
    this.wasHolding = holding;
    if (!holding && this.endRequested) {
      this.current = newHandle(); // the old handle is invalid for good
      this.endRequested = false;
    }
    this.reviewBound();
    if (emptied && this.idleEnding) {
      this.idleEnding = false;
      this.log.info?.(
        // "by the idle bound", not "after N minutes": a call may have arrived while the cleanup finished.
        `instance state: held state ended by the idle bound (${this.idleMinutes} minutes without a call)`,
      );
    }
    if (emptied) for (const l of [...this.emptyListeners]) this.tell(l);
    for (const l of [...this.changeListeners]) this.tell(l);
  }

  /** An observer that throws is reported; it never turns the part's transition into a failure. */
  private tell(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      this.log.error(`instance state: an observer failed: ${messageOf(error)}`);
    }
  }

  /** Disposes every part; throws a StateCleanupError naming what failed. */
  async dispose(): Promise<void> {
    this.disposing++;
    this.disarm();
    let results: PromiseSettledResult<void>[];
    try {
      results = await Promise.allSettled(
        // A synchronous throw of one part must not skip the others.
        this.parts.map((p) => Promise.resolve().then(() => p.dispose())),
      );
    } finally {
      this.disposing--;
    }
    this.changed(); // what is still held arms the bound again, for a retry
    const failures = results.flatMap((r) =>
      r.status === 'rejected' ? [messageOf(r.reason)] : [],
    );
    if (failures.length) throw new StateCleanupError(failures);
  }

  /** Resolves when nothing is held, or nothing is finishing on its own. */
  settled(): Promise<void> {
    const done = () => !this.holdsState() || !this.pending();
    if (done()) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onChange(() => {
        if (done()) {
          off();
          resolve();
        }
      });
    });
  }

  /**
   * What every host does before it lets an instance go (stdio at exit, SSE
   * when a session closes, the pool at shutdown): dispose; wait until settled —
   * a disposal that threw may still have cleanup finishing on its own; once
   * more what is still held; settle; answer what is left. No timer: an AMDP
   * session settles when its last event batch arrives.
   */
  shutdown(): Promise<string[]> {
    this.closed = true; // the host lets the instance go: no bound any more
    this.disarm();
    // One run at a time: a second caller (a session's late close beside the
    // host's drain) gets the run in flight, so dispose never runs twice at once.
    if (!this.shuttingDown) {
      const run = this.runShutdown().finally(() => {
        if (this.shuttingDown === run) this.shuttingDown = undefined;
      });
      this.shuttingDown = run;
    }
    return this.shuttingDown;
  }

  private shuttingDown: Promise<string[]> | undefined;

  private async runShutdown(): Promise<string[]> {
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.dispose();
        lastError = undefined;
      } catch (error) {
        lastError = messageOf(error); // reported below if anything is left
      }
      await this.settled();
      if (!this.holdsState()) return [];
    }
    const failures = this.failures();
    if (failures.length) return failures;
    return [lastError ?? 'state is still held'];
  }
}
