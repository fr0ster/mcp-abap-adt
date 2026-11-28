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

import { createHash } from 'node:crypto';
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
 * password)` — and the same answer to every `resolve`. A pooled HTTP
 * instance's held connection takes each request's credential
 * (`CurrentCredential`); a new instance builds its connection with it. A
 * basic connection logs on as `x-sap-login`: that is
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
 * The instance's context from the headers: `headerSource`. What the
 * request states beside its credential (`x-sap-master-system`,
 * `x-sap-responsible`, `x-sap-language`) is carried by the request scope
 * (`runWithRequestContext`) per dispatch; nothing reaches the
 * process-global system context (#110).
 */
export function headerContext(headers: RequestHeaders): ConnectionContext {
  // The system context headers enter the request scope
  // (`requestContextFromHeaders`), never the connection context.
  return {
    kind: 'built',
    source: headerSource(headers),
    sessionDigest: sessionDigestOf(headers),
  };
}

/** The headers whose values name the destination and its credential (`credentialFromHeaders`). */
const SESSION_HEADERS = [
  'x-sap-url',
  'x-sap-client',
  'x-sap-jwt-token',
  'x-sap-login',
  'x-sap-password',
] as const;

/**
 * SHA-256 of the request's destination and credential headers, each name
 * with its value, an absent one marked absent: the same headers give the
 * same digest, whatever context object carries it. The value never leaves
 * the hash.
 */
export function sessionDigestOf(headers: RequestHeaders): Buffer {
  const hash = createHash('sha256');
  for (const name of SESSION_HEADERS) {
    const value = header(headers, name);
    hash.update(
      JSON.stringify([name, value === undefined ? null : value]),
      'utf8',
    );
  }
  return hash.digest();
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
