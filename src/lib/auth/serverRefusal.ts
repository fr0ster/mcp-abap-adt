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

import type { ConnectionCauseCode } from './connectionCause';

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
  | 'system_type_conflict'
  | 'variant_not_served'
  | 'instance_closed'
  | 'batch_mode_unavailable'
  | 'batch_mode_on'
  | 'batch_mode_other'
  | 'batch_mode_off'
  | 'batch_not_recordable'
  | 'batch_other_kind'
  | 'batch_no_background'
  | 'batch_ended'
  | 'batch_parts_mismatch'
  | 'batch_unsplit'
  | 'envelopes_unavailable'
  | 'envelope_unavailable'
  | 'envelope_limit'
  | 'envelope_not_recordable'
  | 'envelope_node_structure'
  | 'long_session_unavailable'
  | 'connection_provider_failed'
  | 'no_connection'
  | 'abapgit_not_served'
  | 'abapgit_import_not_allowed'
  | 'abapgit_background_not_declared'
  | 'abapgit_package_required'
  | 'abapgit_repository_unknown'
  | 'abapgit_run_log_not_paired'
  | 'abapgit_run_log_ambiguous'
  | 'abapgit_run_log_not_served'
  | 'abapgit_overwrite_duplicate'
  | 'abapgit_overwrite_not_declared'
  | 'abapgit_overwrite_ambiguous'
  | 'abapgit_overwrite_not_listed'
  | 'abapgit_url_refused'
  | 'abapgit_endpoint_refused'
  | 'abapgit_not_admitted'
  | AccessRefusalCode;

/**
 * The refusals of a call an access-check strategy refused (spec §3.4):
 * named in the strategy's verdict, worded here from its argument and value.
 */
export type AccessRefusalCode =
  | 'package_not_allowed'
  | 'package_tree_unreadable'
  | 'request_not_allowed'
  | 'table_not_allowed';

/**
 * An abapGit call on a system whose discovery does not list
 * `/sap/bc/adt/abapgit/repos`, or could not be read (spec §4.5).
 */
export const ABAPGIT_NOT_SERVED_WORDS =
  'abapGit is not served by this system: its discovery does not list it, or could not be read; nothing was sent';

/** Link or pull while an allowed-packages or allowed-requests entry is configured (spec §4.3). */
export const ABAPGIT_IMPORT_NOT_ALLOWED_WORDS =
  'linking or pulling a repository writes objects that the allowed packages and requests cannot bound, so it is refused while access restrictions are configured';

/** `background` on an abapGit call whose schema does not declare it (spec §4.6). */
export const ABAPGIT_BACKGROUND_NOT_DECLARED_WORDS =
  'background is taken only by an on-premise link, pull or push of a repository; this call does not take it, and nothing was sent';

/** A blank `package_name` on link or branch info (spec §4.4). */
export const ABAPGIT_PACKAGE_REQUIRED_WORDS =
  'package_name is required and may not be blank to link a repository or read its branch; nothing was sent';

/** A key the repository list does not show with a package and a URL, or an unreadable list (spec §4.4). */
export const ABAPGIT_REPOSITORY_UNKNOWN_WORDS =
  'the repository list does not show repository_key with its package and URL, or could not be read, so the call is not checked; nothing but the list was sent';

/** A run-log key the repository list does not show for that repository (spec §4.1). */
export const ABAPGIT_RUN_LOG_NOT_PAIRED_WORDS =
  'app_log_key is not the run log the repository list shows for repository_key; nothing but the list was sent';

/** An R1 entry carrying more than one log_link: which run it names is not known (spec §4.1). */
export const ABAPGIT_RUN_LOG_AMBIGUOUS_WORDS =
  'the repository list shows more than one run log for repository_key, so which one app_log_key names is not known; nothing but the list was sent';

/** The run log asked of an on-premise system, whose R1 carries no log_link (measured 2026-11-22). */
export const ABAPGIT_RUN_LOG_NOT_SERVED_WORDS =
  'on premise abapGit keeps no run log in its repository list, so no run log can be read there; nothing was sent';

/** A pull's `overwrite` naming one object twice. */
export const ABAPGIT_OVERWRITE_DUPLICATE_WORDS =
  'overwrite names one object twice: name each object once, by its type and name as GetAbapGitModifiedObjects answers them; nothing was sent';

