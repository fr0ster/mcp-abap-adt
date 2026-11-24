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
 * One value of a compact tool's action, operation or part, by its function
 * (plan step 10.4, compact descriptions): what the value does — a
 * `Purpose` — and the facts of what it gives back, the full tool's it maps
 * to where there is one.
 */
export interface ValueParts {
  readonly value: string;
  readonly purpose: Purpose;
  readonly returns: readonly ReturnsFact[];
}

/** The values of a compact tool's choosing parameter (`action`, `operation`, `part`), each by its function. */
export interface ValuesParts {
  /** The parameter the values are of: `action`. */
  readonly of: string;
  readonly each: readonly ValueParts[];
}

/** Only this module mints the members a compact tool takes. */
const membersMinted: unique symbol = Symbol('members');

/**
 * The members a compact tool's `object_type` (or `target_type`) takes, each
 * with the arguments it needs — rendered from the typed member tables of
 * `src/lib/compact/compactDescriptions.ts`, the members a variant serves
 * alone; made only by {@link membersTaken}.
 */
export class Members {
  readonly #members = true;

  constructor(
    token: typeof membersMinted,
    readonly of: string,
    readonly tokens: readonly string[],
  ) {
    void token;
    void this.#members;
  }

  /** `object_type required: A(a*), B(b*).`, `of` naming the parameter and whether it is required. */
  get text(): string {
    return `${this.of}: ${this.tokens.join(', ')}.`;
  }
}

/** The members `of` (`object_type required`) takes, each as its token names it. */
export function membersTaken(of: string, tokens: readonly string[]): Members {
  return new Members(membersMinted, of, tokens);
}

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
  /** A compact tool's choosing parameter, each value by its function. */
  readonly values?: ValuesParts | undefined;
  /** The members a compact tool's object type takes. */
  readonly members?: Members | undefined;
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
    ...(parts.values?.each ?? []).map((value) =>
      valueText(parts.values?.of ?? '', value),
    ),
    ...(parts.members === undefined ? [] : [parts.members.text]),
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
  // A sentence opening with a name in capitals (`SAP's`, `ABAP`) keeps it.
  const second = text.charAt(1);
  const first =
    second !== second.toLowerCase()
      ? text.charAt(0)
      : text.charAt(0).toLowerCase();
  return `${first}${open(text).slice(1)}`;
}

/** The purpose continued by the facts: `Purpose: fact; fact.` */
function inlined(purposeText: string, returns: readonly ReturnsFact[]): string {
  return `${open(purposeText)}: ${returns.map((each) => clause(each.text)).join('; ')}.`;
}

/** One value: `<of> <value>: <its purpose>: <its facts>.` */
function valueText(of: string, value: ValueParts): string {
  const head = `${of} ${value.value}: ${clause(value.purpose.text)}`;
  return value.returns.length === 0
    ? `${head}.`
    : `${head}: ${value.returns.map((each) => clause(each.text)).join('; ')}.`;
}

/** The parts a description was assembled from; none for one written whole. */
export function partsOfDescription(
  description: string,
): DescriptionParts | undefined {
  return assembled.get(description);
}
