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

/** One fact of what a tool gives back; only this module's factories make one. */
export interface ReturnsFact {
  readonly [minted]: true;
  readonly text: string;
}

function fact(text: string): ReturnsFact {
  return { [minted]: true, text };
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

/** The facts of one list, then of its items' own lists. */
function listFacts(shape: ListShape, seen: Set<object>): ReturnsFact[] {
  const omits = (reasons: Readonly<Record<string, string>> | undefined) =>
    Object.values(reasons ?? {}).map((reason) => fact(sentence(reason)));
  const below = (lists: () => readonly ListShape[]): ReturnsFact[] =>
    lists().flatMap((child) => {
      // A tree's lists name themselves: each list is stated once.
      if (seen.has(child)) return [];
      seen.add(child);
      return listFacts(child, seen);
    });
  const about = shape.about;
  switch (shape.kind) {
    case 'omitted':
      return [fact(sentence(shape.reason))];
    case 'rows':
    case 'node': {
      const means = shape.means.flatMap((noun) =>
        noun === undefined ? [] : [noun],
      );
      return [
        ...(about === undefined
          ? []
          : [
              fact(
                sentence(
                  means.length === 0 ? about : `${about}: ${joined(means)}`,
                ),
              ),
            ]),
        ...omits(shape.omits),
        ...below(shape.lists),
      ];
    }
    case 'kinds':
      return [
        ...(about === undefined ? [] : [fact(sentence(about))]),
        ...shape.kinds.flatMap((kind: KindShape) =>
          'omit' in kind
            ? [fact(sentence(kind.omit))]
            : 'lists' in kind
              ? below(kind.lists)
              : [],
        ),
      ];
    case 'bullets':
    case 'sections':
    case 'within':
    case 'entries':
    case 'member':
      return [
        ...(about === undefined ? [] : [fact(sentence(about))]),
        ...('omits' in shape ? omits(shape.omits) : []),
        ...below(shape.lists),
      ];
    default:
      return [
        ...(about === undefined ? [] : [fact(sentence(about))]),
        ...('omits' in shape ? omits(shape.omits) : []),
      ];
  }
}

/**
 * The facts a tool's schemas give: its heads' (each a domain noun), then
 * each list's, in the order of its schemas (`shapesOf`, `jsonShapesOf`) —
 * terse's, then any medium adds — each fact once.
 */
export function returnsOf(source: {
  readonly heads?: readonly HeadShape[] | undefined;
  readonly shapes: readonly (readonly ListShape[])[];
}): ReturnsFact[] {
  const seen = new Set<ListShape>();
  const facts = [
    ...(source.heads ?? []).map((head) => fact(sentence(head.about))),
    ...source.shapes.flat().flatMap((shape) => {
      if (seen.has(shape)) return [];
      seen.add(shape);
      return listFacts(shape, seen);
    }),
  ];
  const once = new Set<string>();
  return facts.filter((each) => {
    if (once.has(each.text)) return false;
    once.add(each.text);
    return true;
  });
}
