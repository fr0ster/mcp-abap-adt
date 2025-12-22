/**
 * Handlers module exports
 *
 * This module provides:
 * - Interfaces for handler groups and registries
 * - Base classes for creating handler groups
 * - Composite registry that supports Dependency Injection of handler groups
 * - Concrete handler group implementations
 * - HandlerExporter for easy integration with external servers
 */

// Base classes
export { BaseHandlerGroup } from './base/BaseHandlerGroup.js';
// Handler groups
export * from './groups/index.js';
export type { HandlerExporterOptions } from './HandlerExporter.js';
// Handler exporter for external server integration
export {
  createDefaultHandlerExporter,
  HandlerExporter,
} from './HandlerExporter.js';
// Interfaces
export * from './interfaces.js';
// Registry implementations
export { CompositeHandlersRegistry } from './registry/CompositeHandlersRegistry.js';
