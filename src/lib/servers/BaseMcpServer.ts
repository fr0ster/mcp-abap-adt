import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AbapConnection, createAbapConnection } from "@mcp-abap-adt/connection";
import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { ConnectionContext } from "./ConnectionContext.js";
import { IHandlersRegistry } from "./handlers/interfaces.js";
import { CompositeHandlersRegistry } from "./handlers/registry/CompositeHandlersRegistry.js";
import { HandlerContext } from "../handlers/interfaces.js";
import { defaultLogger as logger } from "@mcp-abap-adt/logger";

/**
 * Base MCP Server class that extends SDK McpServer
 * Manages connection context and provides connection injection for handlers
 */
export abstract class BaseMcpServer extends McpServer {
  /**
   * Connection context (set per request for SSE/HTTP, once for stdio)
   */
  protected connectionContext: ConnectionContext | null = null;

  /**
   * Auth broker for token and service key management
   */
  protected authBroker?: AuthBroker;

  /**
   * Sets connection context using auth broker
   * For stdio: called once on startup
   * For SSE/HTTP: called per-request
   */
  protected async setConnectionContext(
    destination: string,
    authBroker: AuthBroker
  ): Promise<void> {
    this.authBroker = authBroker;

    // Get connection parameters from broker
    const token = await authBroker.getToken(destination);
    const serviceKey = await authBroker.getConnectionConfig(destination);
    if (!serviceKey) {
      throw new Error('Connection config not found');
    }

    this.connectionContext = {
      sessionId: destination,
      connectionParams: {
        url: serviceKey.serviceUrl || '',
        authType: 'jwt',
        jwtToken: token,
        client: serviceKey.sapClient || '',
      },
      metadata: {
        destination,
      },
    };
  }

  /**
   * Gets current connection context
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }

  /**
   * Gets ABAP connection from connection context
   * Creates connection using connectionParams from context
   */
  protected getConnection(): AbapConnection {
    if (!this.connectionContext?.connectionParams) {
      throw new Error('Connection context not set. Call setConnectionContext() first.');
    }

    // Create ABAP connection from context
    return createAbapConnection(this.connectionContext.connectionParams);
  }

  /**
   * Registers handlers from registry
   * Wraps handlers to inject connection as first parameter
   *
   * Handler signature: (connection: AbapConnection, args: any) => Promise<any>
   * Registered as: (args: any) => handler(getConnection(), args)
   *
   * This ensures connection is injected but NOT exposed in MCP tool signature
   */
  protected registerHandlers(handlersRegistry: IHandlersRegistry): void {
    // Get handler groups from registry
    if (handlersRegistry instanceof CompositeHandlersRegistry) {
      const groups = handlersRegistry.getHandlerGroups();

      for (const group of groups) {
        const handlers = group.getHandlers();
        for (const entry of handlers) {
          // Wrap handler to inject connection from context
          // Original handler: (connection: AbapConnection, args: any) => Promise<any>
          // Wrapped handler: (args: any) => handler(getConnection(), args)
          const wrappedHandler = async (args: any) => {
            // Get connection from context (this.connectionContext)
            const context: HandlerContext = {
              connection: this.getConnection(),
              logger: logger,
            };

            // Call original handler with connection as first parameter
            return await entry.handler(context, args);
          };

          // Register wrapped handler via SDK registerTool
          // Note: connection is NOT part of MCP tool signature
          this.registerTool(
            entry.toolDefinition.name,
            {
              description: entry.toolDefinition.description,
              inputSchema: entry.toolDefinition.inputSchema,
            },
            wrappedHandler
          );
        }
      }
    } else {
      // Fallback: use registerAllTools directly (handlers won't have connection injected)
      // This should not happen in normal flow
      handlersRegistry.registerAllTools(this);
    }
  }
}
