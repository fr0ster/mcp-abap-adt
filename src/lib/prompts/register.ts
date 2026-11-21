/**
 * How the prompts reach an SDK `McpServer`: each prompt registered with its
 * description and arguments, its answer the instruction's text.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { promptResult } from './result.js';
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
