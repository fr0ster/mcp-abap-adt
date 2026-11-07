/**
 * The refusal stop at the connection (spec §8, "Any credential refusal stops
 * everything"; plan C2 Step 4).
 *
 * A refusal is a call that **ends** refused — after the connection's own
 * renewal and resend failed or was impossible. A renewal that succeeds (a
 * `401`, the credential renewed, the request resent, a `200`) happens inside
 * `connect()` / `makeAdtRequest()` and latches nothing; a basic credential
 * does not resend, so its `401` ends the call refused. The first refusal
 * latches the run's marker (`reportFormat`'s run directory); from then on
 * nothing is sent: within one tool call no further request — an UNLOCK, an
 * activation, a logoff — leaves.
 *
 * Every connection the test helpers create is wrapped once by
 * `refusalGuardedConnection`: a plain object delegating each member the
 * helpers and the server read, no cast, no subclass. `connect`,
 * `makeAdtRequest` and `disconnect` check the marker before they send and
 * latch it when the call ends refused. A sibling of a guarded connection —
 * what the debugger listener, a background run or a package lock opens with
 * `openFreshConnection` — is built by the fresh-connection factory registered
 * for the wrapper object, and is guarded in turn.
 */

import {
  type CreatedConnection,
  type SapConfig,
  WireLogonError,
} from '@mcp-abap-adt/connection';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { isCredentialFailure } from '../../../lib/answer';
import {
  createAbapConnection,
  systemKindOf,
} from '../../../lib/connectionFactory';
import { registerFreshConnectionFactory } from '../../../lib/packageSessions';
import { declareSystemKind } from '../../../lib/systemKind';
import { markerExists, writeMarker } from '../coverageReport/reportFormat';

/** Latches the run's credential-refusal marker: nothing is sent after it. */
export function markCredentialRefused(): void {
  writeMarker();
}

/** Whether the run's credential-refusal marker exists. */
export function credentialRefused(): boolean {
  return markerExists();
}

/** The words every refused send carries. */
export const REFUSED_AFTER_MARKER =
  'a credential was refused earlier in this run';

/** Refuses before anything is sent once the marker exists. */
export function refuseAfterMarker(what: string): void {
  if (credentialRefused()) {
    throw new Error(`${what} is not sent: ${REFUSED_AFTER_MARKER}`);
  }
}

/**
 * Whether `thrown` ends a call refused for the credential: a chain failure
 * (`authentication_failed`), a `401` SAP answered, or a logon the system
 * refused `401` (the wire's `WireLogonError`, as a destination's basic
 * logon ends — measured on the stand-in).
 */
export function isCredentialRefusal(thrown: unknown): boolean {
  return (
    isCredentialFailure(thrown) ||
    (thrown instanceof WireLogonError && thrown.status === 401)
  );
}

/** Latches the marker when `thrown` is a credential refusal; answers `thrown`. */
export function latchOnRefusal(thrown: unknown): unknown {
  if (isCredentialRefusal(thrown)) markCredentialRefused();
  return thrown;
}

/**
 * Whether a tool's answer reports a credential refusal, as the server words
 * it: a failed answer whose JSON is `authentication_failed`, or a `401` SAP
 * answered.
 */
export function refusalAnswered(isError: boolean, text: string): boolean {
  if (!isError) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof payload !== 'object' || payload === null) return false;
  return (
    Reflect.get(payload, 'error') === 'authentication_failed' ||
    Reflect.get(payload, 'status') === 401
  );
}

/**
 * Runs `send` unless the marker exists, and latches the marker when it ends
 * in a credential refusal (a broker's refusal, a logon's `401`).
 */
export async function guardedSend<T>(
  what: string,
  send: () => Promise<T>,
): Promise<T> {
  refuseAfterMarker(what);
  try {
    return await send();
  } catch (error) {
    throw latchOnRefusal(error);
  }
}

/** The members of a connection the helpers and the server read. */
export type GuardedConnection = Pick<
  CreatedConnection,
  | 'connect'
  | 'makeAdtRequest'
  | 'disconnect'
  | 'flushGoodbye'
  | 'getBaseUrl'
  | 'getSessionId'
  | 'setSessionType'
  | 'getSessionMode'
  | 'isConnected'
  | 'getConfig'
  | 'sessionCookies'
  | 'getSessionIdentity'
  | 'beginCriticalSection'
  | 'endCriticalSection'
>;

/**
 * `connection`, guarded: each member delegated; `connect`,
 * `makeAdtRequest` and `disconnect` refuse once the marker exists and latch
 * it when they end in a credential refusal. `sibling` builds a new
 * connection with the same settings and credential: the wrapper's fresh
 * connections are built by it, guarded the same way.
 */
export function refusalGuardedConnection(
  connection: CreatedConnection,
  sibling: () => CreatedConnection,
): GuardedConnection {
  const guarded: GuardedConnection = {
    connect: () => guardedSend('a logon', () => connection.connect()),
    makeAdtRequest: <T = unknown, D = unknown>(options: IAbapRequestOptions) =>
      guardedSend(`${options.method ?? 'a request'} ${options.url}`, () =>
        connection.makeAdtRequest<T, D>(options),
      ),
    disconnect: () => guardedSend('a logoff', () => connection.disconnect()),
    flushGoodbye: (timeoutMs) => connection.flushGoodbye(timeoutMs),
    getBaseUrl: () => connection.getBaseUrl(),
    getSessionId: () => connection.getSessionId(),
    setSessionType: (type) => connection.setSessionType(type),
    getSessionMode: () => connection.getSessionMode(),
    isConnected: () => connection.isConnected(),
    getConfig: () => connection.getConfig(),
    sessionCookies: () => connection.sessionCookies(),
    getSessionIdentity: () => connection.getSessionIdentity(),
    beginCriticalSection: () => connection.beginCriticalSection(),
    endCriticalSection: () => connection.endCriticalSection(),
  };
  // The kind it was built for, stated for the wrapper as for the connection.
  declareSystemKind(guarded, systemKindOf(connection));
  registerFreshConnectionFactory(guarded, async () => {
    refuseAfterMarker('a sibling connection');
    return refusalGuardedConnection(sibling(), sibling);
  });
  return guarded;
}

/**
 * A guarded connection of the test helpers, built as `createAbapConnection`
 * builds one (nothing is sent here); refused once the marker exists. Its
 * siblings take the same settings, credential, logger and kind, each in a
 * new session.
 */
export function guardedTestConnection(
  settings: SapConfig,
  credential: IAuthProvider,
  options: {
    logger?: Parameters<typeof createAbapConnection>[2];
    session?: string;
    kind?: Parameters<typeof createAbapConnection>[5];
  } = {},
): GuardedConnection {
  refuseAfterMarker('a connection');
  const built = createAbapConnection(
    settings,
    credential,
    options.logger,
    undefined,
    options.session,
    options.kind,
  );
  const kind = systemKindOf(built);
  return refusalGuardedConnection(built, () =>
    createAbapConnection(
      settings,
      credential,
      options.logger,
      undefined,
      undefined,
      kind,
    ),
  );
}
