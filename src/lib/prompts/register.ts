/**
 * How the prompts reach an SDK `McpServer`: each prompt registered with its
 * description and arguments, its answer the instruction's text.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CompositeHandlersRegistry } from '../handlers/registry/CompositeHandlersRegistry.js';
import { abapPrompts } from './prompts.js';
import { promptResult } from './result.js';
import { promptKindOf, promptSourceOf } from './source.js';
import type { AbapPrompt } from './types.js';

/** Registers each of `prompts` on `server`, in their order. */
export function registerPrompts(
  server: McpServer,
  prompts: readonly AbapPrompt[],
): void {
  for (const prompt of prompts) {
    server.registerPrompt(
      prompt.name,
      { description: prompt.description, argsSchema: prompt.argsSchema },
      (args) => promptResult(prompt, args),
    );
  }
}

/**
 * Registers on `server` the prompts of the tools `registry` registers
 * plainly (`registerAllTools`, `HandlerExporter.registerOnServer`): built
 * from its listing on the kind its groups state, with no background-run
 * strategy and no `state_handle`. The opt-in of a plain registration, which
 * registers no prompt itself; on `legacy` none is registered. A second call
 * on the same server throws the SDK's `Prompt <name> is already registered`.
 */
export function registerAbapPrompts(
  server: McpServer,
  registry: CompositeHandlersRegistry,
): void {
  const { kind, tools } = registry.plainListing();
  const stated = promptKindOf(kind);
  if (stated === undefined) return;
  registerPrompts(
    server,
    abapPrompts(promptSourceOf(stated.kind, false, tools)),
  );
}
