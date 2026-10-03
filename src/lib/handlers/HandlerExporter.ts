import type { Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { noopLogger } from '../handlerLogger.js';
import {
  defaultSystemContextResolver,
  type SystemContextResolver,
  withResolvedSystemContext,
} from '../requestSystemResolution.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from './groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import { NoDedupStrategy } from './groups/strategies/index.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
  ToolHandler,
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
   * Include system handlers
   * @default true
   */
  includeSystem?: boolean;

  /**
   * Include search handlers
   * @default true
   */
  includeSearch?: boolean;

  /**
   * Fills the responsible person and master system a call lacks — neither in
   * its request scope nor in the process context — from the connection's
   * system. The default resolves them on ABAP Cloud (one lookup per
   * connection) and does nothing on-premise. `null` disables it, and
   * `getHandlerEntries()` then returns the groups' handlers unwrapped.
   * MIGRATION (16.0.0): the kind of a connection the factory did not build is
   * no longer guessed from its URL — it is `SAP_SYSTEM_TYPE`, on-premise when
   * unset; a cloud host sets `SAP_SYSTEM_TYPE=cloud` or passes its own
   * `systemContextResolver`.
   * @default defaultSystemContextResolver
   */
  systemContextResolver?: SystemContextResolver | null;
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
  private readonly systemContextResolver: SystemContextResolver | null;

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? noopLogger;
    this.systemContextResolver =
      options?.systemContextResolver === undefined
        ? defaultSystemContextResolver
        : options.systemContextResolver;

    // Create dummy context for group instantiation
    // Real context is provided by BaseMcpServer.registerHandlers() via getConnection()
    const dummyContext: HandlerContext = {
      connection: null as any,
      logger: this.logger,
    };

    // Build handler groups based on options
    this.handlerGroups = [];

    // High and low are built first: a readonly tool that is a copy of one of
    // theirs under the same name is withheld from the readonly group, so a
    // tool appears once and comes from high. No other readonly tool is hidden
    // here (NoDedupStrategy) — this exporter has always listed Read<X>
    // beside Get<X>.
    const overridingGroups: IHandlerGroup[] = [];
    if (options?.includeHighLevel !== false) {
      overridingGroups.push(new HighLevelHandlersGroup(dummyContext));
    }
    if (options?.includeLowLevel !== false) {
      overridingGroups.push(new LowLevelHandlersGroup(dummyContext));
    }
    const overridingToolNames = new Set<string>();
    for (const g of overridingGroups) {
      for (const e of g.getHandlers()) {
        overridingToolNames.add(e.toolDefinition.name);
      }
    }

    if (options?.includeReadOnly !== false) {
      this.handlerGroups.push(
        new ReadOnlyHandlersGroup(
          dummyContext,
          overridingToolNames,
          new NoDedupStrategy(),
        ),
      );
    }
    this.handlerGroups.push(...overridingGroups);
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
   *
   * Embedders call these handlers themselves, so each one is wrapped to fill
   * the responsible person and master system from the connection (see
   * `systemContextResolver`). The wrapper keeps the original's `length`,
   * because embedders choose between `handler(context, args)` and
   * `handler(args)` by it.
   */
  getHandlerEntries(): HandlerEntry[] {
    const entries: HandlerEntry[] = [];
    for (const group of this.handlerGroups) {
      for (const entry of group.getHandlers()) {
        entries.push(this.wrapEntry(group, entry));
      }
    }
    return entries;
  }

  private wrapEntry(group: IHandlerGroup, entry: HandlerEntry): HandlerEntry {
    const resolver = this.systemContextResolver;
    if (!resolver) return entry;

    const original = entry.handler as (...args: unknown[]) => Promise<unknown>;
    const wrapped =
      original.length >= 2
        ? (context: HandlerContext, args: unknown) =>
            withResolvedSystemContext(
              context?.connection,
              () => original(context, args),
              resolver,
            )
        : // Args-only handlers close over their group's context, which the
          // embedder swaps before calling — so read it at call time.
          (...callArgs: unknown[]) =>
            withResolvedSystemContext(
              (group as Partial<{ context: HandlerContext }>).context
                ?.connection,
              () => original(...callArgs),
              resolver,
            );
    Object.defineProperty(wrapped, 'length', { value: original.length });
    return { ...entry, handler: wrapped as ToolHandler };
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
