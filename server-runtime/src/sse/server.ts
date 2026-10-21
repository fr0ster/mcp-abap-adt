/**
 * `@mcp-abap-adt/server-runtime/sse/server` — the HTTP+SSE transport of the MCP
 * ABAP ADT server, AGPL-3.0-only: `SseServer` and sse's parameter table.
 * `@mcp-abap-adt/sse` re-exports it.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 */

// sse's parameter table
export * from './config/sseParameters.js';
export * from './SseServer.js';
