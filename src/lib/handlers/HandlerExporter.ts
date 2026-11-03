import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { Logger } from '@mcp-abap-adt/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { ServerRefusal } from '../auth/serverRefusal.js';
import { withoutBackgroundParameter } from '../backgroundRuns/tools.js';
import { noopLogger } from '../handlerLogger.js';
import {
  isCredentialFailure,
  type SystemContextResolver,
  type SystemContextRules,
} from '../requestSystemResolution.js';
import type { BaseHandlerGroup } from './base/BaseHandlerGroup.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { RuntimeRunHandlersGroup } from './groups/RuntimeRunHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import { NoDedupStrategy } from './groups/strategies/index.js';
import type {
  HandlerEntry,
  IHandlersRegistry,
  SapEnvironment,
} from './interfaces.js';
import { CompositeHandlersRegistry } from './registry/CompositeHandlersRegistry.js';
import { type CallContext, inStatedScope } from './utils/handlerCall.js';

/**
 * The run tools as the exporter hands them out: without `background`, since
 * it keeps no background-run store (`withoutBackgroundParameter`).
 */
class ExportedRuntimeRunHandlersGroup extends RuntimeRunHandlersGroup {
  override getHandlers(): HandlerEntry[] {
    return super.getHandlers().map((entry) => ({
      ...entry,
      toolDefinition: withoutBackgroundParameter(entry.toolDefinition),
    }));
  }
}

/**
 * The connection one call of a tool registered with
 * `HandlerExporter.registerOnServer` runs on: called for each call, sync or
 * async. What it returns is the call's; its lifetime is the embedder's.
 */
export type ConnectionProvider = () =>
  | IAbapConnection
  | Promise<IAbapConnection>;

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
   * The SAP system kind the handlers serve, for a connection the factory
   * did not build: the rules (`systemContextRules`) read a lookup by it.
   * Never guessed. On a server instance it overrides `SAP_SYSTEM_TYPE`;
   * not required there: without it and `SAP_SYSTEM_TYPE` the kind is
   * unknown, and what that means is the rules'. It is also the variant a plain registration
   * (`createRegistry().registerAllTools(mcpServer)`) lists and calls on:
   * that variant's tools, descriptions and schemas — and the kind every
   * handler `getHandlerEntries()` hands out runs on. Without it the
   * definitions are listed as they are and every call that would reach a
   * system is refused `system_type_required`; `SAP_SYSTEM_TYPE` is not read
   * on either path.
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
 * exposition levels. Use with EmbeddableMcpServer for external integration,
 * or register the tools on your own `McpServer` with `registerOnServer`,
 * each call on the connection your provider returns.
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
  private readonly handlerGroups: BaseHandlerGroup[];
  private readonly systemContextResolver: SystemContextResolver | null;
  private readonly systemContextRules: SystemContextRules | null;
  private readonly systemType: string | undefined;

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? noopLogger;
    this.systemType = options?.systemType;
    this.systemContextResolver = options?.systemContextResolver ?? null;
    this.systemContextRules = options?.systemContextRules ?? null;

    // Create dummy context for group instantiation. A call's real context
    // is given by the server instance (BaseMcpServer.registerHandlers(), via
    // getConnection()) or made per call by registerOnServer (its provider's
    // connection).
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
    const overridingGroups: BaseHandlerGroup[] = [];
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
      // The run tools without `background`: the exporter keeps no
      // background-run store, so it hands out neither the parameter nor the
      // background-run tools.
      this.handlerGroups.push(
        new ExportedRuntimeRunHandlersGroup(dummyContext),
      );
    }
    if (options?.includeSearch !== false) {
      this.handlerGroups.push(new SearchHandlersGroup(dummyContext));
    }
  }

  /**
   * Get all handler entries
   * Useful for inspection or custom registration logic
   *
   * Embedders call these handlers themselves, so each one is wrapped: it
   * runs on the kind this exporter states (`systemType`, stated on the
   * call's connection; none stated, none — `SAP_SYSTEM_TYPE` is not read),
   * and with a resolver the responsible person and master system are filled
   * from the connection's parameters (see `systemContextResolver`,
   * `systemContextRules`) before it runs — a credential failure or a
   * refusal of the rules is thrown, and the handler does not run. An
   * embedder calls an entry as `entry.call(context, args)`.
   */
  getHandlerEntries(): HandlerEntry[] {
    const entries: HandlerEntry[] = [];
    for (const group of this.handlerGroups) {
      for (const entry of group.getHandlers()) {
        entries.push(this.wrapEntry(entry));
      }
    }
    return entries;
  }

  /**
   * Every handed-out handler runs on the system kind this exporter states
   * (`systemType`), stated on the call's connection before it runs — or
   * none, when it states none: `SAP_SYSTEM_TYPE` is not read for that
   * connection (`stateSystemKind`); a connection `createAbapConnection`
   * built keeps the kind it was built for. It runs in the call-transport
   * scope with its own call's `transport_request` (`callTransport.ts`, the
   * failure renderer's transport hint), and with the system lookup when a
   * resolver is given.
   */
  private wrapEntry(entry: HandlerEntry): HandlerEntry {
    const original = entry.call;
    return {
      ...entry,
      call: (context, args) =>
        inStatedScope(
          { ...this.stated(), connection: context?.connection },
          args,
          () => original(context, args),
        ),
    };
  }

  /**
   * What this exporter states for every call: its `systemType`, and the
   * system-context resolver and rules when it has them.
   */
  private stated(): Pick<
    HandlerContext,
    'systemType' | 'systemContextResolver' | 'systemContextRules'
  > {
    return {
      ...(this.systemType !== undefined && { systemType: this.systemType }),
      ...(this.systemContextResolver !== null && {
        systemContextResolver: this.systemContextResolver,
      }),
      ...(this.systemContextRules !== null && {
        systemContextRules: this.systemContextRules,
      }),
    };
  }

  /**
   * Registers this exporter's tools on an embedder's `McpServer`, each call
   * on the connection `connectionProvider` returns for it.
   *
   * The listing is a plain registration's (`createRegistry().registerAllTools`)
   * for the stated `systemType`: that variant's tools, descriptions, schemas
   * and search members; none stated, the definitions as they are. Each call
   * awaits the provider, then runs the entry's call on what it returned, on
   * the stated kind (none stated: refused `system_type_required` before
   * anything is sent; `SAP_SYSTEM_TYPE` is not read), and with the
   * `systemContextResolver` / `systemContextRules` when given, as
   * `getHandlerEntries()` applies them.
   *
   * A provider that throws or rejects is the call's answer and the handler
   * does not run: a credential failure (a chain failure, a `401`) as it came,
   * anything else `connection_provider_failed` in fixed words. Nothing waits
   * on a clock and nothing is retried. The connection is the provider's: each
   * call uses what it returns, and a lock held across calls needs the
   * provider to return the same connection.
   */
  registerOnServer(
    server: McpServer,
    connectionProvider: ConnectionProvider,
  ): void {
    const callContext: CallContext = async () => {
      let connection: IAbapConnection;
      try {
        connection = await connectionProvider();
      } catch (error) {
        if (isCredentialFailure(error)) throw error;
        throw new ServerRefusal('connection_provider_failed');
      }
      return { connection, logger: this.logger, ...this.stated() };
    };
    new CompositeHandlersRegistry(this.handlerGroups).registerAllToolsOnCall(
      server,
      callContext,
    );
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
