/**
 * The server's own refusals (spec §7.3, D17): words decided by the server
 * before anything reaches a provider or a connection. They are not chain
 * failures — no `kind`, no `refusal` — and carry nothing read from a file, a
 * header or a server.
 *
 * The reader knows one by the object, not by its shape or its message: each
 * refusal is recorded when it is built (`serverRefusalOf`), so a forged value
 * with the same fields is not one.
 */

/** The codes of the server's own refusals, as the answer's `error` names them. */
export type ServerRefusalCode =
  | 'inspection_only'
  | 'destination_refused'
  | 'fresh_connection_unavailable'
  | 'credentials_required'
  | 'leftover_sessions_unavailable'
  | 'leftover_session_not_available'
  | 'leftover_session_not_resumable';

/** Inspection-only mode: stdio started without a destination (D17). */
export const INSPECTION_ONLY_WORDS =
  'inspection-only mode: no connection parameters. To connect to an SAP system, use --mcp=<destination> or --env-path=<path>.';

/** D20: an operation that needs a session of its own on a host's connection. */
export const FRESH_CONNECTION_UNAVAILABLE_WORDS =
  'This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)';

/** HTTP and SSE: a request without credentials. */
export const CREDENTIALS_REQUIRED_WORDS =
  "this server takes credentials only from the request's headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and x-sap-password";

/** HTTP and SSE: a request carrying `x-mcp-destination` (D39), refused as `destination_refused`. */
export const DESTINATIONS_ONLY_STDIO_WORDS =
  'destinations are served only by mcp-abap-adt (stdio); send x-sap-* headers';

/**
 * The leftover-session tools on an instance that keeps no runtime files: an
 * embedder gave no owner, or the connection was given by the host.
 */
export const LEFTOVER_SESSIONS_UNAVAILABLE_WORDS =
  'leftover sessions are not available here: this server keeps no record of the SAP sessions it holds';

/**
 * A handle that names no leftover session of the caller's: unknown, someone
 * else's, one whose process still runs, or one already being worked on —
 * the same words for each.
 */
export const LEFTOVER_SESSION_NOT_AVAILABLE_WORDS =
  'no leftover session of yours with this handle is available';

/** A resume of a debugger's session: only an instance's own session resumes. */
export const LEFTOVER_SESSION_NOT_RESUMABLE_WORDS =
  "a debugger's session cannot be resumed (its listener, breakpoints and poll lived in the ended process); log it off instead";

/** The refusals whose words are fixed. */
type FixedCode = Exclude<ServerRefusalCode, 'destination_refused'>;

const WORDS: Readonly<Record<FixedCode, string>> = {
  inspection_only: INSPECTION_ONLY_WORDS,
  fresh_connection_unavailable: FRESH_CONNECTION_UNAVAILABLE_WORDS,
  credentials_required: CREDENTIALS_REQUIRED_WORDS,
  leftover_sessions_unavailable: LEFTOVER_SESSIONS_UNAVAILABLE_WORDS,
  leftover_session_not_available: LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
  leftover_session_not_resumable: LEFTOVER_SESSION_NOT_RESUMABLE_WORDS,
};

/** What the reader knows of a refusal: recorded at construction. */
const recorded = new WeakMap<
  object,
  { readonly code: ServerRefusalCode; readonly words: string }
>();

export class ServerRefusal extends Error {
  /** Which refusal: the answer's `error`. */
  readonly serverRefusal: ServerRefusalCode;

  /** A refusal in its fixed words. */
  constructor(code: FixedCode);
  /**
   * `destination_refused` in vetted words: a parameter's label and the
   * user's own input (a path they gave) — never a file's content.
   */
  constructor(code: 'destination_refused', words: string);
  constructor(code: ServerRefusalCode, words?: string) {
    const text = code === 'destination_refused' ? (words ?? '') : WORDS[code];
    super(text);
    this.name = 'ServerRefusal';
    this.serverRefusal = code;
    recorded.set(this, { code, words: text });
  }
}

/** The refusal `value` is, when the server built it; `undefined` otherwise. Total. */
export function serverRefusalOf(
  value: unknown,
): { readonly code: ServerRefusalCode; readonly words: string } | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return undefined;
  }
  return recorded.get(value);
}
