/**
 * @mcp-abap-adt/responsible-rules — the rules of the MCP ABAP ADT servers
 * that name a call's responsible, user and system: a `SystemContextRules`
 * (the hook of `@mcp-abap-adt/lib`) making each connection's parameters
 * from its `systeminformation` by the system kind, once, when the
 * connection is created; and the system type the transports require.
 * core, http and sse pass them to their instances; lib applies none, so an
 * embedder gets these rules only when it passes them.
 */
export { responsibleRules } from './responsibleRules';
export { listenerSystemTypeRequiredWords, SYSTEM_TYPE_ROW } from './systemType';
