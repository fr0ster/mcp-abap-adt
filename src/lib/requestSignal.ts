/**
 * The request signal scope (spec §5.2): the signal of the MCP request a tool
 * call serves, readable anywhere inside that call.
 *
 * Its own `AsyncLocalStorage` — not the system-context request scope
 * (`requestContext.ts`), which stdio does not enter and whose presence
 * changes what `getEffectiveSystemContext` answers. The tool wrapper runs
 * the handler inside `runWithRequestSignal(signal, …)`; whatever sends a
 * request for that call reads `currentRequestSignal()` when it sends.
 *
 * Also here: what a cancelled request ends with — connection's
 * `ADT_REQUEST_ABORTED` code, answered `request_aborted` in fixed words
 * (D34) — and the race a server's own wait runs against the request's signal
 * (D32).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { ADT_REQUEST_ABORTED } from './auth/failures';

const scope = new AsyncLocalStorage<AbortSignal>();

/** Runs `fn` with `signal` as the current request's signal. */
export function runWithRequestSignal<T>(signal: AbortSignal, fn: () => T): T {
  return scope.run(signal, fn);
}

/** The signal of the request this code runs for; `undefined` outside any request. */
export function currentRequestSignal(): AbortSignal | undefined {
  return scope.getStore();
}

/**
 * What a cancelled request ends with: an error whose own `code` is
 * connection's `ADT_REQUEST_ABORTED`, which the failure reader answers
 * `request_aborted` in fixed words (D34). It carries nothing else — no
 * reason, no cause.
 */
export class RequestAbortedError extends Error {
  readonly code = ADT_REQUEST_ABORTED;

  constructor() {
    super('The request was cancelled.');
    this.name = 'RequestAbortedError';
  }
}

/** Throws `RequestAbortedError` when `signal` has aborted (D5). */
export function throwIfRequestAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new RequestAbortedError();
}

/**
 * `work`, raced against `signal` (D32): the caller settles with
 * `RequestAbortedError` the moment its signal aborts, while the work itself
 * runs on for whoever else waits for it. A rejection of the work that comes
 * after the caller left is handled here, never left unhandled.
 */
export function raceRequestSignal<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  work.catch(() => undefined);
  if (signal.aborted) return Promise.reject(new RequestAbortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new RequestAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
