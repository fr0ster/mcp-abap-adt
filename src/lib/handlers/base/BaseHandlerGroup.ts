import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  ToolHandler,
} from '../interfaces.js';
import { jsonSchemaToZod } from '../utils/schemaUtils.js';

/**
 * Base class for handler groups
 * Provides common functionality for registering handlers
 */
export abstract class BaseHandlerGroup implements IHandlerGroup {
  protected abstract groupName: string;
  protected context: HandlerContext;

  constructor(context: HandlerContext) {
    this.context = context;
  }
  /**
   * Gets the name of the handler group
   */
  getName(): string {
    return this.groupName;
  }

  /**
   * Gets all handler entries in this group
   * Must be implemented by subclasses
   */
  abstract getHandlers(): HandlerEntry[];

  /**
   * Registers all handlers from this group on the MCP server
   */
  registerHandlers(server: McpServer): void {
    const handlers = this.getHandlers();
    for (const entry of handlers) {
      this.registerToolOnServer(
        server,
        entry.toolDefinition.name,
        entry.toolDefinition.description,
        entry.toolDefinition.inputSchema,
        entry.handler,
      );
    }
  }

  /**
   * Helper function to register a tool on McpServer
   * Wraps handler to convert our response format to MCP format
   */
  protected registerToolOnServer(
    server: McpServer,
    toolName: string,
    description: string,
    inputSchema: any,
    handler: ToolHandler,
  ): void {
    // Convert JSON Schema to Zod if needed, otherwise pass as-is
    const zodSchema =
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.type === 'object' &&
      inputSchema.properties
        ? jsonSchemaToZod(inputSchema)
        : inputSchema;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodSchema,
      },
      async (args: any) => {
        const result = await handler(this.context, args);

        // If error, throw it
        if (result.isError) {
          const errorText =
            result.content
              ?.map((item: any) => {
                if (item?.type === 'json' && item.json !== undefined) {
                  return JSON.stringify(item.json);
                }
                return item?.text || String(item);
              })
              .join('\n') || 'Unknown error';
          throw new McpError(ErrorCode.InternalError, errorText);
        }

        // Convert content to MCP format - JSON items become text
        const content = (result.content || []).map((item: any) => {
          if (item?.type === 'json' && item.json !== undefined) {
            return {
              type: 'text' as const,
              text: JSON.stringify(item.json),
            };
          }
          return {
            type: 'text' as const,
            text: item?.text || String(item || ''),
          };
        });

        return { content };
      },
    );
  }
}
