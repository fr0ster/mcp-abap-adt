import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type * as z from 'zod';
import type { HandlerContext } from '../../handlers/interfaces.js';
import type { AbapSystemKind } from '../systemKind.js';

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

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  /** The tool's arguments: their type and the one check of a call's arguments. */
  inputSchema: S;
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
  readonly inputSchema: z.ZodObject;
  /**
   * The members its `object_type` (or `target_type`) offers there, for a
   * tool whose member picks the object: its search texts name only these.
   */
  readonly members?: readonly string[];
}

/** A tool call's arguments as they reach the server, before its own schema reads them. */
export type ToolArgs = Readonly<Record<string, unknown>>;

/**
 * Handler registration entry: the tool's definition and how one of its calls
 * runs, given the call's context and its arguments. Every registration path
 * passes the call's context at the call.
 */
export interface HandlerEntry<R = unknown> {
  readonly toolDefinition: ToolDefinition;
  /**
   * Runs one call: the arguments parsed with the definition's schema, the
   * handler called with the call's context and their typed output; refused,
   * naming each issue, when they do not parse.
   */
  readonly call: (context: HandlerContext, args: ToolArgs) => Promise<R>;
  /**
   * The tool works on no connection of the instance: the server calls it
   * without building or connecting one first (the leftover-session tools,
   * whose resume must not log on). Its context's `connection` is absent.
   * A function decides per call, on the arguments as the SDK parsed them,
   * before any connection is taken (`HandlerBatch`: every action but `end`).
   */
  readonly connectionless?: true | ((args: ToolArgs) => boolean);
}

/**
 * Pairs a tool definition with its handler, checked by the compiler: the
 * handler takes the output of the definition's schema. The entry's call
 * parses a call's arguments with that schema and hands the handler the
 * result; arguments that do not parse are refused, naming each issue, and
 * the handler does not run. The call answers what the handler answers.
 */
export function defineTool<S extends z.ZodObject, R>(
  toolDefinition: ToolDefinition<S>,
  handler: (context: HandlerContext, args: z.output<S>) => Promise<R>,
): HandlerEntry<R> {
  return {
    toolDefinition,
    call: async (context, args) => {
      const parsed = toolDefinition.inputSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          invalidArgumentsWords(toolDefinition.name, parsed.error.issues),
        );
      }
      return handler(context, parsed.data);
    },
  };
}

/** The refusal of arguments a tool's schema does not parse: each issue, at its path. */
export function invalidArgumentsWords(
  tool: string,
  issues: readonly z.core.$ZodIssue[],
): string {
  const each = issues.map((issue) =>
    issue.path.length === 0
      ? issue.message
      : `${issue.message} at ${issue.path.map(String).join('.')}`,
  );
  return `Input validation error: Invalid arguments for tool ${tool}: ${each.join('\n')}`;
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
   * @param entry - the tool's definition and its call
   */
  registerTool(server: McpServer, entry: HandlerEntry): void;

  /**
   * Gets list of registered tools
   */
  getRegisteredTools(): string[];
}
