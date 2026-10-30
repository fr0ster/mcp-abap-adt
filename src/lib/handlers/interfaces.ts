import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import type { AbapSystemKind } from '../systemKind.js';
import type { ArgsOf } from './argsOf.js';

// Re-export HandlerContext for consumers
export type { HandlerContext };

/**
 * Tool definition structure
 */
/**
 * SAP environment types for tool availability filtering.
 * - 'cloud'  — BTP ABAP Environment (jwt auth)
 * - 'onprem' — Modern on-premise (BASIS >= 7.50)
 * - 'legacy' — Legacy on-premise (BASIS < 7.50). Accepted by the type and
 *   declared by no tool: that support is parked on `parked/legacy-support`
 *   until it can be tried against a live legacy system.
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
  /**
   * What the tool states on each variant, where an argument's values (an
   * enum, a description listing them) are projected from the variant's ADT
   * type table (`adtProjections.ts`): the server registers the declared
   * variant's (`servedDefinition`). The definition's own `description` and
   * `inputSchema` are the on-premise one's, served when no variant is
   * declared.
   */
  variants?: { readonly [V in AbapSystemKind]: VariantToolDefinition };
}

/** A tool's description and input schema on one variant. */
export interface VariantToolDefinition {
  readonly description: string;
  readonly inputSchema: any;
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
  /**
   * The tool works on no connection of the instance: the server calls it
   * without building or connecting one first (the leftover-session tools,
   * whose resume must not log on). Its context's `connection` is absent.
   * A function decides per call, on the arguments as the SDK parsed them,
   * before any connection is taken (`HandlerBatch`: every action but `end`).
   */
  connectionless?: true | ((args: unknown) => boolean);
}

/**
 * Pairs a tool definition with its handler, checked by the compiler: the
 * handler must take the arguments the definition's schema declares
 * (`ArgsOf`). The entry it answers is the ordinary, erased `HandlerEntry`, so
 * registration is unchanged; the handler takes `(context, args)`, and every
 * registration path passes the call's context to such a handler.
 */
export function defineTool<const D extends ToolDefinition>(
  toolDefinition: D,
  handler: (
    context: HandlerContext,
    args: ArgsOf<D['inputSchema']>,
  ) => Promise<unknown>,
): HandlerEntry {
  return { toolDefinition, handler: handler as ToolHandler };
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
