import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../handlers/interfaces.js';
import type { IBackgroundRuns } from '../lib/backgroundRuns/contract.js';
import type { InstanceBatch } from '../lib/batch/InstanceBatch.js';
import { noopLogger } from '../lib/handlerLogger.js';
import { BackgroundRunHandlersGroup } from '../lib/handlers/groups/BackgroundRunHandlersGroup.js';
import { HighLevelHandlersGroup } from '../lib/handlers/groups/HighLevelHandlersGroup.js';
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
import { registerFreshConnectionFactory } from '../lib/packageSessions.js';
import type {
  SystemContextResolver,
  SystemContextRules,
} from '../lib/requestSystemResolution.js';
import type { StateLogger } from '../lib/state/InstanceState.js';
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
   * A connection of its own for an operation that needs a new ABAP session:
   * RFC CreatePackage / LockPackage, DeletePackage with force_new_connection
   * (and a debug session's own connections). The connection is built by you,
   * with its credential. The factory receives no signal: a fresh connection
   * is made inside a started tool, and the server ends it with a logoff (at
   * the latest when the client closes or the process ends). A package lock's
   * and a debug session's connection outlive the request that opened them.
   * Once returned it is the server's: the server
   * connects it (`connect()`), holds it for the operation (or under the
   * package lock's handle), and closes it with `disconnect()` like its own.
   * Without it those operations are refused (`fresh_connection_unavailable`);
   * the server never builds one from the injected connection's configuration.
   * The latest injection of a connection object decides: the same object
   * injected again without a factory forgets the earlier one.
   */
  freshConnection?: () => Promise<IAbapConnection>;

  /**
   * Where background runs and their answers are kept: your strategy
   * (`IBackgroundRuns` — a store of your choosing, your own routing between
   * replicas; `@mcp-abap-adt/background-runs-memory`'s `InMemoryBackgroundRuns`
   * keeps them in this process's memory).
   * A run tool called with `background: true` runs on a connection of its
   * own — from `freshConnection` on an injected connection — and its answer
   * is handed to the strategy. Without it, `background: true` and the
   * background-run tools are refused (`background_runs_unavailable`).
   */
  backgroundRuns?: IBackgroundRuns;

  /**
   * The owner of this instance's batch state (batch mode), created by the
   * embedder for this instance alone — `new InstanceBatch({ keepRawParts })`
   * — never shared with another instance. Absent: the batch tools answer
   * `batch_mode_unavailable`.
   */
  batch?: InstanceBatch;

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
  exposition?: ('readonly' | 'high' | 'compact' | 'system' | 'search')[];

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
   * registered via the `available_in` filter (none stated: every tool is
   * listed). Overrides the process-global `SAP_SYSTEM_TYPE` env var.
   *
   * Use this when a single host serves multiple SAP systems (e.g., a proxy
   * that handles both OnPremise and cloud destinations per request) —
   * mutating `process.env.SAP_SYSTEM_TYPE` per instance is not safe.
   *
   * It also states the injected connection's kind, by which the rules
   * (`systemContextRules`) read its system's answer. The URL is never
   * consulted. Not required: what a missing kind means is the rules'.
   */
  systemType?: SapEnvironment;

  /**
   * Optional strategy that decides which readonly handlers to dedup (hide)
   * when overriding groups (high / compact) are also exposed.
   *
   * Default: `ReadVsGetDedupStrategy` — hides a readonly `Read<X>` handler
   * when a corresponding `Get<X>` is contributed by another group, so a single
   * deterministic tool is exposed per operation (matching the standalone
   * launcher). Pass `new NoDedupStrategy()` (exported from this package) to
   * expose readonly handlers verbatim, or supply a custom implementation for
   * bespoke role-based rules.
   *
   * Whatever the strategy, a readonly tool with the same NAME as a tool of an
   * exposed high group (e.g. GetUnitTestResult) is registered once, from
   * that group.
   */
  readOnlyDedupStrategy?: IReadOnlyDedupStrategy;

  /**
   * Asks the connection's system for the responsible person and master
   * system when the connection's parameters are made — before its first
   * tool. It answers only what the system said: an answer naming the user
   * (`responsible`, a non-blank string) is the information; `null`, an
   * answer without a user, or a throw other than a credential failure, is
   * no information. A credential failure (a chain failure, a `401`) is the
   * call's as it came, and its tool does not run. Default: none — nothing
   * is looked up. `defaultSystemContextResolver`
   * (`@mcp-abap-adt/lib/request-context`) asks `systeminformation`.
   */
  systemContextResolver?: SystemContextResolver | null;

  /**
   * The rules that make the connection's parameters — the responsible and
   * master system every call takes, the debugger's request user, a
   * background run's caller — from the lookup, once
   * (`@mcp-abap-adt/responsible-rules`, which the transports pass). A
   * refusal of theirs is the call's, and nothing is kept. Default: none —
   * the information is applied, no information leaves the configured
   * values as they are, and nothing is refused for it.
   */
  systemContextRules?: SystemContextRules | null;

  /**
   * The idle bound on held state (a debug session): it ends after this many
   * minutes without a tool call on this instance. A call in flight pauses
   * it; a listener's own background re-poll does not count. A whole number,
   * at least 30; anything else is refused at construction.
   * @default 30
   */
  stateIdleMinutes?: number;

  /**
   * Whether the transport's close ends this instance's session — it is then
   * the instance's close (`closeInstance`): every connection the server owns
   * for it logged off at once, every live call interrupted, its state let
   * go. `false` for a host that connects a transport
   * per request: the client's disconnect closes that request's transport and
   * ends no call; the instance's close or the process shutdown does.
   * @default true
   */
  transportCloseEndsSession?: boolean;

  /**
   * Where the state's lifecycle lines go: the idle bound's end of a state, a
   * cleanup that failed, an observer that threw. Never a state handle.
   * @default stderr, always on
   */
  stateLogger?: StateLogger;
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
  constructor(options: EmbeddableMcpServerOptions) {
    super({
      name: 'mcp-abap-adt',
      version: options.version ?? DEFAULT_VERSION,
      logger: options.logger,
      systemType: options.systemType,
      systemContextResolver: options.systemContextResolver,
      systemContextRules: options.systemContextRules,
      stateIdleMinutes: options.stateIdleMinutes,
      stateLogger: options.stateLogger,
      ...(options.transportCloseEndsSession !== undefined && {
        transportCloseEndsSession: options.transportCloseEndsSession,
      }),
      ...(options.backgroundRuns !== undefined && {
        backgroundRuns: options.backgroundRuns,
      }),
      ...(options.batch !== undefined && { batch: options.batch }),
    });

    // Used as given: no credential built, no wrap, no connect().
    this.setConnectionContext({
      kind: 'injected',
      connection: options.connection,
      sessionId: 'embedded',
    });

    // The latest injection of this connection decides.
    registerFreshConnectionFactory(options.connection, options.freshConnection);

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
   * Creates default handlers registry based on exposition levels
   */
  private createDefaultRegistry(
    exposition: ('readonly' | 'high' | 'compact' | 'system' | 'search')[],
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
      // Beside the run tools: their background runs (`backgroundRuns`).
      groups.push(new BackgroundRunHandlersGroup(dummyContext));
    }
    if (exposition.includes('search')) {
      groups.push(new SearchHandlersGroup(dummyContext));
    }

    return new CompositeHandlersRegistry(groups);
  }
}
