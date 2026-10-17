/**
 * @mcp-abap-adt/compact-ro — the read-only compact ABAP ADT server over stdio,
 * and its command `mcp-abap-adt-compact-ro`: the 17 compact tools that change
 * nothing and the leftover-session list and logoff; no modify half, debugger,
 * background-run or resume tool. Those are `mcp-abap-adt-compact`'s.
 */
export { COMPACT_RO_VERSION, main, readOnlyToolSet } from './launcher';
