/**
 * The prompts' refusals: `prompts/get` answers an argument it refuses as the
 * protocol's error, `McpError(InvalidParams, words)`, before any instruction.
 */
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { jsonLiteral } from './instruction.js';
import type { PromptName } from './types.js';

/** The error a prompt throws for an argument it refuses. */
export function promptRefusal(words: string): McpError {
  return new McpError(ErrorCode.InvalidParams, words);
}

/** `object_type` names a type the prompt serves none of: the served ones are named. */
export function notServedWords(
  prompt: PromptName,
  value: string,
  servedLowercase: readonly string[],
): string {
  return `${prompt}: object_type ${jsonLiteral(value)} is not served by this server; it serves ${servedLowercase.join(', ')}.`;
}

/** A required argument is absent or blank. */
export function requiredWords(prompt: PromptName, argument: string): string {
  return `${prompt}: ${argument} is required.`;
}

/**
 * `function_group` is given for an object type whose steps read none: the
 * types that read it are named (lowercase).
 */
export function functionGroupReadWords(
  prompt: PromptName,
  takers: readonly string[],
): string {
  return takers.length === 0
    ? `${prompt}: function_group is read with no object_type this server serves.`
    : `${prompt}: function_group is read with object_type ${takers.join(', ')} only.`;
}

/** A transport action misses arguments it takes. */
export function transportTakesWords(
  action: string,
  takes: readonly string[],
): string {
  return `transport: action ${jsonLiteral(action)} takes ${takes.join(', ')}.`;
}
