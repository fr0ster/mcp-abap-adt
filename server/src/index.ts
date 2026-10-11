/**
 * `@mcp-abap-adt/core` — the standalone MCP server, AGPL-3.0-only.
 *
 * Importing from here links AGPL code. If you are embedding ADT tools in your
 * own application, you want `@mcp-abap-adt/lib` instead: it carries the
 * handlers and the embeddable server under Apache-2.0, and no transport.
 */
export * from '@mcp-abap-adt/http';
// What `@mcp-abap-adt/http` exported before the shared helpers moved to lib
// (D50): core's own surface stays as it was.
export {
  checkDnsRebinding,
  createServerListener,
  type DnsRebindingOptions,
  getProtocol,
  withDnsRebindingProtection,
} from '@mcp-abap-adt/lib/http-transport';
export * from '@mcp-abap-adt/sse';
export * from './StdioServer.js';
