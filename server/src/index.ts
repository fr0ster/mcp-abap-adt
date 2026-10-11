/**
 * `@mcp-abap-adt/core` — the standalone MCP server over stdio, AGPL-3.0-only.
 *
 * Streamable HTTP is `@mcp-abap-adt/http` and HTTP+SSE `@mcp-abap-adt/sse`:
 * packages of their own, serving credentials from each request's headers.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 */

// core's parameter table and the destination's env file (D38, §3.4)
export * from './config/coreParameters.js';
export * from './config/envFileContext.js';
export * from './config/envResolver.js';
export * from './config/platformPaths.js';
export * from './destinationSource.js';
export * from './StdioServer.js';
