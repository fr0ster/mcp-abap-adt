/**
 * `@mcp-abap-adt/http` — the Streamable HTTP transport of the MCP ABAP ADT
 * server, AGPL-3.0-only.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 *
 * The code lives in `@mcp-abap-adt/server-runtime` (19.2.0): this module
 * re-exports its `http/server` path, so an importer of `@mcp-abap-adt/http`
 * sees the names it saw before.
 */
import { StreamableHttpServer as RuntimeStreamableHttpServer } from '@mcp-abap-adt/server-runtime/http/server';
import { HTTP_VERSION } from './httpVersion.js';

// http's parameter table and the server
export * from '@mcp-abap-adt/server-runtime/http/server';

/**
 * The runtime's Streamable HTTP server, answering http's version when none is
 * given — as a direct constructor call did before the code moved, even when
 * the runtime is at another patch than http.
 */
export class StreamableHttpServer extends RuntimeStreamableHttpServer {
  constructor(
    ...[handlersRegistry, opts]: ConstructorParameters<
      typeof RuntimeStreamableHttpServer
    >
  ) {
    super(handlersRegistry, {
      ...opts,
      version: opts?.version ?? HTTP_VERSION,
    });
  }
}
