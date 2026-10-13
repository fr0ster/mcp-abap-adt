/**
 * @mcp-abap-adt/compact-http-ro — the read-only compact ABAP ADT server over
 * Streamable HTTP, and its command `mcp-abap-adt-compact-http-ro`: the 16
 * compact tools that change nothing and the leftover-session list and logoff;
 * no modify half, debugger, background-run or resume tool. Those are
 * `mcp-abap-adt-compact-http`'s.
 */
export { COMPACT_HTTP_RO_VERSION, main, readOnlyToolSet } from './launcher';
