/**
 * Work in progress, counted at the provider.
 *
 * `countedProvider` forwards each of the four `IAuthProvider` calls unchanged
 * and counts the ones not yet answered. A renewal happens inside one of those
 * calls and its `onTokens` write is submitted before the call answers
 * (broker 4), so once the count is zero every renewal has reached the
 * broker's writer and `flush()` covers it.
 *
 * Behind a closed gate no call starts: each answers the shutdown refusal at
 * once, without reaching the inner provider — Oops, never a throw. A call
 * admitted before the gate closed runs to its answer and is waited for.
 * Nothing opens the gate again.
 */

import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';

export const SHUTDOWN_REFUSAL: AuthOutcome = Object.freeze({
  ok: false,
  refusal: Object.freeze({ reason: 'the server is shutting down' }),
});

export class ProviderGate {
  private isClosed = false;
  private count = 0;
  private waiters: Array<() => void> = [];

  /** Closes the gate for good: no provider call starts after this. */
  close(): void {
    this.isClosed = true;
  }

  get closed(): boolean {
    return this.isClosed;
  }

  /** Provider calls admitted and not yet answered. */
  get inFlight(): number {
    return this.count;
  }

  /** @internal Admits one call; `false` behind a closed gate. */
  enter(): boolean {
    if (this.isClosed) return false;
    this.count += 1;
    return true;
  }

  /** @internal One admitted call answered (or threw). */
  leave(): void {
    this.count -= 1;
    if (this.count === 0) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const wake of waiters) wake();
    }
  }

  /**
   * Resolves when no call is in flight, or at the deadline: with `0`, or with
   * the number still running then (abandoned).
   */
  drained(deadlineMs: number): Promise<number> {
    if (this.count === 0) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve(this.count);
      }, deadlineMs);
      const wake = () => {
        clearTimeout(timer);
        resolve(0);
      };
      this.waiters.push(wake);
    });
  }
}

export function countedProvider(
  inner: IAuthProvider,
  gate: ProviderGate,
): IAuthProvider {
  const counted = async (
    run: () => Promise<AuthOutcome>,
  ): Promise<AuthOutcome> => {
    if (!gate.enter()) return SHUTDOWN_REFUSAL;
    try {
      return await run();
    } finally {
      gate.leave();
    }
  };
  return {
    get kind() {
      return inner.kind;
    },
    prepare: () => counted(() => inner.prepare()),
    establish: (logon: ILogonTarget) => counted(() => inner.establish(logon)),
    authorize: (request: IRequestTarget) =>
      counted(() => inner.authorize(request)),
    rejected: (rejection: IAuthRejection) =>
      counted(() => inner.rejected(rejection)),
  };
}
