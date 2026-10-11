/**
 * @mcp-abap-adt/compact — the compact ABAP ADT server and its command.
 *
 * 25 tools instead of 370: one per operation, with the object in `object_type`. For
 * a host that cannot build a retrieval pipeline of its own and must still drive ABAP
 * through MCP reliably.
 *
 * The tools themselves are in `@mcp-abap-adt/compact-readonly` (16, changing
 * nothing) and `@mcp-abap-adt/compact-modify` (9, writing, locking, activating or
 * executing). A consumer that wants only one capability imports that package
 * directly; this one is the server that serves both.
 */
export { CompactHandlersGroup } from './group';
export { main } from './launcher';
