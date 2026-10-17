/**
 * @mcp-abap-adt/compact-http — the compact ABAP ADT server over Streamable HTTP, and its
 * command.
 *
 * 29 tools instead of 370: one per operation, with the object in `object_type`,
 * composed of `@mcp-abap-adt/compact-readonly-entries` and `@mcp-abap-adt/compact-modify`
 * by `compactToolSetOf` of `@mcp-abap-adt/lib/tool-set`, served by
 * `@mcp-abap-adt/http`'s launcher. stdio is `@mcp-abap-adt/compact`.
 */
export { COMPACT_HTTP_VERSION, compactToolSet, main } from './launcher';