/** A pull's `overwrite` naming an object the modified-objects read (R6) does not list. */
export const ABAPGIT_OVERWRITE_NOT_LISTED_WORDS =
  'overwrite names an object the modified-objects read does not list for repository_key: name objects by their type and name as GetAbapGitModifiedObjects answers them; the repository list and the modified-objects read were sent, no pull';

/** A pull's `overwrite` on a system whose pull takes no selection (on premise). */
export const ABAPGIT_OVERWRITE_NOT_DECLARED_WORDS =
  'overwrite is taken by the pull on ABAP Cloud only: on premise SAP pulls every changed object; nothing was sent';

/** A selected name R6 lists under another type too: SAP's job matches by name alone. */
export const ABAPGIT_OVERWRITE_AMBIGUOUS_WORDS =
  'overwrite names an object whose name the modified-objects read lists under another type too, and SAP selects by name within each of its two lists, so a collision inside one list could take an object not named; the server refuses a collision inside one list and across both lists alike; the repository list and the modified-objects read were sent, no pull';

/** A `url` argument that is no URL, or carries userinfo, a query, a fragment or a dot segment (spec §5.1). */
export const ABAPGIT_URL_REFUSED_WORDS =
  'url is not an absolute URL written as the URL parser writes it, or carries a user or a password, a query, a fragment or a dot segment: give the remote URL alone — the credential comes from the approved endpoints; nothing was sent';

/** A request whose `x-abapgit-*` headers state no endpoint that can be one (spec §5.2). */
export const ABAPGIT_ENDPOINT_REFUSED_WORDS =
  'the x-abapgit-remote, x-abapgit-user and x-abapgit-token headers state no approved endpoint: an https URL without a user, a password, a query or a fragment, with a user and a token; nothing was sent';

/** An abapGit tool reached without the server's admission (a registry path that bypasses its dispatch). */
export const ABAPGIT_NOT_ADMITTED_WORDS =
  "the abapGit call reached its tool without the server's admission (the repository list read, the endpoint binding), so it is not sent; nothing was sent";

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
 * `background_runs_unavailable` on an injected connection that answers no
 * URL (RFC) when the host stated no `system`: a run is kept only for a
 * caller whose system is known.
 */
export const BACKGROUND_RUNS_NO_SYSTEM_WORDS =
  'background runs are not available here: the connection the host gave answers no URL, and the host stated no `system` (EmbeddableMcpServerOptions.system) to identify the system a run is kept for';

/**
 * A `run_handle` that names no background run of the caller's: unknown or
 * someone else's — the same words for each.
 */
export const BACKGROUND_RUN_NOT_AVAILABLE_WORDS =
  'no background run of yours with this run_handle is available';

/** A discard of a run still running: it cannot be stopped. */
export const BACKGROUND_RUN_RUNNING_WORDS =
  'this background run is still running and cannot be discarded here: a started code run runs to its end; discard it once it has finished';

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

/**
 * A member only the on-premise table (`ADT_TYPES_ONPREM`) lists, asked of a
 * connection declared `cloud`. Its tools are not registered for that
 * variant; refused before anything is sent to the system.
 */
export const VARIANT_NOT_SERVED_WORDS =
  'this operation is served on an on-premise system only (system type onprem): the ADT type table of the declared system type does not list it; nothing was sent to the system';

/** The batch tools on an instance whose host gave it no batch owner (`batch`). */
export const BATCH_MODE_UNAVAILABLE_WORDS =
  'batch mode is not available here: the host gave this server none';

/**
 * The session tools on an instance whose host keeps no long session for it
 * (only the Streamable HTTP server gives one).
 */
export const LONG_SESSION_UNAVAILABLE_WORDS =
  'a long session is not available here: only the Streamable HTTP server keeps one';

/**
 * A call on tools registered with `HandlerExporter.registerOnServer` whose
 * connection provider (the embedder's) threw or rejected with anything but a
 * credential failure: the call has no connection, and the tool did not run.
 * Nothing of what the provider threw is in the words.
 */
export const CONNECTION_PROVIDER_FAILED_WORDS =
  "the embedder's connection provider failed, so this call has no connection; the tool did not run";

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

/** A long read given `background: true` in batch mode: refused before anything is recorded. */
export const BATCH_NO_BACKGROUND_WORDS =
  'in batch mode a read takes no background: it is recorded, and the batch is sent at its end';

