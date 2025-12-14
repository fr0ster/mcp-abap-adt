/**
 * ProtocolHandler implementation
 *
 * Processes MCP requests and routes them to appropriate handlers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IProtocolHandler } from '../interfaces/protocol.js';
import { IHandlersRegistry } from '../../handlers/interfaces.js';

/**
 * ProtocolHandler - processes MCP requests and routes to handlers
 */
export class ProtocolHandler implements IProtocolHandler {
  private handlersRegistry?: IHandlersRegistry;
  private mcpServer?: McpServer;

  initialize(handlersRegistry: IHandlersRegistry, mcpServer: McpServer): void {
    this.handlersRegistry = handlersRegistry;
    this.mcpServer = mcpServer;

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

    // Execute tool through SDK server
    // SDK server will use registered handlers from handlersRegistry
    // This is a placeholder - actual implementation will use SDK's callTool or similar method
    const result = await (this.mcpServer as any).callTool?.(toolName, params);
    return result;
  }
}
