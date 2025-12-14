/**
 * Protocol handler interface
 *
 * Protocol handler processes MCP requests and routes them to appropriate handlers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IHandlersRegistry } from '../../handlers/interfaces.js';

/**
 * Protocol handler interface
 *
 * Processes MCP requests and routes them to appropriate handlers
 */
export interface IProtocolHandler {
  /**
   * Initializes protocol handler with handlers registry and MCP server
   * @param handlersRegistry - Handlers registry
   * @param mcpServer - MCP server SDK instance
   */
  initialize(handlersRegistry: IHandlersRegistry, mcpServer: McpServer): void;

  /**
   * Handles incoming MCP request
   * @param sessionId - Session identifier
   * @param request - MCP request message
   * @returns MCP response message
   */
  handleRequest(sessionId: string, request: any): Promise<any>; // TODO: Import proper types from SDK
}
