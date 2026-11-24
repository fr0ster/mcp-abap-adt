/**
 * A tool's description, assembled (plan step 10): its tag, its purpose —
 * the tool's function, in one sentence — and its usage notes; nothing else
 * (owner: a description is purely functional, its parameters in the schema).
 * No free text but the purpose sentence, no word of the answer's form.
 */

import type { Note } from './notes';
import type { Purpose } from './purpose';

/**
 * One value of a compact tool's action, operation or part, by its function
 * (plan step 10.4, compact descriptions): what the value does, a `Purpose` —
 * the full tool's it maps to where there is one.
 */
export interface ValueParts {
  readonly value: string;
  readonly purpose: Purpose;
}

/** The values of a compact tool's choosing parameter (`action`, `operation`, `part`), each by its function. */
export interface ValuesParts {
  /** The parameter the values are of: `action`. */
  readonly of: string;
  readonly each: readonly ValueParts[];
}

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
  /** A compact tool's choosing parameter, each value by its function. */
  readonly values?: ValuesParts | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** Every assembled description's parts, by its text: what the description tests read. */
const assembled = new Map<string, DescriptionParts>();

/** A tool's description: its tag, its purpose, its values' purposes, then its notes. */
export function toolDescription(parts: DescriptionParts): string {
  const text = [
    ...(parts.tag === undefined ? [] : [`[${parts.tag}]`]),
    parts.purpose.text,
    ...(parts.values?.each ?? []).map((value) =>
      valueText(parts.values?.of ?? '', value),
    ),
    ...(parts.notes ?? []).map((note) => note.text),
  ].join(' ');
  assembled.set(text, parts);
  return text;
}

/** A sentence without its full stop. */
function open(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

/** A sentence as a clause: its first letter lower-cased, unless a name in capitals opens it. */
function clause(text: string): string {
  // A sentence opening with a name in capitals (`SAP's`, `ABAP`) keeps it.
  const second = text.charAt(1);
  const first =
    second !== second.toLowerCase()
      ? text.charAt(0)
      : text.charAt(0).toLowerCase();
  return `${first}${open(text).slice(1)}`;
}

/** One value: `<of> <value>: <its purpose>.` */
function valueText(of: string, value: ValueParts): string {
  return `${of} ${value.value}: ${clause(value.purpose.text)}.`;
}

/** The parts a description was assembled from; none for one written whole. */
export function partsOfDescription(
  description: string,
): DescriptionParts | undefined {
  return assembled.get(description);
}
