/**
 * @mcp-abap-adt/compact-sse — the compact ABAP ADT server over HTTP+SSE, and its
 * command.
 *
 * 29 tools instead of 370: one per operation, with the object in `object_type`,
 * composed of `@mcp-abap-adt/compact-readonly-entries` and `@mcp-abap-adt/compact-modify`
 * by `compactToolSetOf` of `@mcp-abap-adt/lib/tool-set`, served by
 * the HTTP+SSE launcher of `@mcp-abap-adt/server-runtime` (the one
 * `mcp-abap-adt-sse` runs). stdio is `@mcp-abap-adt/compact`.
 */
export { COMPACT_SSE_VERSION, compactToolSet, main } from './launcher';
