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
 * factory receives it (D55, D56). Nothing reads it to abort a request on
 * the wire: a client's close and the process shutdown end a running tool by
 * the logoff of its connections, sent at once (`closeInstance`,
 * `logOffAtOnce`), and abort this signal beside it, so its waits end.
 *
 * Also here: what a request whose signal aborted ends with, and the race a
 * server's own wait that sends nothing runs against the request's signal
 * (D32). The signal aborts at the end of the call's session, at the
 * instance close and at the process shutdown — never at a client's cancel:
 * a tool call cannot be cancelled (`BaseMcpServer`).
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
 * What a request whose signal aborted (its session ended) ends with: the
 * server's own error, in fixed words.
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
