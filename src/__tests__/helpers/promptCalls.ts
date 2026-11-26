/**
 * Calls of a prompt as a client makes them: its text for some arguments,
 * its refusal, its completion of an argument, and the prompts a source
 * lists by name.
 */

import assert from 'node:assert/strict';
import { getCompleter } from '@modelcontextprotocol/sdk/server/completable.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { renderInstruction } from '../../lib/prompts/instruction';
import type { AbapPrompt, PromptSource } from '../../lib/prompts/types';

/** The prompt `factory` builds from `source`, which must list it. */
export function promptOf(
  factory: (source: PromptSource) => AbapPrompt | undefined,
  source: PromptSource,
): AbapPrompt {
  const prompt = factory(source);
  assert.ok(prompt, 'the prompt is listed');
  return prompt;
}

/** The text `prompt` answers for `args`. */
export function textOf(
  prompt: AbapPrompt,
  args: Record<string, string | undefined>,
): string {
  return renderInstruction(prompt.instruction(args));
}

/**
 * `prompt` refuses `args` as the protocol's InvalidParams, with exactly
 * `words` — or, with `prefix`, with words starting so.
 */
export function assertRefused(
  prompt: AbapPrompt,
  args: Record<string, string | undefined>,
  words: string,
  prefix = false,
): void {
  assert.throws(
    () => prompt.instruction(args),
    (error: Error) => {
      assert.ok(error instanceof McpError);
      assert.equal(error.code, ErrorCode.InvalidParams);
      const said = `MCP error ${ErrorCode.InvalidParams}: ${words}`;
      if (prefix) assert.ok(error.message.startsWith(said), error.message);
      else assert.equal(error.message, said);
      return true;
    },
  );
}

/**
 * `prompt` answers `args` with no call: one line naming `argument` — absent,
 * or the value given that this binary does not serve — and listing exactly
 * the values its completion offers, the model told to ask the user and call
 * the prompt again. The words are written here, not taken from the source.
 */
export async function assertAsked(
  prompt: AbapPrompt,
  args: Record<string, string | undefined>,
  argument: 'object_type' | 'action',
): Promise<void> {
  const values = await completionOf(prompt, argument);
  assert.ok(values.length > 0, `${prompt.name} completes ${argument}`);
  const given = args[argument]?.trim();
  const what =
    given === undefined || given === ''
      ? `No ${argument} was given.`
      : `The ${argument} ${JSON.stringify(given)} is not served by this server.`;
  const instruction = prompt.instruction(args);
  assert.deepEqual(instruction.steps, []);
  assert.equal(
    renderInstruction(instruction),
    `${what} The ${prompt.name} prompt takes: ${values.join(', ')}. Ask the user which one they want, then call it again.`,
  );
}

/** The values `prompt` completes argument `name` with, for `typed`. */
export async function completionOf(
  prompt: AbapPrompt,
  name: string,
  typed = '',
  context: Record<string, string> = {},
): Promise<readonly string[]> {
  const schema = prompt.argsSchema[name];
  assert.ok(schema, `${prompt.name} takes ${name}`);
  const complete = getCompleter(schema);
  assert.ok(complete, `${prompt.name} completes ${name}`);
  const values = await complete(typed, { arguments: context });
  return values.map(String);
}
