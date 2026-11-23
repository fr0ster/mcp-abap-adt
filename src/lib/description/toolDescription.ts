/**
 * A tool's description, assembled (plan step 10): its purpose — the tool's
 * function, the main part — then the facts of what information it gives
 * back, then its notes. Nothing else reaches it: no free text but the
 * purpose sentence, no word of the answer's form.
 */

import type { Note } from './notes';
import type { Purpose } from './purpose';
import type { ReturnsFact } from './returns';

/**
 * The tag a description opens with, from the tool's kind: a read tool is
 * `[read-only]`, a low-level tool `[low-level]` — written by the builder
 * alone, never by the purpose sentence.
 */
export type DescriptionTag = 'read-only' | 'low-level';

/** What a description is assembled from. */
export interface DescriptionParts {
  readonly tag?: DescriptionTag | undefined;
  readonly purpose: Purpose;
  readonly returns: readonly ReturnsFact[];
  readonly notes?: readonly Note[] | undefined;
}

/** Every assembled description's parts, by its text: what the description tests read. */
const assembled = new Map<string, DescriptionParts>();

/** A tool's description: its tag, its purpose, then its facts, then its notes. */
export function toolDescription(parts: DescriptionParts): string {
  const text = [
    ...(parts.tag === undefined ? [] : [`[${parts.tag}]`]),
    parts.purpose.text,
    ...parts.returns.map((each) => each.text),
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
