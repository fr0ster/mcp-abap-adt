/**
 * The server's own refusals: words decided by the server
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
  | 'instance_closed'
  | 'batch_mode_unavailable'
  | 'batch_mode_on'
  | 'batch_mode_other'
  | 'batch_mode_off'
  | 'batch_not_recordable'
  | 'batch_other_kind'
  | 'batch_no_timeout'
  | 'batch_ended'
  | 'batch_parts_mismatch'
  | 'batch_unsplit'
  | 'long_session_unavailable';

/** Inspection-only mode: stdio started without a destination. */
export const INSPECTION_ONLY_WORDS =
  'inspection-only mode: no connection parameters. To connect to an SAP system, use --mcp=<destination> or --env-path=<path>.';

/** An operation that needs a session of its own on a host's connection. */
export const FRESH_CONNECTION_UNAVAILABLE_WORDS =
  'This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)';

/** HTTP and SSE: a request without credentials. */
export const CREDENTIALS_REQUIRED_WORDS =
  "this server takes credentials only from the request's headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and x-sap-password";

/** HTTP and SSE: a request carrying `x-mcp-destination`, refused as `destination_refused`. */
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

/** The batch tools on an instance whose host gave it no batch owner (`batch`). */
export const BATCH_MODE_UNAVAILABLE_WORDS =
  'batch mode is not available here: the host gave this server none';

/**
 * The session tools on an instance whose host keeps no long session for it
 * (only the Streamable HTTP server gives one).
 */
export const LONG_SESSION_UNAVAILABLE_WORDS =
  'a long session is not available here: only the Streamable HTTP server keeps one';

/** A begin while a batch of the same kind is open. */
export const BATCH_MODE_ON_WORDS =
  'a batch of this kind is already open on this server: end it before beginning another';

/**
 * A begin or an end while the batch of the other kind is open: a
 * communication batch and a debugger batch are never open together.
 */
export const BATCH_MODE_OTHER_WORDS =
  'the other kind of batch is open on this server (a communication batch and a debugger batch are never open together): end the open one first';

/** An end, or a batch operation, with no batch of that kind open. */
export const BATCH_MODE_OFF_WORDS =
  'no batch of this kind is open on this server: begin one first';

/** A long read given `timeout` in batch mode: refused before anything is recorded. */
export const BATCH_NO_TIMEOUT_WORDS =
  'in batch mode a read takes no timeout: the batch is sent at BatchEnd, with no deadline';

/**
 * A request of a recorded call after its batch ended: a handler resumed when
 * its number is read sends nothing more, and this refusal is its answer.
 */
export const BATCH_ENDED_WORDS =
  'the batch has ended; this call can send nothing more';

/** `BatchEnd`'s error: the envelope's answer did not split into parts. */
export const BATCH_UNSPLIT_WORDS =
  "the envelope's answer could not be split into the calls' parts";

/**
 * `BatchEnd`'s error: fewer parts came than requests were sent, so no part
 * can be matched to its call.
 */
export function batchPartsMismatchWords(
  received: number,
  sent: number,
): string {
  return `${received} of ${sent} parts came; the answers cannot be matched to the calls`;
}

/**
 * `BatchEnd`'s error (`batch_parts_mismatch`): more parts came than requests
 * were sent. adt-clients settles one part per request and drops the rest
 * unread, so how many more is not known here.
 */
export function batchMorePartsWords(sent: number): string {
  return `more parts came than the ${sent} requests sent; the answers cannot be matched to the calls`;
}

/**
 * A call no entry of `tools/batch-handlers.json` admits, in a communication
 * batch: a request of it depends on another's answer (or it sends none).
 */
export function batchNotRecordableWords(tool: string): string {
  return `${tool} builds a request from another's answer and cannot be recorded in batch mode; record its steps with the low-level tools — compact: HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet — each phase its own batch`;
}

/**
 * A tool refused only because a batch is open (a debugger tool, a
 * leftover-session tool, a registry's own tool), answered as
 * `batch_not_recordable`.
 */
export function batchNotServedWords(tool: string): string {
  return `${tool} is not served while a batch is open`;
}

/**
 * A call whose request is of another session kind than the open batch
 * holds: a batch is homogeneous — LOCK, UNLOCK or stateless, as the first
 * recorded call decided — so every batch end sends one envelope. `kind` and
 * `holds` are the labels of `sessionKindLabel`. `recorded`: the call's
 * number, when an earlier part of it was recorded before this one was
 * refused.
 */
export function batchOtherKindWords(
  tool: string,
  kind: string,
  holds: string,
  recorded?: number,
): string {
  const words = `${tool} is a ${kind} request; this batch holds ${holds} requests — record it in the next batch`;
  return recorded === undefined
    ? words
    : `${words}. An earlier part of this call was recorded, under number ${recorded}, and will be sent at the batch end; its answer under that number is this refusal`;
}

/** The refusals whose words are given at construction. */
type WordedCode =
  | 'destination_refused'
  | 'background_run_limit'
  | 'batch_not_recordable'
  | 'batch_other_kind'
  | 'batch_parts_mismatch';

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
  batch_mode_unavailable: BATCH_MODE_UNAVAILABLE_WORDS,
  batch_mode_on: BATCH_MODE_ON_WORDS,
  batch_mode_other: BATCH_MODE_OTHER_WORDS,
  batch_mode_off: BATCH_MODE_OFF_WORDS,
  batch_no_timeout: BATCH_NO_TIMEOUT_WORDS,
  batch_ended: BATCH_ENDED_WORDS,
  batch_unsplit: BATCH_UNSPLIT_WORDS,
  long_session_unavailable: LONG_SESSION_UNAVAILABLE_WORDS,
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
   * `batch_not_recordable` in `batchNotRecordableWords` or
   * `batchNotServedWords`; `batch_other_kind` in `batchOtherKindWords`;
   * `batch_parts_mismatch` in `batchPartsMismatchWords` or
   * `batchMorePartsWords`.
   */
  constructor(code: WordedCode, words: string);
  constructor(code: ServerRefusalCode, words?: string) {
    const text =
      code === 'destination_refused' ||
      code === 'background_run_limit' ||
      code === 'batch_not_recordable' ||
      code === 'batch_other_kind' ||
      code === 'batch_parts_mismatch'
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
