/**
 * The request signal scope (spec §5.2): the signal of the MCP request a tool
 * call serves, readable anywhere inside that call.
 *
 * Its own `AsyncLocalStorage` — not the system-context request scope
 * (`requestContext.ts`), which stdio does not enter and whose presence
 * changes what `getEffectiveSystemContext` answers. The tool wrapper runs
 * the handler inside `runWithRequestSignal(signal, …)`. It is for the
 * server's own waits (D32) and D5's check only: a tool's sends carry no
 * request signal — nothing sent to SAP carries it, and no `freshConnection`
 * factory receives it (D55, D56). Nothing reads it to abort a running tool:
 * a started tool runs to its end, and a shutdown awaits it.
 *
 * Also here: what a cancelled request ends with, and the race a server's own
 * wait runs against the request's signal (D32).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

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
 * What a cancelled request ends with: the server's own error, in fixed words.
 * It carries nothing else — no code, no reason, no cause. (D56: there is no
 * `request_aborted` answer; connection 16 has no aborted-request code.)
 */
export class RequestAbortedError extends Error {
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
