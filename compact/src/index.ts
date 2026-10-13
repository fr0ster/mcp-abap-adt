/**
 * @mcp-abap-adt/compact — the compact ABAP ADT server over stdio, and its command.
 *
 * 27 tools instead of 370: one per operation, with the object in `object_type`. For
 * a host that cannot build a retrieval pipeline of its own and must still drive ABAP
 * through MCP reliably.
 *
 * The tools themselves are in `@mcp-abap-adt/compact-readonly-entries` (16, changing
 * nothing) and `@mcp-abap-adt/compact-modify` (9, writing, locking, activating or
 * executing), composed by `compactToolSetOf` of `@mcp-abap-adt/lib/tool-set`. A
 * consumer that wants only one capability imports that package directly; this one
 * is the stdio server that serves both. Streamable HTTP is
 * `@mcp-abap-adt/compact-http`, SSE `@mcp-abap-adt/compact-sse`.
 */
export { COMPACT_VERSION, compactToolSet, main } from './launcher';
