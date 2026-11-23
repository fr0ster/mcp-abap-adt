/**
 * Completeness by construction (plan step 9): a terse list is written from
 * the reading's own lists — one row (or mark line) per item, every cell
 * from that item — by the writer, never by a formatter that chooses its
 * items.
 *
 * - `RowSchemas<R>` has one required key for every list member of the
 *   reading `R`, each bound to that same key (`Bound<R, K>`): a list of the
 *   reading left without a schema, or a schema bound to another list, does
 *   not compile.
 * - A schema reads its list from the reading by its key (`rows`, `marks`,
 *   `sections`, `kinds`), so nothing stands between the reading and its
 *   rows to drop one; the writer writes every item it holds.
 */

import { type Line, Written } from './complete';

/** One column: its name, and the cell of one item. */
export interface Column<I> {
  readonly name: string;
  readonly cell: (item: I) => string;
}

/** A head line: `# head value` (or `# head`), no item. */
export interface Head {
  readonly head: string;
  readonly value?: string | undefined;
}

/** The list members of `R`: every member whose value is an array (or absent). */
export type ListKeys<R> = {
  [K in keyof R]-?: NonNullable<R[K]> extends readonly unknown[] ? K : never;
}[keyof R];

/** A schema bound to the list `K` of a reading `R`: the lines of every item it holds. */
export interface Bound<R, K> {
  readonly key: K;
  readonly write: (reading: R, depth: number | undefined) => Line[];
}

/**
 * One schema for every list of `R`, each bound to its own key, written in
 * the order of the record: a list without one is a compile error.
 */
export type RowSchemas<R> = { readonly [K in ListKeys<R>]: Bound<R, K> };

/** A value holding the list `K` of items `I`: what a schema of that list reads. */
type Holding<K extends string, I> = {
  readonly [P in K]?: readonly I[] | undefined;
};

/**
 * A group line written before the rows sharing a value: `run` when the
 * value changes from one item to the next (an inner group starts again
 * when an outer one does), `gathered` collecting every item of a value
 * under one line, in the order the values first appear. `unless` names a
 * value written without its line.
 */
export interface Group<I> {
  readonly label: string;
  readonly of: (item: I) => string;
  readonly mode: 'run' | 'gathered';
  readonly unless?: string | undefined;
}

/**
 * Rows of one list: one per item, its cells from `columns`. The header —
 * the columns' names — is written before the list's first line: `always`
 * (whenever the list is present, empty too), only `when-rows`, or `none`;
 * an absent list writes nothing. In a tree each row is indented by its depth
 * and the item's own lists (`lists`) follow it, one level deeper.
 */
export interface RowSpec<I> {
  readonly columns: readonly Column<I>[];
  readonly header: 'always' | 'when-rows' | 'none';
  readonly groups?: readonly Group<I>[] | undefined;
  readonly lists?: RowSchemas<I> | undefined;
}

/** The items of the list `key` of a reading. */
function itemsOf<K extends string, I>(
  reading: Holding<K, I>,
  key: K,
): readonly I[] {
  return reading[key] ?? [];
}

/** The list `key` written as rows, one per item. */
export function rows<I, K extends string>(
  key: K,
  spec: RowSpec<I>,
): Bound<Holding<K, I>, K> {
  return {
    key,
    // An absent list writes nothing, its header neither; an empty one its
    // header where the spec asks for it.
    write: (reading, depth) => {
      const list = reading[key];
      return list === undefined ? [] : rowLines(list, spec, depth);
    },
  };
}

/** The list `key` written as mark lines, `# mark words…`, one per item. */
export function marks<I, K extends string>(
  key: K,
  mark: string,
  words: (item: I) => readonly string[],
): Bound<Holding<K, I>, K> {
  return {
    key,
    write: (reading) =>
      itemsOf(reading, key).map((item): Line => ({ mark, words: words(item) })),
  };
}

