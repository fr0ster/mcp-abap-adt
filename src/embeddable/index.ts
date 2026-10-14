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

export { type ActiveTool, activeTools } from '../lib/activeTools.js';
/**
 * Background runs of the code-running tools: the strategy's contract
 * (`IBackgroundRuns`) — where runs and their answers are kept, checked
 * against the caller. lib ships no implementation: a host hands its
 * instances its own, or `@mcp-abap-adt/background-runs-memory`'s
 * (`backgroundRuns`). Without one, `background: true` is refused.
 */
export type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunDiscarded,
  BackgroundRunListing,
  BackgroundRunRecord,
  BackgroundRunStart,
  BackgroundRunStarted,
  IBackgroundRuns,
} from '../lib/backgroundRuns/index.js';
/**
 * Closing an embedder's own instance (spec §6.4, D51): the latch of that
 * instance, its calls settled, its state undone, its connections logged off,
 * its MCP server closed. The shutdown machinery itself is the launchers'
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
export * from './BaseMcpServer.js';
export * from './ConnectionContext.js';
export * from './EmbeddableMcpServer.js';
export * from './IHttpApplication.js';
export * from './IServerConfig.js';
export * from './MockAbapConnection.js';
