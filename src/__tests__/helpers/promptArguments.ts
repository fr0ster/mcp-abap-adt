/**
 * The arguments a test hands a prompt to have its text: the closed argument
 * (`object_type`, or `transport`'s `action`) set to one value it completes,
 * every argument the prompt lists as required filled with a stand-in, the
 * arguments a transport action takes, and the one argument a type needs
 * beside them (`where_used`'s `container` for `text_elements`). An optional
 * argument stays absent, so a text lists it still to fill where it does.
 *
 * Beside them: the tools a text or a description names, read as words.
 */

import { TRANSPORT_ACTIONS } from '../../lib/prompts/transportPrompt';

/** The argument whose values a prompt is asked for, one text each. */
export function closedArgumentOf(prompt: string): 'action' | 'object_type' {
  return prompt === 'transport' ? 'action' : 'object_type';
}

/** The stand-in value of an argument the user writes. */
export const standIn = (argument: string): string =>
  argument === 'object_type' ? 'class' : `SOME_${argument.toUpperCase()}`;

/** What a type needs beside its required arguments, per prompt and value. */
const BESIDE: Readonly<
  Record<string, Readonly<Record<string, Record<string, string>>>>
> = {
  where_used: { text_elements: { container: 'program' } },
};

/** The arguments a transport action takes, `[]` for any other value. */
function actionTakes(action: string): readonly string[] {
  return (
    Object.entries(TRANSPORT_ACTIONS).find(([name]) => name === action)?.[1]
      .takes ?? []
  );
}

/**
 * The arguments of `prompt` for `value` of its closed argument: `required`
 * names the arguments the prompt lists as required.
 */
export function promptArguments(
  prompt: string,
  value: string,
  required: readonly string[],
): Record<string, string> {
  const closed = closedArgumentOf(prompt);
  const args: Record<string, string> = {};
  const filled = [
    ...required,
    ...(prompt === 'transport' ? actionTakes(value) : []),
  ];
  for (const name of filled) {
    if (name !== closed) args[name] = standIn(name);
  }
  args[closed] = value;
  return { ...args, ...BESIDE[prompt]?.[value] };
}

/** The words of `text`: its runs of letters, digits and underscores. */
function wordsOf(text: string): Set<string> {
  const words = new Set<string>();
  let word = '';
  for (const character of `${text} `) {
    const code = character.charCodeAt(0);
    const inWord =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      character === '_';
    if (inWord) {
      word += character;
    } else if (word !== '') {
      words.add(word);
      word = '';
    }
  }
  return words;
}

/** The names of `known` that `text` names as words, sorted. */
export function toolsNamed(text: string, known: ReadonlySet<string>): string[] {
  return [...wordsOf(text)].filter((word) => known.has(word)).sort();
}
