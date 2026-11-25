/**
 * A tool's description, assembled (plan step 10): its tag, its purpose —
 * the tool's function, in one sentence — and its usage notes; nothing else
 * (owner: a description is purely functional, its parameters in the schema).
 * No free text but the purpose sentence, no word of the answer's form.
 */

import type { Note } from './notes';
import type { Purpose } from './purpose';

/**
 * The tag a description opens with, from the tool's kind: a read tool is
 * `[read-only]`, a low-level tool `[low-level]`, a debugger tool `[debug]` —
 * written by the builder alone, never by the purpose sentence.
 */
export type DescriptionTag = 'read-only' | 'low-level' | 'debug';

/** What a description is assembled from. */
export interface DescriptionParts {
  readonly tag?: DescriptionTag | undefined;
  readonly purpose: Purpose;
  readonly notes?: readonly Note[] | undefined;
}

/** Every assembled description's parts, by its text: what the description tests read. */
const assembled = new Map<string, DescriptionParts>();

/** A tool's description: its tag, its purpose, then its notes. */
export function toolDescription(parts: DescriptionParts): string {
  const text = [
    ...(parts.tag === undefined ? [] : [`[${parts.tag}]`]),
    parts.purpose.text,
    ...(parts.notes ?? []).map((note) => note.text),
  ].join(' ');
  assembled.set(text, parts);
  return text;
}

/** The parts a description was assembled from; none for one written whole. */
export function partsOfDescription(
  description: string,
): DescriptionParts | undefined {
  return assembled.get(description);
}
