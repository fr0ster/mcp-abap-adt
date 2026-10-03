import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../handlers/interfaces.js';
import { noopLogger } from '../lib/handlerLogger.js';
import { HighLevelHandlersGroup } from '../lib/handlers/groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from '../lib/handlers/groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from '../lib/handlers/groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from '../lib/handlers/groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from '../lib/handlers/groups/SystemHandlersGroup.js';
import {
  type IReadOnlyDedupStrategy,
  ReadVsGetDedupStrategy,
} from '../lib/handlers/groups/strategies/index.js';
import type {
  IHandlerGroup,
  IHandlersRegistry,
  SapEnvironment,
} from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import type { SystemContextResolver } from '../lib/requestSystemResolution.js';
import type { IAdtSystemContext } from '../lib/systemContext.js';
import { setSystemContext } from '../lib/systemContext.js';
import { BaseMcpServer } from './BaseMcpServer.js';

const DEFAULT_VERSION = process.env.npm_package_version ?? '1.0.0';

/**
 * Options for EmbeddableMcpServer
 */
export interface EmbeddableMcpServerOptions {
  /**
   * ABAP connection to use for all handler calls
   * Injected from consumer (e.g., CloudSdkAbapConnection in cloud-llm-hub)
   */
  connection: AbapConnection;

  /**
   * Logger instance
   * @default defaultLogger
   */
  logger?: Logger;

  /**
   * Handlers registry to use
   * If not provided, default registry is created based on exposition option
   */
  handlersRegistry?: IHandlersRegistry;

  /**
   * Exposition levels to include when creating default registry
   * @default ['readonly', 'high']
   */
  exposition?: (
    | 'readonly'
    | 'high'
    | 'low'
    | 'compact'
    | 'system'
    | 'search'
  )[];

  /**
   * Server version
   * @default from package.json or '1.0.0'
   */
  version?: string;

  /**
   * System context (masterSystem, responsible, client, isLegacy).
   * Set this to avoid HTTP calls that resolve system info at runtime.
   * If not provided, handlers will use whatever is available from env vars.
   */
  systemContext?: Partial<IAdtSystemContext>;

  /**
   * SAP system type for this server instance. Governs which tools are
   * registered via the `available_in` filter. Overrides the process-global
   * `SAP_SYSTEM_TYPE` env var. If omitted, falls back to the env var,
   * then to `'cloud'`.
   *
   * Use this when a single host serves multiple SAP systems (e.g., a proxy
   * that handles both OnPremise and cloud destinations per request) —
   * mutating `process.env.SAP_SYSTEM_TYPE` per instance is not safe.
   *
   * It also states the injected connection's kind for the responsible /
   * master-system lookup: `'cloud'` asks the system's `systeminformation`
   * for what the call lacks; anything else — and, when omitted,
   * `SAP_SYSTEM_TYPE`, else on-premise — asks nothing. The URL is never
   * consulted.
   */
  systemType?: SapEnvironment;

  /**
   * Optional strategy that decides which readonly handlers to dedup (hide)
   * when overriding groups (high / low / compact) are also exposed.
   *
   * Default: `ReadVsGetDedupStrategy` — hides a readonly `Read<X>` handler
   * when a corresponding `Get<X>` is contributed by another group, so a single
   * deterministic tool is exposed per operation (matching the standalone
   * launcher). Pass `new NoDedupStrategy()` (exported from this package) to
   * expose readonly handlers verbatim, or supply a custom implementation for
   * bespoke role-based rules.
   *
   * Whatever the strategy, a readonly tool with the same NAME as a tool of an
   * exposed high/low group (e.g. GetUnitTestResult) is registered once, from
   * that group.
   */
  readOnlyDedupStrategy?: IReadOnlyDedupStrategy;

