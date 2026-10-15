/**
 * One failure reader: what a thrown value is, as the
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
import { INSTANCE_CLOSED_WORDS, serverRefusalOf } from './serverRefusal';

export { INSTANCE_CLOSED_WORDS };

/** What a failure answers as its `error`. */
export type FailureCode =
  | 'authentication_failed'
  | 'destination_refused'
  | 'fresh_connection_unavailable'
  | 'inspection_only'
  | 'credentials_required'
  | 'leftover_sessions_unavailable'
  | 'leftover_session_not_available'
  | 'background_runs_unavailable'
  | 'background_run_not_available'
  | 'background_run_running'
  | 'background_run_limit'
  | 'system_lookup_failed'
  | 'cloud_without_systeminformation'
  | 'system_user_unknown'
  | 'system_type_required'
  | 'instance_closed';

/**
 * A failure as it was read: the fields of the failure answer, and the chain's
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
  /** The server's own sentence beside a chain failure. */
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

/**
 * The chain error a thrown value is or carries:
 * 1. an `AuthProviderFailure`;
 * 2. an own `refusal` with a known `kind` (connection's `AuthRefusedError`).
 *
 * Nothing else: interfaces-adt 16 has no `IAdtError.refusal`, so an auth
 * failure inside a tool reaches the model with the connection's own words
 *.
 */
function chainErrorOf(thrown: unknown): IAuthProviderError | undefined {
  if (isAuthProviderFailure(thrown)) {
    return readFailure(thrown, 'unfamiliar-error');
  }
  const refusal = readOwn(thrown, 'refusal');
  if (!isAuthProviderErrorKind(readOwn(refusal, 'kind'))) return undefined;
  return classify(refusal, 'unfamiliar-error');
}

/** The sentence: the server's own words beside the shutdown refusal. */
export const SHUTDOWN_SENTENCE = 'The server is shutting down.';

/**
 * The shutdown refusal as the client reads it: auth-errors'
 * `interactive-login` `aborted`, minted, with the shutdown sentence beside it.
 */
export function shutdownRefusal(): ReadFailure {
  return {
    ...authenticationFailed(
      authError['interactive-login']({ outcome: 'aborted' }),
    ),
    server: SHUTDOWN_SENTENCE,
  };
}

const closedRefusals = new WeakMap<object, boolean>();

/**
 * Thrown where a connection would be opened or owned for an instance that is
 * latched closed (its close, or the process's shutdown, began): nothing is
 * sent. Known by the object, recorded at construction, never by its shape or
 * its message. Answered as the shutdown refusal when the process's shutdown
 * latched it (`byProcess`); as `instance_closed` when only the instance closed
 * (an SSE stream's close — the server keeps running).
 */
export class ClosedInstanceRefusal extends Error {
  constructor(byProcess: boolean) {
    super(INSTANCE_CLOSED_WORDS);
    this.name = 'ClosedInstanceRefusal';
    closedRefusals.set(this, byProcess);
  }
}

/** Whether `value` is a `ClosedInstanceRefusal` the server built. Total. */
export function isClosedInstanceRefusal(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    closedRefusals.has(value)
  );
}

/** The answer for a `ClosedInstanceRefusal`: the shutdown's, or the instance's own. */
function closedAnswer(value: object): ReadFailure {
  return closedRefusals.get(value) === true
    ? shutdownRefusal()
    : { error: 'instance_closed', message: INSTANCE_CLOSED_WORDS };
}

/**
 * What `thrown` is, as the client's answer; `undefined` when it is not a
 * failure this reader knows — the caller answers it as before. Total.
 */
export function failureOf(thrown: unknown): ReadFailure | undefined {
  try {
    if (isClosedInstanceRefusal(thrown)) return closedAnswer(thrown as object);
    const chain = chainErrorOf(thrown);
    if (chain !== undefined) return authenticationFailed(chain);
    const own = serverRefusalOf(thrown);
    if (own !== undefined) return { error: own.code, message: own.words };
    return undefined;
  } catch {
    return undefined;
  }
}
