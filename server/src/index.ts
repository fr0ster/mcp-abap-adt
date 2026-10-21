/**
 * `@mcp-abap-adt/core` — the standalone MCP server over stdio, AGPL-3.0-only.
 *
 * Streamable HTTP is `@mcp-abap-adt/http` and HTTP+SSE `@mcp-abap-adt/sse`:
 * packages of their own, serving credentials from each request's headers.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 *
 * The code lives in `@mcp-abap-adt/server-runtime` (19.2.0): this module
 * re-exports its `stdio/server` path, so an importer of `@mcp-abap-adt/core`
 * sees the names it saw before.
 */
import { StdioServer as RuntimeStdioServer } from '@mcp-abap-adt/server-runtime/stdio/server';
import { CORE_VERSION } from './coreVersion.js';

// core's parameter table, the destination's env file, the destination source
export * from '@mcp-abap-adt/server-runtime/stdio/server';

/**
 * The runtime's stdio server, answering core's version when none is given —
 * as a direct constructor call did before the code moved, even when the
 * runtime is at another patch than core.
 */
export class StdioServer extends RuntimeStdioServer {
  constructor(
    ...[handlersRegistry, destinations, opts]: ConstructorParameters<
      typeof RuntimeStdioServer
    >
  ) {
    super(handlersRegistry, destinations, {
      ...opts,
      version: opts?.version ?? CORE_VERSION,
    });
  }
}
