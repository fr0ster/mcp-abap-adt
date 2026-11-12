/**
 * The server instance's own reading of a handler's failure, for one tool call
 * on the instance's connection (fr0ster/mcp-abap-adt#353).
 *
 * A request on a connection already made does not throw to the server:
 * adt-clients answers it as an `IAdtError`, and the handler renders that
 * failure itself (`answerFailure`). An instance that answers some of those
 * failures in its own words (stdio's `--deferred-logon`: a request that
 * reached no answer is `no_connection`) runs the handler inside this scope
 * with its reader, and the renderer asks the reader first. Outside a call, or
 * where the instance gave none, nothing is read and the failure is rendered
 * as it came.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { type ReadFailure, readerFailed } from './auth/failures';

/**
 * How an instance reads a handler's failure: its own answer, or `undefined`
 * for the failure as it came.
 */
export type AdtFailureReader = (failed: IAdtError) => ReadFailure | undefined;

const scope = new AsyncLocalStorage<AdtFailureReader>();

/** Runs `fn` with `reader` as the current tool call's reader. */
export function runWithAdtFailureReader<T>(
  reader: AdtFailureReader,
  fn: () => T,
): T {
  return scope.run(reader, fn);
}

/**
 * The current call's reading of `failed`; `undefined` outside a call, without
 * a reader, or when the reader answers none. A reader that throws answers
 * `readerFailed()`, never its throw.
 */
export function readAdtFailureInCall(
  failed: IAdtError,
): ReadFailure | undefined {
  const reader = scope.getStore();
  if (reader === undefined) return undefined;
  try {
    return reader(failed);
  } catch {
    return readerFailed();
  }
}
