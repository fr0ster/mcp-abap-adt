/**
 * The locks an instance holds between requests: a part of its state.
 *
 * Streamable HTTP takes an instance per request, from the pool when the
 * request names one by its `state_handle`. A lock taken in an instance's SAP
 * session lives in that session until its UNLOCK or the session's logoff, so
 * the write and the unlock under it must reach the same instance: compact
 * `HandlerLock` keeps the handle it answered here (the instance then holds
 * state and answers its `state_handle`), and `HandlerUpdate` / `HandlerUnlock`
 * write and unlock only under a handle kept here. The state ends at the
 * UNLOCK; the instance's logoff (its end, the idle bound's terminal close)
 * ends it in SAP. No clock of its own.
 *
 * Given only by a host whose instances last one request each (the
 * Streamable HTTP server); stdio and SSE keep their instance's session
 * between calls and give none.
 */
import type { StatePart } from './InstanceState';

/** The words of a write or an unlock under a lock this instance does not hold. */
export const LOCK_NOT_HELD_WORDS =
  "lock_handle is not held by this instance: send the state_handle HandlerLock answered in the request's x-mcp-state-handle header";

/**
 * Where a lock lives: the instance's own SAP session (`main`), or a session
 * of its own (a package lock over RFC), which the instance's connection
 * changes do not end.
 */
export type LockSession = 'main' | 'own';

/** What a handler does with the instance's held locks: keep, ask, let go. */
export interface HeldLockPort {
  hold(handle: string, session?: LockSession): void;
  holds(handle: string): boolean;
  release(handle: string): void;
  /** The instance's live SAP session, as a token that changes when it ends. */
  session(): number;
}

export class HeldLocks implements StatePart, HeldLockPort {
  private readonly handles = new Map<string, LockSession>();
  private readonly listeners: Array<() => void> = [];
  /** Which SAP session of the instance is live: one more at every end of one. */
  private generation = 0;

  /** Keeps `handle` as held by this instance, in `session`. */
  hold(handle: string, session: LockSession = 'main'): void {
    this.handles.set(handle, session);
    this.notify();
  }

  /**
   * The instance's SAP session ended — its connection retired for another
   * credential, or replaced after SAP lost the session: the locks it held
   * went with it, and are held no more.
   */
  mainSessionEnded(): void {
    this.generation += 1;
    let changed = false;
    for (const [handle, session] of this.handles) {
      if (session === 'main') {
        this.handles.delete(handle);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  /** The instance's live SAP session, as a token that changes when it ends. */
  session(): number {
    return this.generation;
  }

  /**
   * The held locks as a recorded call sees them when its number is read
   * (batch mode): a lock in the main session is kept only when `sentIn()` —
   * the session its batch's envelope went out on — is still the live one.
   * A lock read after that session ended went with it: the read answers it,
   * and the instance does not hold it, so a write or an unlock under it is
   * refused here, sending nothing.
   */
  heldIn(sentIn: () => number | undefined): HeldLockPort {
    return {
      hold: (handle, session = 'main') => {
        if (session === 'main' && sentIn() !== this.generation) return;
        this.hold(handle, session);
      },
      holds: (handle) => this.holds(handle),
      release: (handle) => this.release(handle),
      session: () => this.session(),
    };
  }

  /** Whether `handle` is held by this instance. */
  holds(handle: string): boolean {
    return this.handles.has(handle);
  }

  /** The UNLOCK of `handle` was answered: it is held no more. */
  release(handle: string): void {
    if (this.handles.delete(handle)) this.notify();
  }

  holdsState(): boolean {
    return this.handles.size > 0;
  }

  pending(): boolean {
    return false;
  }

  failures(): string[] {
    return [];
  }

  /**
   * Lets the handles go. The locks themselves end in SAP with the logoff of
   * the session that holds them — the terminal close that follows every
   * disposal of a pooled instance.
   */
  async dispose(): Promise<void> {
    if (this.handles.size === 0) return;
    this.handles.clear();
    this.notify();
  }

  observe(onChange: () => void): void {
    this.listeners.push(onChange);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * Whether a write or an unlock under `lockHandle` may be sent on this
 * instance: always where the host keeps no locks; else only under a handle
 * this instance holds.
 */
export function lockHeldHere(
  heldLocks: HeldLockPort | undefined,
  lockHandle: string,
): boolean {
  return heldLocks === undefined || heldLocks.holds(lockHandle);
}
