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
  | 'system_lookup_failed'
  | 'cloud_without_systeminformation'
  | 'system_user_unknown'
  | 'system_type_required'
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
 * A call whose system gave no information where it must (ABAP Cloud, which
 * always has `systeminformation`): the endpoint answered without the
 * session user, another error status, or failed — a problem of the ABAP
 * system with a valid configuration (a `404` is
 * `cloud_without_systeminformation`); also a custom resolver that answered
 * nothing or threw (not a credential failure).
 * The tool did not run; the next call asks again. On stdio the same failure
 * at the start ends the process.
 */
export const SYSTEM_LOOKUP_FAILED_WORDS =
  'the ABAP system gave no session user and system id: systeminformation answered without them or with an error, a problem of the ABAP system with a valid configuration; a call needs them before its tool runs, so the tool did not run';

/**
 * A call on an ABAP Cloud destination whose system has no
 * `systeminformation` endpoint (a `404`): every ABAP Cloud system has it,
 * so the configuration or the headers are inconsistent. The tool did not
 * run; nothing is kept, so the next call asks again. On stdio the same
 * answer at the start ends the process.
 */
export const CLOUD_WITHOUT_SYSTEMINFORMATION_WORDS =
  'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run';

/**
 * A call on an on-premise system that gave no information (no
 * `systeminformation`, an answer without the user, an error) and states no
 * user either — no responsible (`SAP_RESPONSIBLE`, `x-sap-responsible`) and
 * no login (the connection's `SAP_USERNAME`, `x-sap-login`): the session
 * user is unknown, so
 * the tool does not run, and the next call asks again. The stdio start ends
 * with its own words (the launcher's).
 */
export const SYSTEM_USER_UNKNOWN_WORDS =
  'the system gave no session user (systeminformation) and the call states no user: set SAP_RESPONSIBLE or SAP_USERNAME (the destination or the environment), or send x-sap-responsible, or x-sap-login with x-sap-url, so the session user is known; the tool did not run';

/**
 * The fixed words of a connection refused because its instance is closed
 * (its stream closed, its close began) while the server keeps running.
 */
export const INSTANCE_CLOSED_WORDS =
  'the server instance is closed: no new connection is opened for it';

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

/**
 * A connection whose system kind no parameter states: `--system-type`,
 * `SAP_SYSTEM_TYPE` (the environment or the `--env` file), YAML
 * `system-type`, an embedder's `systemType` — `onprem`, `cloud` or `legacy`.
 * The kind is never guessed (from the credential, the URL or an answer).
 * Refused before anything is sent to the system.
 */
export const SYSTEM_TYPE_REQUIRED_WORDS =
  'the SAP system type is not stated: set --system-type, SAP_SYSTEM_TYPE (the environment or the --env file) or system-type (YAML) to onprem, cloud or legacy — an embedding host passes systemType; nothing was sent to the system';

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
  system_lookup_failed: SYSTEM_LOOKUP_FAILED_WORDS,
  cloud_without_systeminformation: CLOUD_WITHOUT_SYSTEMINFORMATION_WORDS,
  system_user_unknown: SYSTEM_USER_UNKNOWN_WORDS,
  system_type_required: SYSTEM_TYPE_REQUIRED_WORDS,
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