/**
 * A request of a recorded call after its batch ended: a handler resumed when
 * its number is read sends nothing more, and this refusal is its answer.
 */
export const BATCH_ENDED_WORDS =
  'the batch has ended; this call can send nothing more';

/** The batch end's error: the envelope's answer did not split into parts. */
export const BATCH_UNSPLIT_WORDS =
  "the envelope's answer could not be split into the calls' parts";

/**
 * the batch end's error: fewer parts came than requests were sent, so no part
 * can be matched to its call.
 */
export function batchPartsMismatchWords(
  received: number,
  sent: number,
): string {
  return `${received} of ${sent} parts came; the answers cannot be matched to the calls`;
}

/**
 * the batch end's error (`batch_parts_mismatch`): more parts came than requests
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
  return `${tool} builds a request from another's answer and cannot be recorded in batch mode; record its steps with the low-level tools — compact: HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerLock with action unlock, HandlerGet — each phase its own batch`;
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

/** An envelope tool, or a read with `envelope_handle`, on an instance whose host gave no envelope owner. */
export const ENVELOPES_UNAVAILABLE_WORDS =
  'this server instance keeps no envelopes';

/**
 * An envelope handle that names no envelope of this session: unknown,
 * another session's, executed, discarded or ended — one answer for all.
 */
export const ENVELOPE_UNAVAILABLE_WORDS = 'envelope is not available';

/** A create refused at the consumer's bound on open envelopes (`--batch-open-envelopes`). */
export function envelopeLimitWords(bound: number): string {
  return `${bound} envelopes are open, the bound set by --batch-open-envelopes / openEnvelopes; execute or discard one first`;
}

/** A call given `envelope_handle` that no core entry of `tools/batch-handlers.json` admits. */
export function envelopeNotRecordableWords(tool: string): string {
  return `${tool} is not recorded into an envelope with these arguments; call it without envelope_handle`;
}

/**
 * A second node-structure request in one envelope. `recorded`: the call's
 * number, when a part of it was recorded before this one was refused.
 */
export function envelopeNodeStructureWords(
  recorded: number | undefined,
): string {
  const words =
    'this envelope already holds a node structure read; record this one into another envelope';
  return recorded === undefined
    ? words
    : `${words} (the part recorded before it is sent at execution, under number ${recorded})`;
}

/**
 * `system_type_conflict`'s words: a connection (or a call's context) of one
 * kind, handed to a server, a registration or an exporter whose one kind is
 * another — `none` where it was listed for no kind.
 */
export function systemTypeConflictWords(
  built: 'onprem' | 'cloud',
  stated: 'onprem' | 'cloud' | 'none',
): string {
  return `the system types contradict: the connection was built for ${built} and the server, registration or exporter states ${stated} — one kind: state the kind the connection was built for, or hand it a connection of its kind; nothing was sent to the system`;
}

/** The refusals whose words are given at construction. */
type WordedCode =
  | 'system_type_conflict'
  | 'destination_refused'
  | 'background_run_limit'
  | 'batch_not_recordable'
  | 'batch_other_kind'
  | 'batch_parts_mismatch'
  | 'envelope_limit'
  | 'envelope_not_recordable'
  | 'envelope_node_structure'
  | AccessRefusalCode;

/**
 * An access refusal's words: the argument the call named and its value, as
 * given (a package, a request or a table name — no secret).
 */
export function accessRefusalWords(
  code: AccessRefusalCode,
  argument: string,
  value: string,
): string {
  switch (code) {
    case 'package_not_allowed':
      return `${argument} names a package outside the allowed packages: ${value}`;
    case 'package_tree_unreadable':
      return `the package tree above ${value} could not be read, so ${argument} is not checked against the allowed packages`;
    case 'request_not_allowed':
      return `${argument} names a request outside the allowed requests: ${value}`;
    case 'table_not_allowed':
      return `the data of ${value} is not readable through this server`;
  }
}

/** The refusals whose words are fixed. */
type FixedCode = Exclude<ServerRefusalCode, WordedCode | 'no_connection'>;

/** `no_connection`'s words, built from `cause` alone. */
function noConnectionText(cause: string): string {
  return `no connection to the SAP system: the connection failed (${cause}); the next tool call tries again`;
}

