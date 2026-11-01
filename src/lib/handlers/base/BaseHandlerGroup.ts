import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import { ServerRefusal } from '../../auth/serverRefusal.js';
import {
  BACKGROUND_INVALID_WORDS,
  isBackgroundTool,
  readBackground,
  withoutBackground,
} from '../../backgroundRuns/tools.js';
import { listedTool, statedEnvironment } from '../../listedTool.js';
import { runLongCall } from '../../longCall.js';
import {
  isLongRead,
  isLongTool,
  readTimeout,
  TIMEOUT_INVALID_WORDS,
  TIMEOUT_NOT_FOR_RUN_WORDS,
  withoutTimeout,
} from '../../longTools.js';
import { stateSystemKind } from '../../systemKind.js';
import { normalizeToolContent } from '../../toolResult.js';
import { return_error } from '../../utils.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  SapEnvironment,
  ToolHandler,
} from '../interfaces.js';
import {
  type CallContext,
  callInItsForm,
  type InGroupContext,
  inStatedScope,
} from '../utils/handlerCall.js';
import { registeredSchema } from '../utils/schemaUtils.js';

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
   * The SAP environment this group's context states (`systemType`), the
   * variant its tools are listed and called on; `undefined` when it states
   * none. Read from the context only, never from the environment.
   */
  statedSystemType(): SapEnvironment | undefined {
    return statedEnvironment(this.context.systemType);
  }

  /**
   * Registers all handlers from this group on the MCP server, as the
   * variant the group's context states lists them (`listedTool`, the rule
   * a server instance applies): a tool that variant does not serve is left
   * out, the others carry its description, schema and search members. With
   * none stated, every definition as it is.
   */
  registerHandlers(server: McpServer): void {
    this.registerHandlersOnCall(server, () => Promise.resolve(this.context));
  }

  /**
   * Registers the group's tools as `registerHandlers` does, each call
   * running in the context `callContext` gives it when the call comes (its
   * connection above all). An args-only handler reads that context as its
   * group's for exactly its synchronous call, so calls at once on one group
   * each read their own. A rejection of `callContext` is the call's answer,
   * and the handler does not run.
   */
  registerHandlersOnCall(server: McpServer, callContext: CallContext): void {
    const environment = this.statedSystemType();
    for (const entry of this.getHandlers()) {
      const listed = listedTool(entry.toolDefinition, environment);
      if (!listed.listed) continue;
      this.registerToolOnServer(
        server,
        entry.toolDefinition.name,
        listed.description,
        listed.inputSchema,
        entry.handler,
        listed.search,
        callContext,
      );
    }
  }

  /**
   * Helper function to register a tool on McpServer
   * Wraps handler to convert our response format to MCP format
   * `search`: the tool's search `_meta` (`listedTool`), when it has one.
   * `callContext`: the context each call runs in, asked for when it comes;
   * the group's own by default.
   */
  protected registerToolOnServer(
    server: McpServer,
    toolName: string,
    description: string,
    inputSchema: any,
    handler: ToolHandler,
    search: { _meta?: Record<string, unknown> } = {},
    callContext: CallContext = () => Promise.resolve(this.context),
  ): void {
    // A JSON Schema converted to Zod (`registeredSchema`), as the SDK takes it.
    const zodSchema = registeredSchema(inputSchema);

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodSchema,
        ...search,
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
          // The call's context, asked for now: the group's own, or one made
          // for this call (its provider's connection). Its rejection is
          // this call's answer (the catch below); the handler does not run.
          const context = await callContext();
          // An args-only handler reads its group's context when it is
          // called: the call's own, for exactly that synchronous call, then
          // the group's again — so calls at once each read their own.
          const inGroupContext: InGroupContext = (given, call) => {
            const before = this.context;
            this.context = given;
            try {
              return call();
            } finally {
              this.context = before;
            }
          };
          // The kind the context states on its connection (none stated,
          // none: SAP_SYSTEM_TYPE is not read), the call-transport scope,
          // and the connection's parameters when the context carries a
          // resolver (and rules) — the scope `HandlerExporter` gives every
          // handler it hands out (`inStatedScope`).
          const withParameters = <T>(fn: () => Promise<T>) =>
            inStatedScope(context, args, fn);
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
                  stateSystemKind(own, context.systemType);
                  const ownContext = {
                    ...context,
                    connection: own,
                  } as HandlerContext;
                  return callInItsForm(
                    handler,
                    ownContext,
                    withoutTimeout(args),
                    inGroupContext,
                  );
                },
              }),
            );
          } else {
            result = await withParameters(() =>
              callInItsForm(handler, context, args, inGroupContext),
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
