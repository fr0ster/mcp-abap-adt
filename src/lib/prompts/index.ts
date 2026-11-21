/**
 * The MCP prompts for the common ABAP work: built from the tools a server
 * lists, on its kind, after its deny list — a prompt answers an instruction
 * naming those tools, and sends nothing to a system.
 */
import { renderInstruction } from './instruction.js';
import type { AbapPrompt, GetPromptResult } from './types.js';

export { completeFrom } from './completion.js';
export { jsonLiteral, renderInstruction } from './instruction.js';
export { abapPrompts } from './prompts.js';
export {
  notServedWords,
  promptRefusal,
  requiredWords,
  transportReadsWords,
  transportTakesWords,
} from './refusals.js';
export { matchServed, requiredArgument, type ServedType } from './served.js';
export {
  hasProperty,
  listedPromptTool,
  longToolStep,
  membersOn,
  promptSourceOf,
  requiredArguments,
  type StepWords,
  toolStep,
} from './source.js';
export type {
  AbapPrompt,
  ArgumentValue,
  ListedPromptTool,
  ObjectOperation,
  PromptInstruction,
  PromptName,
  PromptSource,
  PromptStep,
  ReadEntryField,
  RequiredArgument,
} from './types.js';

/** `prompt`'s answer for `args`: one user message, the instruction's text. */
export function promptResult(
  prompt: AbapPrompt,
  args: Record<string, string | undefined>,
): GetPromptResult {
  return {
    description: prompt.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: renderInstruction(prompt.instruction(args)),
        },
      },
    ],
  };
}
