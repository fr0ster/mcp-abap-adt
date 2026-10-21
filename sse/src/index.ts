/**
 * `@mcp-abap-adt/sse` — the HTTP+SSE transport of the MCP ABAP ADT server,
 * AGPL-3.0-only.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 *
 * The code lives in `@mcp-abap-adt/server-runtime` (19.2.0): this module
 * re-exports its `sse/server` path, so an importer of `@mcp-abap-adt/sse`
 * sees the names it saw before.
 */
import { SseServer as RuntimeSseServer } from '@mcp-abap-adt/server-runtime/sse/server';
import { SSE_VERSION } from './sseVersion.js';

// sse's parameter table and the server
export * from '@mcp-abap-adt/server-runtime/sse/server';

/**
 * The runtime's HTTP+SSE server, answering sse's version when none is given —
 * as a direct constructor call did before the code moved, even when the
 * runtime is at another patch than sse.
 */
export class SseServer extends RuntimeSseServer {
  constructor(
    ...[handlersRegistry, opts]: ConstructorParameters<typeof RuntimeSseServer>
  ) {
    super(handlersRegistry, {
      ...opts,
      version: opts?.version ?? SSE_VERSION,
    });
  }
}
