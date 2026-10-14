/**
 * @mcp-abap-adt/sse-ro — the read-only ABAP ADT server over HTTP+SSE, and its
 * command `mcp-abap-adt-sse-ro`: the readonly tools (with system and search);
 * no high, debugger, background-run or resume tool. Those are `mcp-abap-adt-sse`'s.
 */
export { main, readOnlyToolSet, SSE_RO_VERSION } from './launcher';
