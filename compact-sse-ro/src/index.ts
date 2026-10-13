/**
 * @mcp-abap-adt/compact-sse-ro — the read-only compact ABAP ADT server over
 * HTTP+SSE, and its command `mcp-abap-adt-compact-sse-ro`: the 16 compact tools
 * that change nothing and the leftover-session list and logoff; no modify half,
 * debugger, background-run or resume tool. Those are
 * `mcp-abap-adt-compact-sse`'s.
 */
export { COMPACT_SSE_RO_VERSION, main, readOnlyToolSet } from './launcher';