/** The list `key` written as sections: per item its head lines, then its own lists. */
export function sections<I, K extends string>(
  key: K,
  heads: (item: I) => readonly Head[],
  lists: RowSchemas<I>,
): Bound<Holding<K, I>, K> {
  return {
    key,
    write: (reading, depth) =>
      itemsOf(reading, key).flatMap((item): Line[] => [
        ...heads(item),
        ...listLines(item, lists, depth),
      ]),
  };
}

/** How one item of a list of several kinds is written: a row, a mark line, or a section. */
export type KindSpec<I> =
  | { readonly row: RowSpec<I> }
  | { readonly mark: string; readonly words: (item: I) => readonly string[] }
  | {
      readonly heads: (item: I) => readonly Head[];
      readonly lists: RowSchemas<I>;
    };

/**
 * The list `key` of items of several kinds: each item written by its
 * kind's spec — one for every kind, by the record's type. A header is
 * written once, before the first item, when a row kind asks for it.
 */
export function kinds<I, K extends string, T extends string>(
  key: K,
  kind: (item: I) => T,
  specs: { readonly [P in T]: KindSpec<I> },
  header?: readonly string[] | undefined,
): Bound<Holding<K, I>, K> {
  return {
    key,
    write: (reading, depth) => {
      const items = itemsOf(reading, key);
      const lines: Line[] = header === undefined ? [] : [{ header }];
      for (const item of items) {
        const spec: KindSpec<I> = specs[kind(item)];
        if ('row' in spec) {
          lines.push(
            ...rowLines([item], { ...spec.row, header: 'none' }, depth),
          );
        } else if ('mark' in spec) {
          lines.push({ mark: spec.mark, words: spec.words(item) });
        } else {
          lines.push(
            ...spec.heads(item),
            ...listLines(item, spec.lists, depth),
          );
        }
      }
      return lines;
    },
  };
}

/** The lines of every list of `value`, in its schemas' order. */
function listLines<R>(
  value: R,
  schemas: RowSchemas<R>,
  depth: number | undefined,
): Line[] {
  const bound: readonly Bound<R, ListKeys<R>>[] =
    Object.values<Bound<R, ListKeys<R>>>(schemas);
  return bound.flatMap((schema) => schema.write(value, depth));
}

/** Rows, with their header, group lines and each item's own lists. */
function rowLines<I>(
  items: readonly I[],
  spec: RowSpec<I>,
  depth: number | undefined,
): Line[] {
  const lines: Line[] = [];
  if (
    spec.header === 'always' ||
    (spec.header === 'when-rows' && items.length > 0)
  ) {
    lines.push({ header: spec.columns.map((column) => column.name) });
  }
  const rowOf = (item: I): Line[] => [
    depth === undefined
      ? { row: spec.columns.map((column) => column.cell(item)) }
      : { row: spec.columns.map((column) => column.cell(item)), depth },
    ...(spec.lists === undefined
      ? []
      : listLines(
          item,
          spec.lists,
          depth === undefined ? undefined : depth + 1,
        )),
  ];
  const groups = spec.groups ?? [];
  const first = groups[0];
  if (first !== undefined && first.mode === 'gathered') {
    // Every item of a value under one line, in first-appearance order.
    const gathered = new Map<string, I[]>();
    for (const item of items) {
      const value = first.of(item);
      const members = gathered.get(value) ?? [];
      members.push(item);
      gathered.set(value, members);
    }
    for (const [value, members] of gathered) {
      if (value !== first.unless) lines.push({ group: first.label, value });
      lines.push(...members.flatMap(rowOf));
    }
    return lines;
  }
  // Runs: a group line when its value changes; an inner group starts again
  // whenever an outer one does.
  const current: (string | undefined)[] = groups.map(() => undefined);
  for (const item of items) {
    groups.forEach((group, level) => {
      const value = group.of(item);
      if (value === current[level]) return;
      current[level] = value;
      for (let inner = level + 1; inner < groups.length; inner += 1) {
        current[inner] = undefined;
      }
      if (value !== group.unless) lines.push({ head: group.label, value });
    });
    lines.push(...rowOf(item));
  }
  return lines;
}

