/**
 * The long session an instance holds between requests: a part of its state
 * (#308, spec §2).
 *
 * Streamable HTTP takes an instance per request, from the pool when the
 * request names one by its `state_handle`. The model opens a long session
 * (`SessionOpen`, compact `HandlerSession` with `action: 'open'`) to keep an
 * instance — and its SAP connection — across its calls: the part holds state
 * while open, so the pool keeps the instance, and every call carrying the
 * handle runs on it. Opening an open session changes nothing. Close
 * (`SessionClose`, `HandlerSession` `action: 'close'`) only asks for the
 * instance's close (`askClose`): the host, once the close call's answer is
 * written, takes the instance out of its routing and runs the instance close
 * on it (the pool, `closeAsked`). The session also ends with the idle bound
 * or the process shutdown; its disposal lets it go (the logoff that follows
 * ends what SAP held). No clock of its own.
 *
 * Given only by a host whose instances last one request each (the
 * Streamable HTTP server); stdio and SSE keep their instance between calls
 * and give none.
 */
import type { StatePart } from './InstanceState';

/** What the instance held when its close was asked: close names it. */
export interface SessionHolding {
  /** The locks the instance held (`HeldLocks`). */
  locks: number;
  /** Whether a batch was open, or its answers kept. */
  batch: boolean;
  /** Whether a debug session (ABAP or AMDP) was held. */
  debug_session: boolean;
}

/** What a session tool does with the instance's long session. */
export interface LongSessionPort {
  /** Marks the long session open; an open one stays as it is. */
  open(): void;
  /** Whether the long session is open. */
  isOpen(): boolean;
  /**
   * Asks for the instance's close, which the host runs once the call's
   * answer is written; answers what the instance holds now.
   */
  close(): SessionHolding;
}

export class LongSession implements StatePart {
  private opened = false;
  private closing = false;
  private readonly listeners: Array<() => void> = [];

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.notify();
  }

  isOpen(): boolean {
    return this.opened;
  }

  /**
   * The instance's close was asked (close): nothing changes here — the host
   * reads it after the call (`closeAsked`) and closes the instance.
   */
  askClose(): void {
    this.closing = true;
  }

  /** Whether the instance's close was asked. */
  closeAsked(): boolean {
    return this.closing;
  }

  holdsState(): boolean {
    return this.opened;
  }

  pending(): boolean {
    return false;
  }

  failures(): string[] {
    return [];
  }

  /** Lets the session go: the instance's logoff ends it in SAP. */
  async dispose(): Promise<void> {
    if (!this.opened) return;
    this.opened = false;
    this.notify();
  }

  observe(onChange: () => void): void {
    this.listeners.push(onChange);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
