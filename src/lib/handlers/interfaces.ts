import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';

// Re-export HandlerContext for consumers
export type { HandlerContext };

/**
 * Tool definition structure
 */
/**
 * SAP environment types for tool availability filtering.
 * - 'cloud'  — BTP ABAP Environment (jwt auth)
 * - 'onprem' — Modern on-premise (BASIS >= 7.50)
 * - 'legacy' — Legacy on-premise (BASIS < 7.50)
 */
export type SapEnvironment = 'cloud' | 'onprem' | 'legacy';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema or Zod schema object
  /**
   * SAP environments where this tool is available.
   * If omitted, the tool is available in all environments.
   */
  available_in?: readonly SapEnvironment[];
}

/**
 * Tool handler function type with context injection
 * Context (containing connection and logger) is injected automatically by BaseMcpServer.registerHandlers()
 * and is NOT part of MCP tool signature
 */
export type ToolHandler = (context: HandlerContext, args: any) => Promise<any>;

/**
 * Handler registration entry
 */
export interface HandlerEntry {
  toolDefinition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * Interface for a group of handlers
 * Allows splitting handlers into logical groups (readonly, high-level, low-level, system, etc.)
 */
export interface IHandlerGroup {
  /**
   * Gets the name of the handler group (for identification and debugging)
   */
  getName(): string;

  /**
   * Gets all handler entries in this group
   * @returns Array of handler entries (tool definition + handler function)
   */
  getHandlers(): HandlerEntry[];

  /**
   * Registers all handlers from this group on the MCP server
   * @param server - McpServer instance for tool registration
   */
  registerHandlers(server: McpServer): void;
}

/**
 * Interface for handlers registry
 * Supports registration through handler groups via Dependency Injection
 */
export interface IHandlersRegistry {
  /**
   * Registers all tools on MCP server
   * @param server - McpServer instance for tool registration
   */
  registerAllTools(server: McpServer): void;

  /**
   * Registers a single tool on server
   * @param server - McpServer instance
   * @param toolName - tool name
   * @param toolDefinition - tool definition (name, description, inputSchema)
   * @param handler - handler function
   */
  registerTool(
    server: McpServer,
    toolName: string,
    toolDefinition: ToolDefinition,
    handler: ToolHandler,
  ): void;

  /**
   * Gets list of registered tools
   */
  getRegisteredTools(): string[];
}
