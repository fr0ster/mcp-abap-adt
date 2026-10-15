/**
 * The header connection source: what the Streamable
 * HTTP and the SSE transports take credentials from — only the `x-sap-*`
 * headers of a request (http: each request; sse: the `GET` that opens a
 * connection) — and how a request they refuse is answered. One
 * implementation for both transports, so neither imports the other.
 *
 * Nothing is stored, shared or cached here: each call builds its own
 * credential from the headers it is given.
 */

import type {
  ConnectionContext,
  ConnectionSource,
  ResolvedConnection,
} from '../../embeddable/ConnectionContext';
import { failureLogLine } from '../auth/answerFailure';
import { failureOf, readGuarded } from '../auth/failures';
import {
  DESTINATIONS_ONLY_STDIO_WORDS,
  ServerRefusal,
  serverRefusalOf,
} from '../auth/serverRefusal';
import { credentialFromHeaders } from '../credentialSources';

export type RequestHeaders = Record<string, string | string[] | undefined>;

/** A header's first value; node lowercases names, an embedder's object may not. */
function header(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `x-mcp-destination` is refused, never ignored: destinations are
 * served only by core's stdio binary. Any value, an empty one included.
 */
export function refuseDestinationHeader(headers: RequestHeaders): void {
  if (
    headers['x-mcp-destination'] !== undefined ||
    headers['X-MCP-DESTINATION'] !== undefined
  ) {
    throw new ServerRefusal(
      'destination_refused',
      DESTINATIONS_ONLY_STDIO_WORDS,
    );
  }
}

/** `x-sap-url` with `x-sap-jwt-token`, or with `x-sap-login` and `x-sap-password`. */
export function hasHeaderCredentials(headers: RequestHeaders): boolean {
  const url = header(headers, 'x-sap-url');
  const token = header(headers, 'x-sap-jwt-token');
  const login = header(headers, 'x-sap-login');
  const password = header(headers, 'x-sap-password');
  return Boolean(url && (token || (login && password)));
}

/**
 * The headers as a `ConnectionSource`: `credentialFromHeaders` once, here —
 * `TokenAuthProvider.fixed(token)` or `new BasicAuthProvider(user,
 * password)` — and the same answer to every `resolve`, so one SSE
 * connection keeps one connection and each HTTP request (a source of its
 * own) builds its own. A basic connection logs on as `x-sap-login`: that is
 * its login, the responsible when none is stated.
 *
 * Refused with `destination_refused` when `x-mcp-destination` is present,
 * with `credentials_required` when the credentials are not there.
 */
export function headerSource(headers: RequestHeaders): ConnectionSource {
  refuseDestinationHeader(headers);
  if (!hasHeaderCredentials(headers)) {
    throw new ServerRefusal('credentials_required');
  }
  const { settings, credential } = credentialFromHeaders(headers);
  const login =
    settings.authType === 'basic' ? header(headers, 'x-sap-login') : undefined;
  const resolved: ResolvedConnection = {
    settings,
    credential,
    ...(login ? { systemContext: { login } } : {}),
  };
  return { resolve: async () => resolved };
}

/**
 * The instance's context from the headers: `headerSource`, plus what the
 * request states beside its credential (`x-sap-master-system`,
 * `x-sap-responsible`, `x-sap-language`) as metadata. The request scope
 * (`runWithRequestContext`) carries those per dispatch; nothing reaches the
 * process-global system context (#110).
 */
export function headerContext(headers: RequestHeaders): ConnectionContext {
  const source = headerSource(headers);
  const metadata: Record<string, string> = {};
  const masterSystem = header(headers, 'x-sap-master-system');
  const responsible = header(headers, 'x-sap-responsible');
  const masterLanguage = header(headers, 'x-sap-language');
  if (masterSystem) metadata.masterSystem = masterSystem;
  if (responsible) metadata.responsible = responsible;
  if (masterLanguage) metadata.masterLanguage = masterLanguage;
  return {
    kind: 'built',
    source,
    sessionId: header(headers, 'x-sap-jwt-token')
      ? 'direct-jwt'
      : 'direct-basic',
    metadata,
  };
}

/** How a transport answers a request it could not serve. */
export interface RequestFailureAnswer {
  status: number;
  text: string;
  /** Whether the text is the failure's own vetted words. */
  known: boolean;
  /** What stderr gets of a read failure. */
  logLine?: string;
}

/**
 * A refused request is the client's (`400`, the refusal's fixed words); a
 * failure lib's reader knows is answered in the failure answer's words, with `logLine`
 * for stderr (`logFields`); anything else as `Internal Server Error`,
 * without its message.
 */
export function requestFailureAnswer(error: unknown): RequestFailureAnswer {
  const refusal = serverRefusalOf(error);
  if (
    refusal !== undefined &&
    (refusal.code === 'credentials_required' ||
      refusal.code === 'destination_refused')
  ) {
    return { status: 400, text: refusal.words, known: true };
  }
  const answer = readGuarded(failureOf, error);
  if (answer !== undefined) {
    const text = [answer.message, answer.hint, answer.server]
      .filter((line): line is string => line !== undefined)
      .join('\n');
    return {
      status: 500,
      text,
      known: true,
      logLine: failureLogLine('request', answer),
    };
  }
  return { status: 500, text: 'Internal Server Error', known: false };
}
