/**
 * @mcp-abap-adt/compact-readonly — the read half of the compact facade.
 *
 * Compact is a different decomposition of the same surface: the OPERATION is the
 * tool and the object moves into `object_type`. That is what makes the tool list
 * short enough for a host that cannot build a retrieval pipeline of its own and must
 * still drive ABAP through MCP.
 *
 * This package carries one half of it. What a consumer gets from importing it is a
 * tool list with no route to the other half — capability decided by what is
 * imported, not by a flag a caller could pass, and checked against the module graph
 * rather than against a list of names.
 */
export { CompactReadOnlyHandlersGroup, compactReadOnlyEntries } from './group';
