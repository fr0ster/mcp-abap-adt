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
export * from './destinationSource.js';
export * from './StdioServer.js';
