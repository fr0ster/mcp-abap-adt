/**
 * The state an MCP server instance holds between tool calls, and its handle.
 *
 * Generic on purpose: the host keeps instances by this handle (MCP SEP-2567 —
 * no protocol session; state named by an explicit handle), whatever the state
 * is. The debugger is one part; locks will be another. Nothing expires here:
 * state ends by an explicit stop, the host, the backend or process shutdown.
 */
import { randomBytes } from 'node:crypto';

export interface StateDescription {
  kind: string;
  [field: string]: unknown;
}

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
  describe(): StateDescription[];
  observe(onChange: () => void): void;
}

/** What the host lends an instance for one request; stdio and SSE lend none. */
export interface StateHost {
  /** The request's owner, or null when the request carries no identity to keep state under. */
  readonly owner: string | null;
  /** Atomically reserves the owner's slot of a kind for this handle; answers the holder's handle when another instance holds it. */
  reserve(kind: string, handle: string): string | undefined;
  /** Every state the owner holds in the pool, this instance's included. */
  peers(): Array<{ state_handle: string; states: StateDescription[] }>;
}

/** An unknown handle, another owner's handle and a handle whose state is gone all get this one answer. */
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

export class InstanceState {
  private current = newHandle();
  private readonly parts: StatePart[] = [];
  private readonly emptyListeners: Array<() => void> = [];
  private readonly changeListeners = new Set<() => void>();
  private wasHolding = false;
  private endRequested = false;
  /** Set by the host per request; stdio and SSE set none. */
  host?: StateHost;

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

  kindsHeld(): string[] {
    return [
      ...new Set(this.parts.flatMap((p) => p.describe().map((d) => d.kind))),
    ];
  }

  describe(): { state_handle: string; states: StateDescription[] } {
    return {
      state_handle: this.current,
      states: this.parts.flatMap((p) => p.describe()),
    };
  }

  /** For a state-creating call: refuses without an identity; reserves the kind, refusing with the holder's handle. */
  admit(kind: string): void {
    if (!this.host) return; // stdio, SSE: one instance per session
    if (this.host.owner === null) {
      throw new Error('this request carries no identity to keep state under');
    }
    const holder = this.host.reserve(kind, this.current);
    if (holder && holder !== this.current) {
      throw new Error(
        `a ${kind} session is already open: state_handle ${holder}`,
      );
    }
  }

  /** For a call on existing state: the handle must be this one and something must be held. */
  check(handle: unknown): void {
    if (
      typeof handle !== 'string' ||
      handle !== this.current ||
      !this.holdsState()
    ) {
      throw new StateUnavailableError();
    }
  }

  /**
   * A complete stop was asked: the handle is invalidated for good once nothing
   * is held — now, or when an asynchronous part finishes. Until then the old
   * handle still serves, so a stop that could not undo everything can be
   * retried with it.
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

  /** Every transition goes through here; state is updated before anyone is told. */
  private changed(): void {
    const holding = this.holdsState();
    const emptied = this.wasHolding && !holding;
    this.wasHolding = holding;
    if (!holding && this.endRequested) {
      this.current = newHandle(); // the old handle is invalid for good
      this.endRequested = false;
    }
    if (emptied) for (const l of [...this.emptyListeners]) l();
    for (const l of [...this.changeListeners]) l();
  }

  /** Disposes every part; throws a StateCleanupError naming what failed. */
  async dispose(): Promise<void> {
    const results = await Promise.allSettled(
      this.parts.map((p) => p.dispose()),
    );
    this.changed();
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
  async shutdown(): Promise<string[]> {
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
