/**
 * ProtocolHandler implementation
 *
 * Processes MCP requests and routes them to appropriate handlers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IProtocolHandler } from '../interfaces/protocol.js';
import { IHandlersRegistry } from '../../handlers/interfaces.js';
import { ISessionManager } from '../interfaces/session.js';
import { sessionContext } from '../../../utils.js';
import { SapConfig } from '@mcp-abap-adt/connection';

/**
 * ProtocolHandler - processes MCP requests and routes to handlers
 */
export class ProtocolHandler implements IProtocolHandler {
  private handlersRegistry?: IHandlersRegistry;
  private mcpServer?: McpServer;
  private sessionManager?: ISessionManager;

  initialize(handlersRegistry: IHandlersRegistry, mcpServer: McpServer, sessionManager?: ISessionManager): void {
    this.handlersRegistry = handlersRegistry;
    this.mcpServer = mcpServer;
    this.sessionManager = sessionManager;

    // Register all tools from handlers registry
    if (this.handlersRegistry) {
      this.handlersRegistry.registerAllTools(mcpServer);
    }
  }

  async handleRequest(sessionId: string, request: any): Promise<any> {
    if (!this.mcpServer) {
      throw new Error('ProtocolHandler not initialized');
    }

    // Handle different request types
    if (request.method === 'tools/call') {
      return await this.executeTool(sessionId, request.params.name, request.params.arguments);
    }

    // For other request types, delegate to SDK server
    // This is a placeholder - actual implementation will depend on SDK API
    return request;
  }

  async executeTool(sessionId: string, toolName: string, params: any): Promise<any> {
    if (!this.mcpServer) {
      throw new Error('ProtocolHandler not initialized');
    }

    // Get session to access connection params
    const session = this.sessionManager?.getSession(sessionId);

    // Set session context for handlers to access connection params via getManagedConnection()
    if (session?.connectionParams) {
      // Convert IConnectionParams to SapConfig for sessionContext
      const sapConfig: SapConfig = {
        url: session.connectionParams.sapUrl,
        authType: session.connectionParams.auth.type,
        ...(session.connectionParams.auth.type === 'jwt' && session.connectionParams.auth.jwtToken
          ? { jwtToken: session.connectionParams.auth.jwtToken }
          : session.connectionParams.auth.type === 'basic' && session.connectionParams.auth.username && session.connectionParams.auth.password
          ? { username: session.connectionParams.auth.username, password: session.connectionParams.auth.password }
          : {}),
        ...(session.connectionParams.client ? { client: session.connectionParams.client } : {}),
      };

      // Extract destination from session metadata or connection params
      // Destination is used for AuthBroker-based token refresh in LOCAL mode
      const destination = (session as any).destination || (session.connectionParams as any).destination;

      // Run handler in session context so getManagedConnection() can access it
      return await sessionContext.run(
        {
          sessionId: session.clientSessionId,
          sapConfig,
          destination,
        },
        async () => {
          // Execute tool through SDK server
          // SDK server will use registered handlers from handlersRegistry
          const result = await (this.mcpServer as any).callTool?.(toolName, params);
          return result;
        }
      );
    }

    // Fallback if no session context (should not happen in v2)
    const result = await (this.mcpServer as any).callTool?.(toolName, params);
    return result;
  }
}
