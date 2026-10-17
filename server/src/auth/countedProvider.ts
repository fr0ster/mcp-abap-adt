/**
 * Work in progress, counted at the provider.
 *
 * `countedProvider` forwards each of the four `IAuthProvider` calls unchanged
 * and counts the ones not yet answered. A renewal happens inside one of those
 * calls and its `onTokens` write is submitted before the call answers
 * (broker 4), so once the count is zero every renewal has reached the
 * broker's writer and `flush()` covers it.
 *
 * Behind a closed gate no call starts: each answers the shutdown refusal
 * (`interactive-login` `aborted`, minted) at once, without reaching the inner provider — Oops, never a throw. A call
 * admitted before the gate closed runs to its answer and is waited for.
 * Nothing opens the gate again.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';

/**
 * The closed gate's answer: auth-errors' `interactive-login` `aborted`,
 * minted — the server's shutdown sentence goes beside it (`serverSentence`),
 * never into the refusal.
 */
export const SHUTDOWN_REFUSAL: AuthOutcome = Object.freeze({
  ok: false,
  refusal: authError['interactive-login']({ outcome: 'aborted' }),
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
   * Resolves when no call is in flight — no deadline, no timer: a
   * shutdown's forced close is what ends this waiting early, and it does not
   * await it. `signal` (the shutdown's) releases this wait when it aborts.
   */
  drained(signal?: AbortSignal): Promise<void> {
    if (this.count === 0 || signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const wake = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
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