  /**
   * Asks the connection's system for the responsible person and master
   * system a call does not state. Its answer decides whether the login counts:
   * `null` means not asked (on-premise) — the login (`SAP_USERNAME`, or
   * `x-sap-login` with `x-sap-url`) stands as the responsible; a non-null
   * answer is a cloud system's — the login does not count, and only what the
   * call does not state is taken from it (`{}`: the system named nothing, so a
   * create without a stated responsible is refused). A resolver that throws is
   * treated like `{}`, and the create is refused as one to retry. The default
   * asks on ABAP Cloud (one lookup per connection) and answers `null`
   * on-premise. `null` as the option disables it.
   * @default defaultSystemContextResolver
   */
  systemContextResolver?: SystemContextResolver | null;
}

/**
 * Embeddable MCP Server for integration with external applications
 *
 * This server is designed for consumers like cloud-llm-hub that:
 * - Have their own connection management (e.g., BTP destinations, Cloud SDK)
 * - Create new server instance per request (SSE/HTTP mode)
 * - Need to inject connection from outside
 *
 * Usage:
 * ```typescript
 * // Create connection (consumer's own implementation)
 * const connection = new CloudSdkAbapConnection(config);
 *
 * // Create embeddable server with injected connection
 * const server = new EmbeddableMcpServer({
 *   connection,
 *   logger: myLogger,
 *   exposition: ['readonly', 'high'],
 * });
 *
 * // Connect transport and handle request
 * await server.connect(transport);
 * ```
 */
export class EmbeddableMcpServer extends BaseMcpServer {
  private readonly injectedConnection: AbapConnection;

  constructor(options: EmbeddableMcpServerOptions) {
    super({
      name: 'mcp-abap-adt',
      version: options.version ?? DEFAULT_VERSION,
      logger: options.logger,
      systemType: options.systemType,
      systemContextResolver: options.systemContextResolver,
    });

    this.injectedConnection = options.connection;

    if (options.systemContext) {
      setSystemContext(options.systemContext);
    }

    // Use provided registry or create default based on exposition
    const registry =
      options.handlersRegistry ??
      this.createDefaultRegistry(
        options.exposition ?? ['readonly', 'high'],
        options.logger,
        options.readOnlyDedupStrategy,
      );

    this.registerHandlers(registry);
  }

  /**
   * Returns the injected connection
   * Called by BaseMcpServer.registerHandlers() wrapper lambdas
   */
  protected async getConnection(): Promise<AbapConnection> {
    return this.injectedConnection;
  }

  /**
   * Creates default handlers registry based on exposition levels
   */
  private createDefaultRegistry(
    exposition: (
      | 'readonly'
      | 'high'
      | 'low'
      | 'compact'
      | 'system'
      | 'search'
    )[],
    logger?: Logger,
    readOnlyDedupStrategy: IReadOnlyDedupStrategy = new ReadVsGetDedupStrategy(),
  ): IHandlersRegistry {
    // Dummy context - not actually used because BaseMcpServer.registerHandlers()
    // creates wrapper lambdas that call getConnection() for fresh context
    const dummyContext: HandlerContext = {
      connection: null as unknown as AbapConnection,
      logger: logger ?? noopLogger,
    };

    // Build non-readonly groups first so their tool names can feed the
    // readonly dedup strategy (defaults to ReadVsGetDedupStrategy).
    const overridingGroups: IHandlerGroup[] = [];
    if (exposition.includes('high')) {
      overridingGroups.push(new HighLevelHandlersGroup(dummyContext));
    }
    if (exposition.includes('low')) {
      overridingGroups.push(new LowLevelHandlersGroup(dummyContext));
    }

    const overridingToolNames = new Set<string>();
    for (const g of overridingGroups) {
      for (const e of g.getHandlers()) {
        overridingToolNames.add(e.toolDefinition.name);
      }
    }

    const groups: IHandlerGroup[] = [];
    if (exposition.includes('readonly')) {
      groups.push(
        new ReadOnlyHandlersGroup(
          dummyContext,
          overridingToolNames,
          readOnlyDedupStrategy,
        ),
      );
    }
    groups.push(...overridingGroups);
    if (exposition.includes('system')) {
      groups.push(new SystemHandlersGroup(dummyContext));
    }
    if (exposition.includes('search')) {
      groups.push(new SearchHandlersGroup(dummyContext));
    }

    return new CompositeHandlersRegistry(groups);
  }
}
