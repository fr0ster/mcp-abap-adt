/**
 * The server's seam on the SDK's tool request handlers: `McpServer` installs
 * its `tools/list` and `tools/call` callbacks through the public
 * `server.setRequestHandler` on its first tool registration; the seam takes
 * that path over once, at the instance's construction, so the callbacks the
 * SDK installs are wrapped before any request reaches them. The SDK's
 * callbacks stay what answers: a wrapper only reads the request first and,
 * for `tools/list`, filters the SDK's own reply.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type {
  AnyObjectSchema,
  SchemaOutput,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  type Notification,
  type Request,
  type Result,
  type ServerNotification,
  type ServerRequest,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';

/** What a request handler of the instance's `Server` is handed beside the request. */
export type ToolRequestExtra = RequestHandlerExtra<
  ServerRequest | Request,
  ServerNotification | Notification
>;

/** What a request handler of the instance's `Server` answers. */
export type ToolRequestAnswer = ServerResult | Result;

/** What the seam asks of the instance. */
export interface ToolRequestSeam {
  /**
   * The tool names to leave out of this `tools/list` reply; empty: the
   * SDK's reply as it is. Runs inside the request's context, with its
   * signal.
   */
  unlisted(extra: ToolRequestExtra): Promise<ReadonlySet<string>>;
  /**
   * A `tools/call`'s answer decided before the SDK validates its arguments
   * (the raw request: an undeclared argument is still there), or
   * `undefined` to hand the request to the SDK's callback as it came.
   */
  refusedCall(
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ): CallToolResult | undefined;
}

/**
 * Takes over `server.setRequestHandler` so the `tools/list` callback the SDK
 * installs answers its own reply less the names `seam.unlisted` gives. Every
 * other handler is installed as given.
 */
export function installToolRequestSeam(
  server: Server,
  seam: ToolRequestSeam,
): void {
  const install = server.setRequestHandler.bind(server);
  server.setRequestHandler = <T extends AnyObjectSchema>(
    schema: T,
    handler: (
      request: SchemaOutput<T>,
      extra: ToolRequestExtra,
    ) => ToolRequestAnswer | Promise<ToolRequestAnswer>,
  ): void => {
    if (isSchema(schema, CallToolRequestSchema)) {
      install(schema, (request, extra) => {
        const call = CallToolRequestSchema.safeParse(request);
        const refused = call.success
          ? seam.refusedCall(
              call.data.params.name,
              call.data.params.arguments ?? {},
            )
          : undefined;
        return refused ?? handler(request, extra);
      });
      return;
    }
    if (!isSchema(schema, ListToolsRequestSchema)) {
      install(schema, handler);
      return;
    }
    install(schema, async (request, extra) => {
      const answer = await handler(request, extra);
      const unlisted = await seam.unlisted(extra);
      return unlisted.size === 0 ? answer : withoutTools(answer, unlisted);
    });
  };
}

/** Whether `schema` is `expected` itself: the SDK installs each by its exported schema. */
function isSchema(schema: object, expected: object): boolean {
  return schema === expected;
}

/**
 * The SDK's `tools/list` reply less the tools named in `unlisted`. The reply
 * is the SDK's handler's, typed only as any result: read as a listing, and
 * answered as it came when it is none.
 */
function withoutTools(
  answer: ToolRequestAnswer,
  unlisted: ReadonlySet<string>,
): ToolRequestAnswer {
  const listing = ListToolsResultSchema.safeParse(answer);
  if (!listing.success) return answer;
  return {
    ...listing.data,
    tools: listing.data.tools.filter((tool) => !unlisted.has(tool.name)),
  };
}
