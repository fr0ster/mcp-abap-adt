/**
 * The opt-in of a plain registration takes the exporter's registry as it is
 * returned: `createRegistry()` is typed as the registry `registerAbapPrompts`
 * accepts, so an embedder needs no narrowing. Checked by `test:check`; never
 * emitted.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type { IHandlersRegistry } from '../../lib/handlers/interfaces';
import { registerAbapPrompts } from '../../lib/prompts/register';

export function embedderRegistersPrompts(): void {
  const server = new McpServer({ name: 'embedder', version: '1' });
  registerAbapPrompts(
    server,
    new HandlerExporter({ systemType: 'onprem' }).createRegistry(),
  );
}

export function anyRegistryIsRefused(registry: IHandlersRegistry): void {
  const server = new McpServer({ name: 'embedder', version: '1' });
  // @ts-expect-error a registry registering its own tools has no listing to build prompts from
  registerAbapPrompts(server, registry);
}
