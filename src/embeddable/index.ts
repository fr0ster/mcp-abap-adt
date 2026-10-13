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

export {
  type ActiveTool,
  type ActiveToolEntry,
  activeTools,
  isLatched,
  latch,
  pending,
  SHUTDOWN_SENTENCE,
  settled,
  shutdownRefusal,
} from '../lib/activeTools.js';
export {
  type ClosableInstance,
  closeInstance,
  isClosing,
} from '../lib/instanceClose.js';
export {
  CLOSE_FAILED_WORDS,
  type ConnectionRole,
  closeOwnedConnections,
  endConnection,
  forceClose,
  isEnded,
  own,
  ownedConnections,
} from '../lib/ownedConnections.js';
export {
  currentRequestSignal,
  RequestAbortedError,
  raceRequestSignal,
  runWithRequestSignal,
  throwIfRequestAborted,
} from '../lib/requestSignal.js';
export {
  cutShortLine,
  installShutdownSequence,
  processFailedLine,
  type ShutdownProcess,
  type ShutdownRun,
  type ShutdownSequenceOptions,
  stillRunningLine,
} from '../lib/shutdownSequence.js';
export * from './BaseMcpServer.js';
export * from './ConnectionContext.js';
export * from './EmbeddableMcpServer.js';
export * from './IHttpApplication.js';
export * from './IServerConfig.js';
export * from './MockAbapConnection.js';
