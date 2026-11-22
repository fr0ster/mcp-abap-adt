/**
 * The server's seam on the SDK's `tools/call` request handler: `McpServer`
 * installs its callback through the public `server.setRequestHandler` on its
 * first tool registration; the seam takes that path over once, at the
 * instance's construction, so the callback the SDK installs is wrapped before
 * any request reaches it. The SDK's callback stays what answers: the wrapper
 * only reads the request first. `tools/list` is the SDK's own, untouched: the
 * abapGit tools are always listed, and availability is decided at call time
 * (spec §4.5).
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
 * Takes over `server.setRequestHandler` so the `tools/call` callback the SDK
 * installs first answers what `seam.refusedCall` decides. Every other handler
 * is installed as given.
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
    install(schema, handler);
  };
}

/** Whether `schema` is `expected` itself: the SDK installs each by its exported schema. */
function isSchema(schema: object, expected: object): boolean {
  return schema === expected;
}
