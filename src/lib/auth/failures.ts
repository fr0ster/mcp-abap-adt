/**
 * One failure reader (spec §7.1, D14): what a thrown value is, as the
 * answer the MCP client gets — read by structure, through auth-errors.
 *
 * `failureOf` is total and reads nothing it should not: every property is
 * read once, as an own data property (a getter is never run; a Proxy whose
 * trap throws reads as absent); no `message`, no `name`, no `cause`, no
 * `stack`, and no `instanceof` of a chain class. What a value is, auth-errors
 * decides (`isAuthProviderFailure`, `readFailure`, `classify`): the reader
 * only finds where a chain error sits.
 */

import {
  authError,
  classify,
  isAuthProviderErrorKind,
  isAuthProviderFailure,
  readFailure,
} from '@mcp-abap-adt/auth-errors';
import type {
  AuthProviderErrorKind,
  IAuthProviderError,
} from '@mcp-abap-adt/interfaces-auth';
import { serverRefusalOf } from './serverRefusal';

/**
 * connection's `ADT_REQUEST_ERROR.ABORTED` (D34): the code of a request the
 * caller's signal aborted. Held here until connection 15 exports it (C2).
 */
export const ADT_REQUEST_ABORTED = 'ADT_REQUEST_ABORTED';

/** The fixed words of an aborted request (D34). */
export const REQUEST_ABORTED_WORDS = 'The request was cancelled.';

/** What a failure answers as its `error` (spec §7.3). */
export type FailureCode =
  | 'authentication_failed'
  | 'request_aborted'
  | 'destination_refused'
  | 'fresh_connection_unavailable'
  | 'inspection_only'
  | 'credentials_required';

/**
 * A failure as it was read: the fields of the §7.3 answer, and the chain's
 * error itself for the stderr line (`logFields`) and the server's sentence.
 */
export interface ReadFailure {
  readonly error: FailureCode;
  /** The chain error's `kind` (`authentication_failed` only). */
  readonly kind?: AuthProviderErrorKind;
  /** Words decided by auth-errors or by the server — never a thrown value's message. */
  readonly message: string;
  readonly hint?: string;
  /** The kind of the chain error a destination refusal carries. */
  readonly causeKind?: AuthProviderErrorKind;
  /** The server's own sentence beside a chain failure (§7.4). */
  readonly server?: string;
  /** The chain's error: stderr only (`logFields`), never rendered whole. */
  readonly authError?: IAuthProviderError;
}

/** An own data property of an object or function; `undefined` otherwise. */
export function readOwn(value: unknown, key: string): unknown {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
}

/**
 * What a reader that threw is answered as: auth-errors' fixed `unknown`
 * words — nothing of the reader's throw.
 */
export function readerFailed(): ReadFailure {
  return authenticationFailed(
    authError.unknown({ operation: 'unfamiliar-error' }),
  );
}

/**
 * `read(thrown)`, guarded: a reader the caller does not own (an override, a
 * host's) that throws answers `readerFailed()`.
 */
export function readGuarded(
  read: (thrown: unknown) => ReadFailure | undefined,
  thrown: unknown,
): ReadFailure | undefined {
  try {
    return read(thrown);
  } catch {
    return readerFailed();
  }
}

/** A chain failure, in the answer's fields. */
export function authenticationFailed(error: IAuthProviderError): ReadFailure {
  return {
    error: 'authentication_failed',
    kind: error.kind,
    message: error.reason,
    ...(error.hint !== undefined ? { hint: error.hint } : {}),
    authError: error,
  };
}

/** Step 1 or 2 on one value: an `AuthProviderFailure`, or an error with a known `kind`. */
function chainErrorIn(value: unknown): IAuthProviderError | undefined {
  if (isAuthProviderFailure(value)) {
    return readFailure(value, 'unfamiliar-error');
  }
  if (isAuthProviderErrorKind(readOwn(value, 'kind'))) {
    return classify(value, 'unfamiliar-error');
  }
  return undefined;
}

/**
 * The chain error a thrown value is or carries:
 * 1. an `AuthProviderFailure`;
 * 2. an own `refusal` with a known `kind` (connection's `AuthRefusedError`);
 * 3b. an own `refusal` that is itself one of these (an `IAdtError`, or
 *     adt-clients' thrown error, carrying the connection's failure).
 */
function chainErrorOf(thrown: unknown): IAuthProviderError | undefined {
  if (isAuthProviderFailure(thrown)) {
    return readFailure(thrown, 'unfamiliar-error');
  }
  const refusal = readOwn(thrown, 'refusal');
  if (refusal === undefined) return undefined;
  return chainErrorIn(refusal) ?? chainErrorIn(readOwn(refusal, 'refusal'));
}

/**
 * What `thrown` is, as the client's answer; `undefined` when it is not a
 * failure this reader knows — the caller answers it as before. Total.
 */
export function failureOf(thrown: unknown): ReadFailure | undefined {
  try {
    const chain = chainErrorOf(thrown);
    if (chain !== undefined) return authenticationFailed(chain);
    if (readOwn(thrown, 'code') === ADT_REQUEST_ABORTED) {
      return { error: 'request_aborted', message: REQUEST_ABORTED_WORDS };
    }
    const own = serverRefusalOf(thrown);
    if (own !== undefined) return { error: own.code, message: own.words };
    return undefined;
  } catch {
    return undefined;
  }
}
