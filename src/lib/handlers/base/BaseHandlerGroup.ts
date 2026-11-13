import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type * as z from 'zod';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import type { IAccessChecks } from '../../access/accessChecks.js';
import {
  accessCallOf,
  type CheckedArguments,
  checkedArgumentsOf,
} from '../../access/checkedArguments.js';
import { refusalOf } from '../../access/listedAccessChecks.js';
import { lazyPackageReader } from '../../access/packageReader.js';
import { ServerRefusal } from '../../auth/serverRefusal.js';
import {
  BACKGROUND_INVALID_WORDS,
  isBackgroundRunTool,
  isBackgroundTool,
  longToolInTheCall,
  readBackground,
  withoutBackground,
} from '../../backgroundRuns/tools.js';
import { listedTool, statedEnvironment } from '../../listedTool.js';
import { runLongCall } from '../../longCall.js';
import { isLongRead, isLongTool } from '../../longTools.js';
import { stateSystemKind } from '../../systemKind.js';
import { normalizeToolContent, type ToolResultLike } from '../../toolResult.js';
import { return_error } from '../../utils.js';
import { child } from '../../xml/tree';
import type {
  HandlerEntry,
  IHandlerGroup,
  SapEnvironment,
} from '../interfaces.js';
import { type CallContext, inStatedScope } from '../utils/handlerCall.js';

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
   * The context this group runs its calls in by default: a group that
   * stands for this one (the deny list's `NarrowedHandlerGroup`) is built
   * on it, so it states what this one states.
   */
  groupContext(): HandlerContext {
    return this.context;
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
   * connection above all), passed to the entry's call. A rejection of
   * `callContext` is the call's answer, and the handler does not run.
   */
  registerHandlersOnCall(server: McpServer, callContext: CallContext): void {
    for (const entry of this.getHandlers()) {
      this.registerOneTool(server, entry, callContext);
    }
  }

  /**
   * Registers one tool as `registerHandlers` registers each of the group's:
   * listed on the variant the group states (left out when it does not serve
   * it), each call in the group's path — the stated kind, the entry's call
   * with the call's context — in the context `callContext` gives (the
   * group's own by default). The path `CompositeHandlersRegistry.registerTool`
   * registers a tool of the group by.
   */
  registerOneTool(
    server: McpServer,
    entry: HandlerEntry,
    callContext: CallContext = () => Promise.resolve(this.context),
  ): void {
    // A group registered on its own keeps no background runs: no
    // background-run tool is listed, and a listed long tool is listed
    // without `background` and answers in the call.
    if (isBackgroundRunTool(entry.toolDefinition.name)) return;
    const listed = listedTool(
      isLongTool(entry.toolDefinition.name)
        ? longToolInTheCall(entry.toolDefinition)
        : entry.toolDefinition,
      this.statedSystemType(),
    );
    if (!listed.listed) return;
    // What the access checks read of this tool's calls, computed once here;
    // nothing when the group's context carries no strategy.
    const access = this.context.accessChecks;
    this.registerToolOnServer(
      server,
      entry.toolDefinition.name,
      listed.description,
      listed.inputSchema,
      entry.call,
      listed.search,
      callContext,
      access === undefined
        ? undefined
        : {
            checks: access.checks,
            checked: checkedArgumentsOf(entry.toolDefinition, access.readOnly),
          },
    );
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
    inputSchema: z.ZodObject,
    call: HandlerEntry['call'],
    search: { _meta?: Record<string, unknown> } = {},
    callContext: CallContext = () => Promise.resolve(this.context),
    access?: {
      readonly checks: IAccessChecks;
      readonly checked: CheckedArguments | undefined;
    },
  ): void {
    server.registerTool(
      toolName,
      {
        description,
        inputSchema,
        ...search,
      },
      async (given: Record<string, unknown>) => {
        try {
          // A run tool's `background` is the server instance's to serve: a
          // group registered on its own has no strategy, so a background run
          // is refused here, never run in the foreground instead.
          let args = given;
          if (isBackgroundTool(toolName)) {
            const background = readBackground(given);
            if (background === null) {
              return return_error(new Error(BACKGROUND_INVALID_WORDS));
            }
            if (background) {
              return return_error(
                new ServerRefusal('background_runs_unavailable'),
              );
            }
            args = withoutBackground(given);
          }
          // The argument refusals come before the call's context: a refused
          // call asks for none (no provider is called).
          const listed = isLongTool(toolName);
          const read = listed && isLongRead(toolName, args);
          // A listed long tool is listed here without `background` (a group
          // registered on its own keeps no background runs): its read
          // answers in the call.
          // The call's context, asked for once: by the access checks'
          // package reader when it reads first, else here.
          let asked: Promise<HandlerContext> | undefined;
          const contextOnce = () => {
            asked ??= callContext();
            return asked;
          };
          // The access checks (spec §3.2), before the call's context: a
          // refused call asks for none, and nothing is sent.
          const accessCall =
            access?.checked === undefined
              ? undefined
              : accessCallOf(toolName, access.checked, args);
          if (access !== undefined && accessCall !== undefined) {
            const verdict = await access.checks.check(
              accessCall,
              lazyPackageReader(
                async () => (await contextOnce()).connection,
                this.context.logger,
                new AbortController().signal,
                async (read) => inStatedScope(await contextOnce(), args, read),
              ),
            );
            if (!verdict.allowed) return return_error(refusalOf(verdict));
          }
          // The call's context, asked for now: the group's own, or one made
          // for this call (its provider's connection). Its rejection is
          // this call's answer (the catch below); the handler does not run.
          const context = await contextOnce();
          // The kind the context states on its connection (none stated,
          // none: SAP_SYSTEM_TYPE is not read), the call-transport scope,
          // and the connection's parameters when the context carries a
          // resolver (and rules) — the scope `HandlerExporter` gives every
          // handler it hands out (`inStatedScope`).
          const withParameters = <T>(fn: () => Promise<T>) =>
            inStatedScope(context, args, fn);
          let result: ToolResultLike;
          if (read) {
            // A listed long tool: a read on a connection of its own, in the
            // call, logged off after the answer.
            result = await withParameters(() =>
              runLongCall({
                name: toolName,
                connection: context.connection,
                logger: context.logger,
                run: (own) => {
                  stateSystemKind(own, context.systemType);
                  const ownContext: HandlerContext = {
                    ...context,
                    connection: own,
                  };
                  return call(ownContext, args);
                },
              }),
            );
          } else {
            result = await withParameters(() => call(context, args));
          }

          // Same normalizer as BaseMcpServer — see src/lib/toolResult.ts.
          // Note this also fixes a pre-existing divergence: the old inline copy
          // used `item?.text || …`, so an item with `text: ''` normalized to a
          // stringified object here but to an empty string on the other path.
          const content = normalizeToolContent(result);

          // A failed tool returns an isError result — it does not throw.
          if (child(result, 'isError')) {
            return { content, isError: true };
          }

          return { content };
        } catch (error) {
          return return_error(error);
        }
      },
    );
  }
}
