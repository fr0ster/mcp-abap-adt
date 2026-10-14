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
  | 'background_runs_unavailable'
  | 'background_run_not_available'
  | 'background_run_running'
  | 'background_run_limit'
  | 'background_run_caller_unknown'
  | 'system_lookup_failed'
  | 'system_without_user'
  | 'instance_closed';

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

/**
 * `background: true` on an instance whose host gave no store for background
 * runs (an embedder without `backgroundRuns`), and the background-run tools
 * there.
 */
export const BACKGROUND_RUNS_UNAVAILABLE_WORDS =
  'background runs are not available here: the host gave this server no store for them';

/**
 * A `run_handle` that names no background run of the caller's: unknown or
 * someone else's — the same words for each.
 */
export const BACKGROUND_RUN_NOT_AVAILABLE_WORDS =
  'no background run of yours with this run_handle is available';

/** A discard of a run still running: it cannot be stopped. */
export const BACKGROUND_RUN_RUNNING_WORDS =
  'this background run is still running and cannot be discarded: a started run cannot be stopped; discard it once it has finished';

/**
 * A call on a connection without its system information: the
 * `systeminformation` lookup asked before the tool runs failed — for a
 * reason that is not a chain failure, and not an on-premise system without
 * the function (`404`), where the configuration applies. The tool did not run; the next call
 * asks again. On stdio the same failure at the start ends the process.
 */
export const SYSTEM_LOOKUP_FAILED_WORDS =
  'the system could not be asked for the session user and system id (systeminformation), which a call needs before its tool runs; the tool did not run. Retry when the system is available';

/**
 * A call on a connection whose system answered `systeminformation`
 * without a user: not a valid ABAP system for this server. The tool did not
 * run; nothing of the answer is kept, so the next call asks again. On stdio
 * the same answer at the start ends the process.
 */
export const SYSTEM_WITHOUT_USER_WORDS =
  'the system answered systeminformation without a user, so it is not a valid ABAP system for this server; the tool did not run';

/**
 * The fixed words of a connection refused because its instance is closed
 * (its stream closed, its close began) while the server keeps running.
 */
export const INSTANCE_CLOSED_WORDS =
  'the server instance is closed: no new connection is opened for it';

/** A background run whose request names no backend user, and SAP named none either. */
export const BACKGROUND_RUN_CALLER_UNKNOWN_WORDS =
  'a background run is kept for the backend user of the request, and none could be determined (the request names none and the system answered none)';

/**
 * A background run beyond the caller's limit (running plus kept): the
 * limit, and the tool that removes a finished run's answer.
 */
export function backgroundRunLimitWords(
  limit: number,
  discardTool: string,
): string {
  return `background run refused: you hold ${limit} background runs (running and kept), the limit; discard a finished one with ${discardTool} first`;
}

/** The refusals whose words are given at construction. */
type WordedCode = 'destination_refused' | 'background_run_limit';

/** The refusals whose words are fixed. */
type FixedCode = Exclude<ServerRefusalCode, WordedCode>;

const WORDS: Readonly<Record<FixedCode, string>> = {
  inspection_only: INSPECTION_ONLY_WORDS,
  fresh_connection_unavailable: FRESH_CONNECTION_UNAVAILABLE_WORDS,
  credentials_required: CREDENTIALS_REQUIRED_WORDS,
  leftover_sessions_unavailable: LEFTOVER_SESSIONS_UNAVAILABLE_WORDS,
  leftover_session_not_available: LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
  background_runs_unavailable: BACKGROUND_RUNS_UNAVAILABLE_WORDS,
  background_run_not_available: BACKGROUND_RUN_NOT_AVAILABLE_WORDS,
  background_run_running: BACKGROUND_RUN_RUNNING_WORDS,
  background_run_caller_unknown: BACKGROUND_RUN_CALLER_UNKNOWN_WORDS,
  system_lookup_failed: SYSTEM_LOOKUP_FAILED_WORDS,
  system_without_user: SYSTEM_WITHOUT_USER_WORDS,
  instance_closed: INSTANCE_CLOSED_WORDS,
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
   * `background_run_limit` in `backgroundRunLimitWords`.
   */
  constructor(code: WordedCode, words: string);
  constructor(code: ServerRefusalCode, words?: string) {
    const text =
      code === 'destination_refused' || code === 'background_run_limit'
        ? (words ?? '')
        : WORDS[code];
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
