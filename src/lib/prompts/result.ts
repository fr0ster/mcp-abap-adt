/** A prompt's answer to `prompts/get`. */
import { renderInstruction } from './instruction.js';
import type { AbapPrompt, GetPromptResult } from './types.js';

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
