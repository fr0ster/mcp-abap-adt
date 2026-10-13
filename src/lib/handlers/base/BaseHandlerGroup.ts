import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import { runLongCall } from '../../longCall.js';
import {
  isLongTool,
  longToolMode,
  readTimeout,
  TIMEOUT_INVALID_WORDS,
  withoutTimeout,
} from '../../longTools.js';
import { withResolvedSystemContext } from '../../requestSystemResolution.js';
import { normalizeToolContent } from '../../toolResult.js';
import { return_error } from '../../utils.js';
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
        try {
          // A request that lacks responsible/master system gets them from an
          // ABAP Cloud connection — see src/lib/requestSystemResolution.ts.
          const context = this.context;
          let result: any;
          if (isLongTool(toolName)) {
            // A listed long tool (spec §5.8): on a connection of its own,
            // its `timeout` ending only the wait.
            const timeoutSeconds = readTimeout(args);
            if (timeoutSeconds === null) {
              return return_error(new Error(TIMEOUT_INVALID_WORDS)) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            }
            result = await withResolvedSystemContext(context?.connection, () =>
              runLongCall({
                name: toolName,
                connection: context.connection,
                logger: context.logger,
                timeoutSeconds,
                mode: longToolMode(toolName, args),
                run: (own) => {
                  const ownContext = {
                    ...context,
                    connection: own,
                  } as HandlerContext;
                  if (handler.length >= 2) {
                    return handler(ownContext, withoutTimeout(args));
                  }
                  // An args-only handler reads its group's context when it is
                  // called: the call's own, for exactly that synchronous call.
                  this.context = ownContext;
                  try {
                    return (handler as (args: unknown) => Promise<unknown>)(
                      withoutTimeout(args),
                    );
                  } finally {
                    this.context = context;
                  }
                },
              }),
            );
          } else {
            result = await withResolvedSystemContext(context?.connection, () =>
              handler(context, args),
            );
          }

          // Same normalizer as BaseMcpServer — see src/lib/toolResult.ts.
          // Note this also fixes a pre-existing divergence: the old inline copy
          // used `item?.text || …`, so an item with `text: ''` normalized to a
          // stringified object here but to an empty string on the other path.
          const content = normalizeToolContent(result);

          // A failed tool returns an isError result — it does not throw.
          if (result.isError) {
            return { content, isError: true };
          }

          return { content };
        } catch (error) {
          return return_error(error) as {
            isError: true;
            content: { type: 'text'; text: string }[];
          };
        }
      },
    );
  }
}
