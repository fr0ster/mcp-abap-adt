/**
 * The embeddable MCP server, for hosting ADT tools inside your own application.
 *
 * This is the Apache-2.0 half of the project. It carries no transport: a host
 * application supplies its own, which is what makes it embeddable. The
 * standalone server — stdio, SSE and streamable HTTP, the launcher and the CLI —
 * is the separate `@mcp-abap-adt/core` package and is AGPL-3.0-only.
 *
 * Keeping them apart is the point. A network service that linked the AGPL
 * server would take on its section 13 obligations; one that embeds this package
 * does not.
 */

import '../lib/instance.js';

export { type ActiveTool, activeTools } from '../lib/activeTools.js';
/**
 * The corrected request header pairs of the systems the process talks to
 * (`adtHeaderPairs`): a pair SAP answered `406`/`415` to, corrected, kept
 * per system and operation. A host shares one between its instances.
 */
export {
  AdtHeaderPairs,
  type AdtHeaderPort,
} from '../lib/adtHeaders/AdtHeaderPairs.js';
/**
 * Background runs of the code-running tools and the listed long reads: the strategy's contract
 * (`IBackgroundRuns`) — where runs and their answers are kept, checked
 * against the caller. lib ships no implementation: a host hands its
 * instances its own, or `@mcp-abap-adt/background-runs-memory`'s
 * (`backgroundRuns`). Without one, a code run's `background: true` is
 * refused, and a listed long tool answers its result in the call.
 */
export type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunDiscarded,
  BackgroundRunListing,
  BackgroundRunRecord,
  BackgroundRunStart,
  BackgroundRunStarted,
  BackgroundRunState,
  IBackgroundRuns,
} from '../lib/backgroundRuns/index.js';
/**
 * The owner of the running background runs, by `run_handle`: a host that
 * serves one client through several instances hands each the same one
 * (`backgroundRunOwner`), so a discard reaching any of them cancels a
 * running read.
 */
export { BackgroundRunOwner } from '../lib/backgroundRuns/owner.js';
/**
 * The owner of an instance's batch state (batch mode: the open batch and the
 * last batch's answers): created by the host, one per instance, handed to it
 * (`batch`). Without one the batch tools answer `batch_mode_unavailable`.
 */
export {
  type BatchAnswer,
  type BatchKind,
  type BatchMode,
  InstanceBatch,
  type OpenBatch,
  type RawPart,
  type RecordedCall,
} from '../lib/batch/InstanceBatch.js';
/**
 * Closing an embedder's own instance when its client closed: the latch of that instance, its connections logged off at once and
 * its calls interrupted in the same tick — no running tool awaited —, its
 * state let go, its MCP server closed. The shutdown machinery itself is the launchers'
 * (`@mcp-abap-adt/lib/state`).
 */
export { type ClosableInstance, closeInstance } from '../lib/instanceClose.js';
/**
 * The owner of the process's runtime session files (leftover sessions of a
 * killed process, listed, resumed or logged off by the user): created by the
 * host, handed to its instances (`leftoverSessions`). Without one an
 * instance keeps no file. core (stdio) creates one; http and sse do not — one
 * such server holds the sessions of many users.
 */
export {
  LeftoverSessions,
  type LeftoverSessionsOptions,
  nodeProcessProbe,
  type ProcessProbe,
  type ProcessStamp,
  runtimeDirectory,
  sapAnswerOf,
} from '../lib/leftoverSessions/index.js';
export {
  currentRequestSignal,
  RequestAbortedError,
  raceRequestSignal,
  runWithRequestSignal,
  throwIfRequestAborted,
} from '../lib/requestSignal.js';
/**
 * `SearchSource`'s strategies, the consumer's: passed as
 * `EmbeddableMcpServer`'s (or `HandlerExporter`'s) `sapAnswerStrategy` and
 * `lineMatchStrategy` options; absent, the shipped ones answer.
 *
 * - The SAP-answer strategy (DO22): what a SAP answer to a failed read leads
 *   to, at its place. Only SAP answers reach it — a credential refusal ends
 *   the call, a failed batch envelope and anything that is no SAP answer are
 *   thrown, before any strategy. The shipped one, `skipSapAnswers`, skips
 *   every SAP answer.
 * - The line-match strategy (DO24): which lines of a source are hits. The
 *   shipped one, `substringLineMatch`, matches a case-insensitive substring.
 */
export type {
  LineMatchStrategy,
  ScanHit,
  ScanInput,
  ScanResult,
} from '../lib/search-source/lineMatch.js';
export { substringLineMatch } from '../lib/search-source/lineScanner.js';
export {
  type SapAnswerDecision,
  type SapAnswerPlace,
  type SapAnswerStrategy,
  skipSapAnswers,
} from '../lib/search-source/readFailure.js';
export * from './BaseMcpServer.js';
export * from './ConnectionContext.js';
export * from './EmbeddableMcpServer.js';
export * from './IHttpApplication.js';
export * from './IServerConfig.js';
export * from './MockAbapConnection.js';
