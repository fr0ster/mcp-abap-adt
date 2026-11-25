/**
 * `@mcp-abap-adt/lib/prompts`: the MCP prompts for the common ABAP work, for
 * an embedder's plain registration. `registerAbapPrompts(server, registry)`
 * registers them on an SDK `McpServer` from a `CompositeHandlersRegistry`
 * (`@mcp-abap-adt/lib/handlers`, `HandlerExporter.createRegistry()`); a
 * server instance (`BaseMcpServer`) registers them itself. Everything else
 * under this directory is internal.
 */
export { registerAbapPrompts } from './register.js';
