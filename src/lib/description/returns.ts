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
  const omits = (reasons: Readonly<Record<string, string>> | undefined) =>
    Object.values(reasons ?? {}).map((reason) => stated(reason));
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
      return [stated(shape.reason)];
    case 'rows':
    case 'node':
      return [
        ...(about === undefined ? [] : [stated(about, shape.means)]),
        ...omits(shape.omits),
        ...below(shape.lists),
      ];
    case 'kinds':
      return [
        ...subject,
        ...shape.kinds.flatMap((kind: KindShape): Stated[] => {
          if ('omit' in kind) return [stated(kind.omit)];
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
      return [
        ...subject,
        ...('omits' in shape ? omits(shape.omits) : []),
        ...below(shape.lists),
      ];
    default:
      return [...subject, ...('omits' in shape ? omits(shape.omits) : [])];
  }
}

/**
 * The facts a tool's schemas give: its heads' (each a domain noun), then
 * each list's, in the order of its schemas (`shapesOf`, `jsonShapesOf`) —
 * terse's, then any medium adds. The facts of one subject are one fact,
 * every noun of it once, in the order first met.
 */
export function returnsOf(source: {
  readonly heads?: readonly HeadShape[] | undefined;
  readonly shapes: readonly (readonly ListShape[])[];
}): ReturnsFact[] {
  const seen = new Set<ListShape>();
  const all: Stated[] = [
    ...(source.heads ?? []).map((head) => stated(head.about)),
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
  return [...merged].map(([about, nouns]) =>
    fact(sentence(nouns.length === 0 ? about : `${about}: ${joined(nouns)}`)),
  );
}
