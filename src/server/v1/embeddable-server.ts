/**
 * Lightweight MCP server for embedding in external HTTP servers (e.g., CAP/CDS, Express).
 *
 * This class provides a minimal McpServer with registered handlers,
 * without CLI parsing, transport management, or AuthBroker logic.
 *
 * The external server is responsible for:
 * - HTTP transport (StreamableHTTPServerTransport)
 * - Connection management (AbapConnection per request)
 * - Session management
 *
 * @example
 * ```typescript
 * import { EmbeddableMcpServer } from "@fr0ster/mcp-abap-adt/server/v1";
 *
 * // Create server with context
 * const server = new EmbeddableMcpServer({
 *   context: {
 *     connection: myAbapConnection,
 *     logger: myLogger
 *   },
 *   exposition: ['readonly', 'high']
 * });
 *
 * // Access the McpServer for transport connection
 * const mcpServer = server.mcpServer;
 * await mcpServer.connect(transport);
 * ```
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { McpHandlers } from './mcp_handlers';

/**
 * Options for creating an EmbeddableMcpServer
 */
export interface EmbeddableServerOptions {
  /**
   * Handler context with connection and logger.
   * Connection will be used for all ABAP requests.
   */
  context: HandlerContext;

  /**
   * Tool exposition levels to register.
   * @default ['readonly', 'high']
   *
   * Available levels:
   * - 'readonly': Read-only operations (GetTable, GetClass, etc.)
   * - 'high': High-level create/update operations
   * - 'low': Low-level operations (lock, unlock, validate)
   * - 'system': System operations
   */
  exposition?: string[];

  /**
   * Server name for MCP protocol.
   * @default 'mcp-abap-adt'
   */
  name?: string;

  /**
   * Server version for MCP protocol.
   * @default '1.0.0'
   */
  version?: string;
}

/**
 * Lightweight embeddable MCP server.
 *
 * Creates an McpServer with handlers registered immediately in constructor.
 * No CLI, no transport management, no AuthBroker - just handlers.
 */
export class EmbeddableMcpServer {
  private readonly _mcpServer: McpServer;
  private readonly _mcpHandlers: McpHandlers;
  private readonly _exposition: string[];

  /**
   * Creates a new EmbeddableMcpServer with handlers registered.
   *
   * @param options - Server options including context and exposition
   */
  constructor(options: EmbeddableServerOptions) {
    const {
      context,
      exposition = ['readonly', 'high'],
      name = 'mcp-abap-adt',
      version = '1.0.0',
    } = options;

    this._exposition = exposition;
    this._mcpHandlers = new McpHandlers();

    // Create McpServer
    this._mcpServer = new McpServer({
      name,
      version,
    });

    // Register handlers immediately
    this._mcpHandlers.RegisterAllToolsOnServer(
      this._mcpServer,
      context,
      this._exposition,
    );

    context.logger?.info?.(
      'EmbeddableMcpServer created with handlers registered',
      {
        type: 'EMBEDDABLE_SERVER_CREATED',
        exposition: this._exposition,
        name,
        version,
      },
    );
  }

  /**
   * Gets the underlying McpServer instance.
   * Use this to connect to a transport.
   */
  get mcpServer(): McpServer {
    return this._mcpServer;
  }

  /**
   * Gets the exposition levels configured for this server.
   */
  get exposition(): string[] {
    return [...this._exposition];
  }
}
