import type { Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { ServerRefusal } from '../auth/serverRefusal.js';
import { noopLogger } from '../handlerLogger.js';
import {
  defaultSystemContextResolver,
  type SystemContextResolver,
  withResolvedSystemContext,
} from '../requestSystemResolution.js';
import { statedSystemKind } from '../systemKind.js';
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
   * The SAP system kind the handlers serve — required, here or as
   * `SAP_SYSTEM_TYPE`: without either (or with a value other than `onprem`,
   * `cloud` or `legacy`) the constructor throws `ServerRefusal`
   * `system_type_required`, as `EmbeddableMcpServer` does. It decides how a
   * system's answer to its lookup is read (no information falls to the
   * configuration on-premise, and is the call's error on ABAP Cloud) for a
   * connection the factory did not
   * build. Never guessed. Overrides `SAP_SYSTEM_TYPE`.
   */
  systemType?: SapEnvironment;

  /**
   * Asks the connection's system for the responsible person and master
   * system. It answers only what the system said; the recipe around it is
   * the same for any resolver, by the connection's kind (`systemType`). An
   * answer naming the user wins over anything configured. `null`, an answer
   * without a user, or a throw other than a credential failure, is no
   * information: on ABAP Cloud the wrapped handler throws (a `404` thrown
   * by the resolver `cloud_without_systeminformation`, anything else
   * `system_lookup_failed`); on-premise the configuration
   * (`SAP_RESPONSIBLE`, the login: `SAP_USERNAME`, or `x-sap-login` with
   * `x-sap-url`) stands, when the call states a user (the connection's
   * `SAP_USERNAME`, else the request scope's login), and with none the
   * wrapped handler throws `system_user_unknown`. A credential failure (a
   * chain failure, a `401`) is thrown as it came. In each case the handler
   * does not run. It is asked before each wrapped handler runs, as the
   * server asks before a tool, once per connection: an answer naming the
   * user is kept, and on-premise a `404` (the endpoint absent); anything
   * else is not, so the next call asks again. The default asks every
   * system's `systeminformation`. `null` as the option disables it, and
   * `getHandlerEntries()` then returns the groups' handlers unwrapped.
   * MIGRATION (16.0.0): the kind of a connection the factory did not build is
   * no longer guessed from its URL — it is `systemType`, else
   * `SAP_SYSTEM_TYPE` (19.0.0: required, refused at construction without
   * either).
   * @default the shipped resolver
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
 *   systemType: 'onprem', // required here or as SAP_SYSTEM_TYPE
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
  private readonly systemType: string | undefined;

  constructor(options?: HandlerExporterOptions) {
    // The system kind is required (never guessed): stated by the option,
    // else SAP_SYSTEM_TYPE; neither is refused here, before any handler is
    // handed out.
    if (
      statedSystemKind(options?.systemType) === undefined &&
      statedSystemKind(process.env.SAP_SYSTEM_TYPE) === undefined
    ) {
      throw new ServerRefusal('system_type_required');
    }
    this.logger = options?.logger ?? noopLogger;
    this.systemType = options?.systemType;
    this.systemContextResolver =
      options?.systemContextResolver === undefined
        ? defaultSystemContextResolver
        : options.systemContextResolver;

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
    // here (NoDedupStrategy) — this exporter has always listed Read<X>
    // beside Get<X>.
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
   * Embedders call these handlers themselves, so each one is wrapped to fill
   * the responsible person and master system from the connection (see
   * `systemContextResolver`) before it runs — a failed or userless lookup is
   * thrown with the server's code, and the handler does not run. The
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
              this.systemType,
            )
        : // Args-only handlers close over their group's context, which the
          // embedder swaps before calling — so read it at call time.
          (...callArgs: unknown[]) =>
            withResolvedSystemContext(
              (group as Partial<{ context: HandlerContext }>).context
                ?.connection,
              () => original(...callArgs),
              resolver,
              this.systemType,
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
 * Create default handler exporter with all handler groups. The system kind
 * is required: `systemType`, else `SAP_SYSTEM_TYPE` (refused without either).
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
