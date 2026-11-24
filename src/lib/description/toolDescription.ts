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
 * `[read-only]`, a low-level tool `[low-level]`, a debugger tool `[debug]` —
 * written by the builder
 * alone, never by the purpose sentence.
 */
export type DescriptionTag = 'read-only' | 'low-level' | 'debug';

/** What a description is assembled from. */
export interface DescriptionParts {
  readonly tag?: DescriptionTag | undefined;
  readonly purpose: Purpose;
  readonly returns: readonly ReturnsFact[];
  /**
   * The facts continue the purpose sentence (owner, compact facts): the
   * purpose, a colon, then the facts as its clauses — one sentence.
   */
  readonly inline?: true | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** Every assembled description's parts, by its text: what the description tests read. */
const assembled = new Map<string, DescriptionParts>();

/** A tool's description: its tag, its purpose, then its facts, then its notes. */
export function toolDescription(parts: DescriptionParts): string {
  const text = [
    ...(parts.tag === undefined ? [] : [`[${parts.tag}]`]),
    ...(parts.inline === true && parts.returns.length > 0
      ? [inlined(parts.purpose.text, parts.returns)]
      : [parts.purpose.text, ...parts.returns.map((each) => each.text)]),
    ...(parts.notes ?? []).map((note) => note.text),
  ].join(' ');
  assembled.set(text, parts);
  return text;
}

/** A sentence without its full stop. */
function open(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

/** A fact as a clause: its first letter lower-cased, its full stop gone. */
function clause(text: string): string {
  return `${text.charAt(0).toLowerCase()}${open(text).slice(1)}`;
}

/** The purpose continued by the facts: `Purpose: fact; fact.` */
function inlined(purposeText: string, returns: readonly ReturnsFact[]): string {
  return `${open(purposeText)}: ${returns.map((each) => clause(each.text)).join('; ')}.`;
}

/** The parts a description was assembled from; none for one written whole. */
export function partsOfDescription(
  description: string,
): DescriptionParts | undefined {
  return assembled.get(description);
}
