/**
 * @mcp-abap-adt/core-ro — the read-only ABAP ADT server over stdio, and its
 * command `mcp-abap-adt-ro`: the readonly tools (with system and search) and
 * the leftover-session list and logoff; no high, debugger, background-run or
 * resume tool. Those are `mcp-abap-adt`'s.
 */
export { CORE_RO_VERSION, main, readOnlyToolSet } from './launcher';
