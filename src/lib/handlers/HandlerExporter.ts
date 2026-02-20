import type { Logger } from '@mcp-abap-adt/logger';
import { defaultLogger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { CompactHandlersGroup } from './groups/CompactHandlersGroup.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from './groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from './interfaces.js';
import { CompositeHandlersRegistry } from './registry/CompositeHandlersRegistry.js';

/**
 * Options for creating handler exporter
 */
export interface HandlerExporterOptions {
  /**
   * Logger instance for handler context
   * @default defaultLogger
   */
  logger?: Logger;

  /**
   * Include readonly handlers (getProgram, getClass, etc.)
   * @default true
   */
  includeReadOnly?: boolean;

  /**
   * Include high-level handlers
   * @default true
   */
  includeHighLevel?: boolean;

  /**
   * Include low-level handlers
   * @default true
   */
  includeLowLevel?: boolean;

  /**
   * Include compact facade handlers
   * @default false
   */
  includeCompact?: boolean;

  /**
   * Include system handlers
   * @default true
   */
  includeSystem?: boolean;

  /**
   * Include search handlers
   * @default true
   */
  includeSearch?: boolean;
}

/**
 * Handler Exporter - factory for creating handlers registry
 *
 * This class provides a way to create handlers registry with configurable
 * exposition levels. Use with EmbeddableMcpServer for external integration.
 *
 * Usage:
 * ```typescript
 * import { HandlerExporter, EmbeddableMcpServer } from '@mcp-abap-adt/core';
 *
 * // Create exporter with specific handlers
 * const exporter = new HandlerExporter({
 *   includeReadOnly: true,
 *   includeHighLevel: true,
 *   includeLowLevel: false,
 * });
 *
 * // Use with EmbeddableMcpServer
 * const server = new EmbeddableMcpServer({
 *   connection: myConnection,
 *   handlersRegistry: exporter.createRegistry(),
 * });
 * ```
 */
export class HandlerExporter {
  private readonly logger: Logger;
  private readonly handlerGroups: IHandlerGroup[];

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? defaultLogger;

    // Create dummy context for group instantiation
    // Real context is provided by BaseMcpServer.registerHandlers() via getConnection()
    const dummyContext: HandlerContext = {
      connection: null as any,
      logger: this.logger,
    };

    // Build handler groups based on options
    this.handlerGroups = [];

    if (options?.includeReadOnly !== false) {
      this.handlerGroups.push(new ReadOnlyHandlersGroup(dummyContext));
    }
    if (options?.includeHighLevel !== false) {
      this.handlerGroups.push(new HighLevelHandlersGroup(dummyContext));
    }
    if (options?.includeCompact === true) {
      this.handlerGroups.push(new CompactHandlersGroup(dummyContext));
    }
    if (options?.includeLowLevel !== false) {
      this.handlerGroups.push(new LowLevelHandlersGroup(dummyContext));
    }
    if (options?.includeSystem !== false) {
      this.handlerGroups.push(new SystemHandlersGroup(dummyContext));
    }
    if (options?.includeSearch !== false) {
      this.handlerGroups.push(new SearchHandlersGroup(dummyContext));
    }
  }

  /**
   * Get all handler entries
   * Useful for inspection or custom registration logic
   */
  getHandlerEntries(): HandlerEntry[] {
    const entries: HandlerEntry[] = [];
    for (const group of this.handlerGroups) {
      entries.push(...group.getHandlers());
    }
    return entries;
  }

  /**
   * Get list of tool names
   */
  getToolNames(): string[] {
    return this.getHandlerEntries().map((e) => e.toolDefinition.name);
  }

  /**
   * Create handlers registry for use with EmbeddableMcpServer or BaseMcpServer
   */
  createRegistry(): IHandlersRegistry {
    return new CompositeHandlersRegistry(this.handlerGroups);
  }
}

/**
 * Create default handler exporter with all handler groups
 */
export function createDefaultHandlerExporter(logger?: Logger): HandlerExporter {
  return new HandlerExporter({ logger });
}
