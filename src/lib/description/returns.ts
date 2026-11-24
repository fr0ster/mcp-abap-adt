/**
 * What information a tool gives back, as facts generated from its writers'
 * schemas (`src/lib/detail/listing.ts`): each list's domain noun (`about`)
 * and each column's (`means`) — never the answer's form, which the `detail`
 * parameter's shared text alone describes. A fact is made only here, so no
 * free words reach a description's Returns.
 */

import type { HeadShape, KindShape, ListShape } from '../detail';

/** Only this module mints a fact. */
const minted: unique symbol = Symbol('returns fact');

/**
 * One fact of what a tool gives back; only this module's factories make one
 * — nominal, so no spread of one with other words is a fact.
 */
export class ReturnsFact {
  readonly #fact = true;

  constructor(
    token: typeof minted,
    readonly text: string,
  ) {
    void token;
    void this.#fact;
  }
}

function fact(text: string): ReturnsFact {
  return new ReturnsFact(minted, text);
}

/** `text` with its first letter capitalised, ending with one full stop. */
function sentence(text: string): string {
  const trimmed = text.trim();
  const capital = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capital.endsWith('.') ? capital : `${capital}.`;
}

/** Words joined as a list: `a`, `a and b`, `a, b and c`. */
function joined(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * One fact before it is written: what it is about, and the nouns of what it
 * tells of it (none for a fact that is its subject alone). Facts of one
 * subject — a list at terse and at medium — are one fact, their nouns
 * joined.
 */
interface Stated {
  readonly about: string;
  readonly nouns: readonly string[];
}

const stated = (
  about: string,
  nouns: readonly (string | undefined)[] = [],
) => ({
  about,
  nouns: nouns.flatMap((noun) => (noun === undefined ? [] : [noun])),
});

/** What one list states, then its items' own lists. */
function listStated(shape: ListShape, seen: Set<object>): Stated[] {
  const below = (lists: () => readonly ListShape[]): Stated[] =>
    lists().flatMap((child) => {
      // A tree's lists name themselves: each list is stated once.
      if (seen.has(child)) return [];
      seen.add(child);
      return listStated(child, seen);
    });
  const about = shape.about;
  const subject = about === undefined ? [] : [stated(about)];
  switch (shape.kind) {
    case 'omitted':
      // A kind left out of an answer is stated by no fact: a description
      // says what comes back (owner, positive statements only). Its reason
      // stays in the schema, for reviewers.
      return [];
    case 'rows':
    case 'node':
      return [
        ...(about === undefined ? [] : [stated(about, shape.means)]),
        ...below(shape.lists),
      ];
    case 'kinds':
      return [
        ...subject,
        ...shape.kinds.flatMap((kind: KindShape): Stated[] => {
          if ('omit' in kind) return [];
          // A row kind's cells, by their nouns — headerless or not.
          return [
            ...('means' in kind && about !== undefined
              ? [stated(about, kind.means)]
              : []),
            ...('lists' in kind ? below(kind.lists) : []),
          ];
        }),
      ];
    case 'parts':
      // Each part's listing: what every declared variant writes, a tree's
      // root by the part's own noun.
      return [
        ...subject,
        ...shape.nested().flatMap((child): Stated[] => {
          if (seen.has(child)) return [];
          seen.add(child);
          return child.kind === 'node' && child.list === ''
            ? about === undefined
              ? []
              : [stated(`${about}, its root`, child.means)]
            : listStated(child, seen);
        }),
      ];
    case 'bullets':
    case 'sections':
    case 'within':
    case 'entries':
    case 'member':
      return [...subject, ...below(shape.lists)];
    default:
      return subject;
  }
}

/** Several subjects as one: `for each a and each b` when they share `for each`. */
function subjects(abouts: readonly string[]): string {
  const each = 'for each ';
  return abouts.length > 1 && abouts.every((about) => about.startsWith(each))
    ? `${each}${joined(abouts.map((about, i) => (i === 0 ? about.slice(each.length) : `each ${about.slice(each.length)}`)))}`
    : joined(abouts);
}

/**
 * The facts a tool's schemas give: its heads' (each a domain noun), then
 * each list's, in the order of its schemas (`shapesOf`, `jsonShapesOf`) —
 * terse's, then any medium adds. The facts of one subject are one fact,
 * every noun of it once, in the order first met.
 */
export function returnsOf(source: {
  readonly heads?: readonly HeadShape[] | undefined;
  /**
   * Whose facts the heads tell (`the package's`): the heads are then one
   * sentence, their nouns joined under it (the item itself, compact).
   */
  readonly of?: string | undefined;
  /** What follows the heads' nouns in that sentence (`SAP proposes`). */
  readonly by?: string | undefined;
  readonly shapes: readonly (readonly ListShape[])[];
}): ReturnsFact[] {
  const seen = new Set<ListShape>();
  const all: Stated[] = [
    ...(source.of === undefined && source.by === undefined
      ? (source.heads ?? []).map((head) => stated(head.about))
      : source.heads === undefined || source.heads.length === 0
        ? []
        : [
            stated(
              [
                ...(source.of === undefined ? [] : [source.of]),
                joined(source.heads.map((head) => head.about)),
                ...(source.by === undefined ? [] : [source.by]),
              ].join(' '),
            ),
          ]),
    ...source.shapes.flat().flatMap((shape) => {
      if (seen.has(shape)) return [];
      seen.add(shape);
      return listStated(shape, seen);
    }),
  ];
  const merged = new Map<string, string[]>();
  for (const each of all) {
    const nouns = merged.get(each.about) ?? [];
    for (const noun of each.nouns) if (!nouns.includes(noun)) nouns.push(noun);
    merged.set(each.about, nouns);
  }
  // Subjects stating the same nouns are one sentence (no sentence repeats):
  // `for each staged file and each ignored file: …`.
  const bySame = new Map<string, { abouts: string[]; nouns: string[] }>();
  for (const [about, nouns] of merged) {
    const key = nouns.length === 0 ? `\u0000${about}` : nouns.join('\u0000');
    const entry = bySame.get(key) ?? { abouts: [], nouns };
    entry.abouts.push(about);
    bySame.set(key, entry);
  }
  return [...bySame.values()].map(({ abouts, nouns }) => {
    const about = subjects(abouts);
    return fact(
      sentence(nouns.length === 0 ? about : `${about}: ${joined(nouns)}`),
    );
  });
}

/**
 * The fixed fact of a tool whose answer is SAP's data with no typed reading
 * of ours (plan step 10.6, "No typed result"): stated until the answer is
 * typed, in place of free words.
 */
export const sapData: ReturnsFact = fact("SAP's data as it came.");

/** The element type of a list member, `never` for any other. */
type ElementOf<V> = NonNullable<V> extends readonly (infer I)[] ? I : never;

/**
 * How one member of a typed result is stated: its domain noun (`'data
 * class'`, joined under `its`), a whole clause (`{ clause: 'whether it is
 * published' }`), the nouns of each item of a list member, or `null` for a
 * member that tells nothing of its own (`success`, the name the call gave).
 */
export type MemberNoun<V> =
  | string
  | null
  | { readonly clause: string }
  | ([ElementOf<V>] extends [never]
      ? never
      : ElementOf<V> extends object
        ? EachNouns<ElementOf<V>>
        : never);

/**
 * A noun for every member of a reader's typed result `T`, keyed on its
 * members: a member the type gains and the nouns lack does not compile.
 */
export type MemberNouns<T> = {
  readonly [K in keyof T]-?: MemberNoun<T[K]>;
};

/** The nouns of each item of a list: what one item is (`BAdI definition`), and its members'. */
export interface EachNouns<I> {
  readonly each: string;
  readonly nouns: MemberNouns<I>;
}

/**
 * What leads an item's sentence: `each` (`for each object: its …`), or the
 * words `of` in place of `its` (`for each version: its ID, …`, `the
 * source`), or `its` alone before the first noun.
 */
interface Lead {
  readonly each?: string | undefined;
  readonly of?: string | undefined;
}

/** One sentence of an item's members, then one per list member, nested lists after their own. */
function membersStated<T>(lead: Lead, nouns: MemberNouns<T>): string[] {
  const plain: string[] = [];
  const clauses: string[] = [];
  const lists: string[] = [];
  for (const key in nouns) {
    const noun: MemberNoun<T[typeof key]> = nouns[key];
    if (noun === null) continue;
    if (typeof noun === 'string') plain.push(noun);
    else if ('clause' in noun) clauses.push(noun.clause);
    else lists.push(...membersStated({ each: noun.each }, noun.nouns));
  }
  const told = [
    ...plain.map((noun, i) =>
      i === 0 && lead.of === undefined ? `its ${noun}` : noun,
    ),
    ...clauses,
  ];
  const own =
    told.length === 0
      ? []
      : [
          lead.of !== undefined
            ? `${lead.of} ${joined(told)}`
            : lead.each === undefined
              ? joined(told)
              : `for each ${lead.each}: ${joined(told)}`,
        ];
  return [...own, ...lists];
}

/**
 * The facts of a reader's typed result, each member by its domain noun
 * (plan step 10.6, metadata readers): one sentence of the item's own
 * members (`its data class, size category and buffering`), then one per
 * list member (`for each BAdI definition: its name and short text`). With
 * `each`, the item is itself one of several (`for each object: …`); with
 * `of`, those words lead the sentence in place of `its` (`for each
 * version:`, `the`, `with a range asked,`).
 */
export function membersOf<T>(
  source:
    | {
        readonly each?: string | undefined;
        readonly of?: undefined;
        readonly nouns: MemberNouns<T>;
      }
    | {
        readonly each?: undefined;
        readonly of: string;
        readonly nouns: MemberNouns<T>;
      },
): ReturnsFact[] {
  return membersStated(source, source.nouns).map((text) =>
    fact(sentence(text)),
  );
}

// ---------------------------------------------------------------------------
// The facts of a typed result (plan step 10.6): a tool not on the writers
// states what its answer type holds, each member by its domain noun.
// ---------------------------------------------------------------------------

/** Every member of a result type, over each variant of a union. */
type MemberOf<T> = T extends unknown ? keyof T : never;

/** A member's value, over every variant that holds it. */
type ValueOf<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/** What a member is stated by: a list of objects by its own nouns, any other value by a noun. */
type NounOf<V> =
  NonNullable<V> extends readonly (infer E)[]
    ? E extends object
      ? ListNouns<E>
      : string
    : string;

/**
 * The domain noun of every member of the result type `T`: each member named,
 * none more — a member added to the type and not here does not compile. A
 * list of objects is stated by {@link listOf}: its subject and its element's
 * nouns.
 */
export type ResultNouns<T> = {
  readonly [K in MemberOf<T>]-?: NounOf<ValueOf<T, K>>;
};

/** A list member of a result, by its words: its subject, its element's nouns, its own lists. */
export class ListFacts {
  constructor(
    token: typeof minted,
    readonly about: string,
    readonly own: readonly string[],
    readonly lists: readonly ListFacts[],
  ) {
    void token;
  }
}

/** A list member of a result whose element is `E`: made by {@link listOf}. */
export class ListNouns<E> extends ListFacts {
  /** Ties the nouns to their element type: phantom, never set. */
  declare private readonly element?: (element: E) => E;
}

/** The nouns of a member record: its own, and its lists'. */
function nounsOf<N extends { readonly [K in keyof N]: string | ListFacts }>(
  nouns: N,
): {
  own: string[];
  lists: ListFacts[];
} {
  const own: string[] = [];
  const lists: ListFacts[] = [];
  for (const key in nouns) {
    const noun: string | ListFacts = nouns[key];
    if (typeof noun === 'string') own.push(noun);
    else lists.push(noun);
  }
  return { own, lists };
}

/** A list member: `about` its subject (`for each message`), its element's nouns. */
export function listOf<E>(about: string, nouns: ResultNouns<E>): ListNouns<E> {
  const { own, lists } = nounsOf(nouns);
  return new ListNouns<E>(minted, about, own, lists);
}

/** What a typed result holds, by its members' nouns: made by {@link resultShape}. */
export class ResultShape {
  constructor(
    token: typeof minted,
    readonly own: readonly string[],
    readonly lists: readonly ListFacts[],
  ) {
    void token;
  }
}

/** The shape of the result type `T`, every member by its domain noun. */
export function resultShape<T>(nouns: ResultNouns<T>): ResultShape {
  const { own, lists } = nounsOf(nouns);
  return new ResultShape(minted, own, lists);
}

/** One fact per list, its subject before its element's nouns; then its own lists. */
function listFacts(list: ListFacts): ReturnsFact[] {
  return [
    fact(sentence(`${list.about}: ${joined(list.own)}`)),
    ...list.lists.flatMap(listFacts),
  ];
}

/**
 * The facts of a typed result: its own members' nouns as one sentence
 * (after `of`, when given), then one sentence per list.
 */
export function resultReturns(
  shape: ResultShape,
  of?: string | undefined,
): ReturnsFact[] {
  return [
    ...(shape.own.length === 0
      ? []
      : [
          fact(
            sentence(
              of === undefined
                ? joined(shape.own)
                : `${of} ${joined(shape.own)}`,
            ),
          ),
        ]),
    ...shape.lists.flatMap(listFacts),
  ];
}

/**
 * The one fact of a tool whose answer is SAP's data as it came, without a
 * result type of ours (plan step 10.6, "No typed result").
 */
export function untypedReturns(): ReturnsFact[] {
  return [fact("SAP's data as it came.")];
}
