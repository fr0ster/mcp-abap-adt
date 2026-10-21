/**
 * `@mcp-abap-adt/server-runtime/stdio/server` — the standalone MCP server over
 * stdio, AGPL-3.0-only: `StdioServer`, core's parameter table, the env-file
 * resolution and the destination source. `@mcp-abap-adt/core` re-exports it.
 *
 * Streamable HTTP is this package's `http/server` path and HTTP+SSE its
 * `sse/server`, serving credentials from each request's headers.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 */

// core's parameter table and the destination's env file
export * from './config/coreParameters.js';
export * from './config/envFileContext.js';
export * from './config/envResolver.js';
export * from './config/platformPaths.js';
export * from './destinationSource.js';
export * from './StdioServer.js';
