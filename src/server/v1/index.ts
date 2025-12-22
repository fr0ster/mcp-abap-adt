/**
 * MCP ABAP ADT Handler Exporter (v1)
 *
 * This module exports ABAP ADT handlers for integration with external MCP servers.
 * It provides a clean API for registering handlers on any McpServer instance.
 *
 * Usage:
 * ```typescript
 * import { HandlerExporter } from '@fr0ster/mcp-abap-adt';
 *
 * // Create exporter
 * const exporter = new HandlerExporter();
 *
 * // Register on your McpServer with connection provider
 * exporter.registerOnServer(mcpServer, () => getConnection());
 * ```
 *
 * For legacy server functionality, import from './legacy-server.js'
 */

// Re-export interfaces from interfaces package
export * from '@mcp-abap-adt/interfaces';
// Re-export config utilities
export { getConfig, setSapConfigOverride } from '../../lib/config.js';
// Re-export base class for custom handler groups
export { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup.js';

// Re-export handler groups for custom composition
export {
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../lib/handlers/groups/index.js';
export type { HandlerExporterOptions } from '../../lib/handlers/HandlerExporter.js';
// Re-export handler exporter
export {
  createDefaultHandlerExporter,
  HandlerExporter,
} from '../../lib/handlers/HandlerExporter.js';
// Re-export interfaces
export * from '../../lib/handlers/interfaces.js';
// Re-export registry
export { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry.js';
export type { EmbeddableServerOptions } from './embeddable-server.js';
// Re-export embeddable server for external HTTP server integration
export { EmbeddableMcpServer } from './embeddable-server.js';
