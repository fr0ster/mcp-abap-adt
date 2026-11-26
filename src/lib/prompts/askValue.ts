/**
 * The answer to a closed argument the user picks from when it is absent or
 * names a value this binary does not serve: an instruction, not a refusal,
 * naming the argument and the values it takes — the list its completion and
 * its description are built from — so a client that shows neither still
 * lets the model ask the user and call the prompt again.
 */
import { jsonLiteral } from './instruction.js';
import type { PromptInstruction, PromptName } from './types.js';

/** The closed arguments a user picks from. */
export type PickedArgument = 'object_type' | 'action';

/** The instruction asking which of `values` the user wants for `argument`; `given` the value as given, `undefined` when none. */
export function askValue(
  prompt: PromptName,
  argument: PickedArgument,
  given: string | undefined,
  values: readonly string[],
): PromptInstruction {
  const what =
    given === undefined
      ? `No ${argument} was given.`
      : `The ${argument} ${jsonLiteral(given)} is not served by this server.`;
  return {
    headline: `${what} The ${prompt} prompt takes: ${values.join(', ')}. Ask the user which one they want, then call it again.`,
    steps: [],
    notes: [],
  };
}