/**
 * stdio with `--deferred-logon` (#353): the instance's connection could not
 * be built because the system cannot be reached. The words name the cause
 * code only — never the address, the error's message or a credential.
 */
export function noConnectionWords(cause: ConnectionCauseCode): string {
  return noConnectionText(cause);
}

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
  variant_not_served: VARIANT_NOT_SERVED_WORDS,
  instance_closed: INSTANCE_CLOSED_WORDS,
  batch_mode_unavailable: BATCH_MODE_UNAVAILABLE_WORDS,
  batch_mode_on: BATCH_MODE_ON_WORDS,
  batch_mode_other: BATCH_MODE_OTHER_WORDS,
  batch_mode_off: BATCH_MODE_OFF_WORDS,
  batch_no_background: BATCH_NO_BACKGROUND_WORDS,
  batch_ended: BATCH_ENDED_WORDS,
  batch_unsplit: BATCH_UNSPLIT_WORDS,
  envelopes_unavailable: ENVELOPES_UNAVAILABLE_WORDS,
  envelope_unavailable: ENVELOPE_UNAVAILABLE_WORDS,
  long_session_unavailable: LONG_SESSION_UNAVAILABLE_WORDS,
  connection_provider_failed: CONNECTION_PROVIDER_FAILED_WORDS,
  abapgit_not_served: ABAPGIT_NOT_SERVED_WORDS,
  abapgit_import_not_allowed: ABAPGIT_IMPORT_NOT_ALLOWED_WORDS,
  abapgit_background_not_declared: ABAPGIT_BACKGROUND_NOT_DECLARED_WORDS,
  abapgit_package_required: ABAPGIT_PACKAGE_REQUIRED_WORDS,
  abapgit_repository_unknown: ABAPGIT_REPOSITORY_UNKNOWN_WORDS,
  abapgit_run_log_not_paired: ABAPGIT_RUN_LOG_NOT_PAIRED_WORDS,
  abapgit_run_log_ambiguous: ABAPGIT_RUN_LOG_AMBIGUOUS_WORDS,
  abapgit_run_log_not_served: ABAPGIT_RUN_LOG_NOT_SERVED_WORDS,
  abapgit_overwrite_duplicate: ABAPGIT_OVERWRITE_DUPLICATE_WORDS,
  abapgit_overwrite_not_declared: ABAPGIT_OVERWRITE_NOT_DECLARED_WORDS,
  abapgit_overwrite_ambiguous: ABAPGIT_OVERWRITE_AMBIGUOUS_WORDS,
  abapgit_overwrite_not_listed: ABAPGIT_OVERWRITE_NOT_LISTED_WORDS,
  abapgit_url_refused: ABAPGIT_URL_REFUSED_WORDS,
  abapgit_endpoint_refused: ABAPGIT_ENDPOINT_REFUSED_WORDS,
  abapgit_not_admitted: ABAPGIT_NOT_ADMITTED_WORDS,
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
   * `batchMorePartsWords`; `envelope_limit` in `envelopeLimitWords`,
   * `envelope_not_recordable` in `envelopeNotRecordableWords`,
   * `envelope_node_structure` in `envelopeNodeStructureWords`; an access
   * refusal in `accessRefusalWords`.
   */
  constructor(code: WordedCode, words: string);
  /** `background_runs_unavailable` for an injected connection with no system known. */
  constructor(
    code: 'background_runs_unavailable',
    words: typeof BACKGROUND_RUNS_NO_SYSTEM_WORDS,
  );
  /** `no_connection`, its words built from the listed `cause` (`noConnectionWords`). */
  constructor(code: 'no_connection', cause: ConnectionCauseCode);
  constructor(code: ServerRefusalCode, words?: string) {
    const text =
      code === 'no_connection'
        ? noConnectionText(words ?? '')
        : (code === 'background_runs_unavailable' && words !== undefined) ||
            code === 'destination_refused' ||
            code === 'system_type_conflict' ||
            code === 'background_run_limit' ||
            code === 'batch_not_recordable' ||
            code === 'batch_other_kind' ||
            code === 'batch_parts_mismatch' ||
            code === 'envelope_limit' ||
            code === 'envelope_not_recordable' ||
            code === 'envelope_node_structure' ||
            code === 'package_not_allowed' ||
            code === 'package_tree_unreadable' ||
            code === 'request_not_allowed' ||
            code === 'table_not_allowed'
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