/** A tree's root row: the reading's own node, written as a row and no item. */
export interface Root<R> {
  readonly cells: (reading: R) => readonly string[];
}

/** What a listing writes: its heads, the reading, and a schema for each of its lists. */
export interface Listing<R> {
  readonly heads: readonly Head[];
  readonly reading: R;
  readonly lists: RowSchemas<R>;
  /** A tree's root row before the lists, at depth 0; its lists then one level deeper. */
  readonly root?: Root<R> | undefined;
}

/**
 * The only writer of a terse list: the heads, a tree's root row, then
 * every list of the reading through its schema — each item one row or one
 * mark line, nothing chosen by the caller.
 */
export function writeListing<R>(listing: Listing<R>): Written<string> {
  const lines: Line[] = [...listing.heads];
  if (listing.root !== undefined) {
    lines.push({ root: listing.root.cells(listing.reading), depth: 0 });
  }
  lines.push(
    ...listLines(
      listing.reading,
      listing.lists,
      listing.root === undefined ? undefined : 1,
    ),
  );
  return Written.text(lines, []);
}

/** A JSON schema bound to the list `K` of a reading `R`: one entry per item it holds, or nothing when it is absent. */
export interface JsonBound<R, K> {
  readonly key: K;
  /** The member the entries are written under in the answer. */
  readonly as: string;
  readonly write: (reading: R) => readonly object[] | undefined;
}

/** One JSON schema for every list of `R`, each bound to its own key: a list without one is a compile error. */
export type JsonSchemas<R> = { readonly [K in ListKeys<R>]: JsonBound<R, K> };

/**
 * The list `key` written as JSON entries, one per item: the item's own
 * members from `entry`, then its own lists (`lists`), each under its name.
 * An absent list writes no member; an empty one, `[]`.
 */
export function entries<I, K extends string>(
  key: K,
  entry: (item: I) => object,
  options?: {
    readonly as?: string | undefined;
    readonly lists?: JsonSchemas<I> | undefined;
  },
): JsonBound<Holding<K, I>, K> {
  return {
    key,
    as: options?.as ?? key,
    write: (reading) => {
      const list = reading[key];
      if (list === undefined) return undefined;
      return list.map((item) =>
        options?.lists === undefined
          ? entry(item)
          : { ...entry(item), ...jsonMembers(item, options.lists) },
      );
    },
  };
}

/** Every list of `value` as its JSON member, in its schemas' order; an absent one writes none. */
function jsonMembers<R>(
  value: R,
  schemas: JsonSchemas<R>,
): Record<string, readonly object[]> {
  const members: Record<string, readonly object[]> = {};
  const bound: readonly JsonBound<R, ListKeys<R>>[] =
    Object.values<JsonBound<R, ListKeys<R>>>(schemas);
  for (const schema of bound) {
    const written = schema.write(value);
    if (written !== undefined) members[schema.as] = written;
  }
  return members;
}

/**
 * The only writer of a JSON list answer: `rest`, then every list of the
 * reading as its member — each item one entry, nothing chosen by the
 * caller — then `after`. The lists are written again after `after`, so
 * none of its keys can replace them.
 */
export function writeJson<R, A extends object, B extends object>(
  rest: A,
  reading: R,
  lists: JsonSchemas<R>,
  after?: B | undefined,
): Written<A & Partial<B> & Record<string, readonly object[]>> {
  const members = jsonMembers(reading, lists);
  return Written.answerOf({ ...rest, ...members, ...after, ...members });
}

/** The only writer of a JSON array answer: one entry per item of the reading's list. */
export function writeJsonList<R, K extends ListKeys<R>>(
  reading: R,
  list: JsonBound<R, K>,
): Written<readonly object[]> {
  return Written.answerOf(list.write(reading) ?? []);
}
