import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import { ServerRefusal } from '../../auth/serverRefusal.js';
import {
  BACKGROUND_INVALID_WORDS,
  isBackgroundTool,
  readBackground,
  withoutBackground,
} from '../../backgroundRuns/tools.js';
import { runWithCallTransport } from '../../callTransport.js';
import { runLongCall } from '../../longCall.js';
import {
  isLongRead,
  isLongTool,
  readTimeout,
  TIMEOUT_INVALID_WORDS,
  TIMEOUT_NOT_FOR_RUN_WORDS,
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
      async (given: any) => {
        try {
          // A run tool's `background` is the server instance's to serve: a
          // group registered on its own has no strategy, so a background run
          // is refused here, never run in the foreground instead.
          let args = given;
          if (isBackgroundTool(toolName)) {
            const background = readBackground(given);
            if (background === null) {
              return return_error(new Error(BACKGROUND_INVALID_WORDS)) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            }
            if (background) {
              return return_error(
                new ServerRefusal('background_runs_unavailable'),
              ) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            }
            args = withoutBackground(given);
          }
          // The connection's parameters, when the registrant's context
          // carries a resolver (and rules) — see
          // src/lib/requestSystemResolution.ts; else nothing is looked up.
          const context = this.context;
          // Inside the call-transport scope with this call's own
          // `transport_request`: the failure renderer's transport hint.
          const withParameters = <T>(fn: () => Promise<T>) =>
            runWithCallTransport(args, () =>
              withResolvedSystemContext(
                context?.connection,
                fn,
                context?.systemContextResolver ?? null,
                context?.systemType,
                context?.systemContextRules ?? null,
              ),
            );
          let result: any;
          const listed = isLongTool(toolName);
          const read = listed && isLongRead(toolName, args);
          if (listed && !read && readTimeout(args) !== undefined) {
            // A listed tool's run mode takes no `timeout`.
            return return_error(new Error(TIMEOUT_NOT_FOR_RUN_WORDS)) as {
              isError: true;
              content: { type: 'text'; text: string }[];
            };
          }
          if (read) {
            // A listed long tool: a read on a connection of its
            // own, its `timeout` cutting the read.
            const timeoutSeconds = readTimeout(args);
            if (timeoutSeconds === null) {
              return return_error(new Error(TIMEOUT_INVALID_WORDS)) as {
                isError: true;
                content: { type: 'text'; text: string }[];
              };
            }
            result = await withParameters(() =>
              runLongCall({
                name: toolName,
                connection: context.connection,
                logger: context.logger,
                timeoutSeconds,
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
            result = await withParameters(() => handler(context, args));
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
