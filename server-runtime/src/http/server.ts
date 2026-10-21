/**
 * `@mcp-abap-adt/server-runtime/http/server` — the Streamable HTTP transport of
 * the MCP ABAP ADT server, AGPL-3.0-only: `StreamableHttpServer` and http's
 * parameter table. `@mcp-abap-adt/http` re-exports it.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 */

// http's parameter table
export * from './config/httpParameters.js';
export * from './StreamableHttpServer.js';
