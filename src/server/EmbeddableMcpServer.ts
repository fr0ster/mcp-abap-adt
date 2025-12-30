import type { AbapConnection } from '@mcp-abap-adt/connection';
import { defaultLogger, type Logger } from '@mcp-abap-adt/logger';
import type { HandlerContext } from '../handlers/interfaces.js';
import { HighLevelHandlersGroup } from '../lib/handlers/groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from '../lib/handlers/groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from '../lib/handlers/groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from '../lib/handlers/groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from '../lib/handlers/groups/SystemHandlersGroup.js';
import type {
  IHandlerGroup,
  IHandlersRegistry,
} from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
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
  exposition?: ('readonly' | 'high' | 'low' | 'system' | 'search')[];

  /**
   * Server version
   * @default from package.json or '1.0.0'
   */
  version?: string;
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
      logger: options.logger ?? defaultLogger,
    });

    this.injectedConnection = options.connection;

    // Use provided registry or create default based on exposition
    const registry =
      options.handlersRegistry ??
      this.createDefaultRegistry(
        options.exposition ?? ['readonly', 'high'],
        options.logger,
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
    exposition: ('readonly' | 'high' | 'low' | 'system' | 'search')[],
    logger?: Logger,
  ): IHandlersRegistry {
    // Dummy context - not actually used because BaseMcpServer.registerHandlers()
    // creates wrapper lambdas that call getConnection() for fresh context
    const dummyContext: HandlerContext = {
      connection: null as any,
      logger: logger ?? defaultLogger,
    };

    const groups: IHandlerGroup[] = [];

    if (exposition.includes('readonly')) {
      groups.push(new ReadOnlyHandlersGroup(dummyContext));
    }
    if (exposition.includes('high')) {
      groups.push(new HighLevelHandlersGroup(dummyContext));
    }
    if (exposition.includes('low')) {
      groups.push(new LowLevelHandlersGroup(dummyContext));
    }
    if (exposition.includes('system')) {
      groups.push(new SystemHandlersGroup(dummyContext));
    }
    if (exposition.includes('search')) {
      groups.push(new SearchHandlersGroup(dummyContext));
    }

    return new CompositeHandlersRegistry(groups);
  }
}
