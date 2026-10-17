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

export class HeldLocks implements StatePart {
  private readonly handles = new Map<string, LockSession>();
  private readonly listeners: Array<() => void> = [];

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
    let changed = false;
    for (const [handle, session] of this.handles) {
      if (session === 'main') {
        this.handles.delete(handle);
        changed = true;
      }
    }
    if (changed) this.notify();
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
  heldLocks: HeldLocks | undefined,
  lockHandle: string,
): boolean {
  return heldLocks === undefined || heldLocks.holds(lockHandle);
}
