import type { Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { runWithCallTransport } from '../callTransport.js';
import { noopLogger } from '../handlerLogger.js';
import {
  type SystemContextResolver,
  type SystemContextRules,
  withResolvedSystemContext,
} from '../requestSystemResolution.js';
import { BackgroundRunHandlersGroup } from './groups/BackgroundRunHandlersGroup.js';
import { DebugHandlersGroup } from './groups/DebugHandlersGroup.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import { NoDedupStrategy } from './groups/strategies/index.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
  SapEnvironment,
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
   * Debugger tools (default false): opt-in; they catch every request of the SAP user
   * @default false
   */
  includeDebug?: boolean;

  /**
   * The SAP system kind the handlers serve, for a connection the factory
   * did not build: the rules (`systemContextRules`) read a lookup by it.
   * Never guessed. Overrides `SAP_SYSTEM_TYPE`. Not required: without it
   * and `SAP_SYSTEM_TYPE` the kind is unknown, and what that means is the
   * rules'.
   */
  systemType?: SapEnvironment;

  /**
   * Asks the connection's system for the responsible person and master
   * system before each wrapped handler runs, once per connection: an
   * answer naming the user is the information. A credential failure (a
   * chain failure, a `401`) is thrown as it came, and the handler does not
   * run. Default: none — nothing is looked up (`getHandlerEntries()` still
   * wraps each handler in the call-transport scope). `defaultSystemContextResolver`
   * (`@mcp-abap-adt/lib/request-context`) asks `systeminformation`.
   */
  systemContextResolver?: SystemContextResolver | null;

  /**
   * The rules that make the connection's parameters from the lookup
   * (`@mcp-abap-adt/responsible-rules`), once per connection; a refusal of
   * theirs is thrown and the handler does not run. Default: none — the
   * information is applied, no information leaves the configured values.
   */
  systemContextRules?: SystemContextRules | null;
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
 *   systemType: 'onprem',
 *   includeReadOnly: true,
 *   includeHighLevel: true,
 * });
 *
 * // Use with EmbeddableMcpServer
 * const server = new EmbeddableMcpServer({
 *   connection: myConnection,
 *   systemType: 'onprem',
 *   handlersRegistry: exporter.createRegistry(),
 * });
 * ```
 */
export class HandlerExporter {
  private readonly logger: Logger;
  private readonly handlerGroups: IHandlerGroup[];
  private readonly systemContextResolver: SystemContextResolver | null;
  private readonly systemContextRules: SystemContextRules | null;
  private readonly systemType: string | undefined;

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? noopLogger;
    this.systemType = options?.systemType;
    this.systemContextResolver = options?.systemContextResolver ?? null;
    this.systemContextRules = options?.systemContextRules ?? null;

    // Create dummy context for group instantiation
    // Real context is provided by BaseMcpServer.registerHandlers() via getConnection()
    const dummyContext: HandlerContext = {
      connection: null as any,
      logger: this.logger,
      ...(options?.systemType !== undefined && {
        systemType: options.systemType,
      }),
    };

    // Build handler groups based on options
    this.handlerGroups = [];

    // High is built first: a readonly tool that is a copy of one of
    // theirs under the same name is withheld from the readonly group, so a
    // tool appears once and comes from high. No other readonly tool is hidden
    // here (NoDedupStrategy).
    const overridingGroups: IHandlerGroup[] = [];
    if (options?.includeHighLevel !== false) {
      overridingGroups.push(new HighLevelHandlersGroup(dummyContext));
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
      // Beside the run tools: their background runs — served by an instance
      // whose host gave a strategy (`backgroundRuns`), refused otherwise.
      this.handlerGroups.push(new BackgroundRunHandlersGroup(dummyContext));
    }
    if (options?.includeSearch !== false) {
      this.handlerGroups.push(new SearchHandlersGroup(dummyContext));
    }
    if (options?.includeDebug === true) {
      this.handlerGroups.push(new DebugHandlersGroup(dummyContext));
    }
  }

  /**
   * Get all handler entries
   * Useful for inspection or custom registration logic
   *
   * Embedders call these handlers themselves, so with a resolver each one
   * is wrapped to fill the responsible person and master system from the
   * connection's parameters (see `systemContextResolver`,
   * `systemContextRules`) before it runs — a credential failure or a
   * refusal of the rules is thrown, and the handler does not run. The
   * wrapper keeps the original's `length`,
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

  /**
   * Every handed-out handler runs in the call-transport scope with its own
   * call's `transport_request` (`callTransport.ts`, the failure renderer's
   * transport hint), and with the system lookup when a resolver is given.
   */
  private wrapEntry(group: IHandlerGroup, entry: HandlerEntry): HandlerEntry {
    const resolver = this.systemContextResolver;
    const resolved = <T>(
      connection: HandlerContext['connection'] | undefined,
      fn: () => Promise<T>,
    ): Promise<T> =>
      resolver
        ? withResolvedSystemContext(
            connection,
            fn,
            resolver,
            this.systemType,
            this.systemContextRules,
          )
        : fn();

    const original = entry.handler as (...args: unknown[]) => Promise<unknown>;
    const wrapped =
      original.length >= 2
        ? (context: HandlerContext, args: unknown) =>
            runWithCallTransport(args, () =>
              resolved(context?.connection, () => original(context, args)),
            )
        : // Args-only handlers close over their group's context, which the
          // embedder swaps before calling — so read it at call time.
          (...callArgs: unknown[]) =>
            runWithCallTransport(callArgs[0], () =>
              resolved(
                (group as Partial<{ context: HandlerContext }>).context
                  ?.connection,
                () => original(...callArgs),
              ),
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
 * Create default handler exporter with all handler groups.
 */
export function createDefaultHandlerExporter(
  logger?: Logger,
  systemType?: SapEnvironment,
): HandlerExporter {
  return new HandlerExporter({
    logger,
    ...(systemType !== undefined && { systemType }),
  });
}
