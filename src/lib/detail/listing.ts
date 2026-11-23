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

import { type Line, renderLines } from './complete';
import type { DetailLevel, ListAnswerTable } from './levels';

/** Only this module mints a written answer. */
const mint: unique symbol = Symbol('written');

/**
 * An answer a listing writer wrote from the reading's own lists, complete
 * by construction. Only the writers below make one: its constructor takes
 * a token this module does not export.
 */
export class Written<A> {
  /** Makes the type nominal: a plain `{ answer }` is no written answer. */
  readonly #written = true;

  constructor(
    token: typeof mint,
    readonly answer: A,
  ) {
    void token;
    void this.#written;
  }
}

/**
 * A reading passed whole, unchanged — complete by construction (the
 * medium of a tool whose reading is its answer): typed as the reading
 * itself, no reshaping. A reading is an object: a string or a number is
 * no reading, so it is never a written answer.
 */
export function writeWhole<R extends object>(reading: R): Written<R> {
  return new Written(mint, reading);
}

/**
 * One column: its name, and the cell of one item. `when` writes the cell
 * only for the items it holds for (a tree row's technical name and URI of
 * an object SAP listed without a name).
 */
export interface Column<I> {
  readonly name: string;
  /**
   * What the cell tells, in domain words (`its type`, `its package`): what a
   * tool's description names of the column — never its name or its form.
   */
  readonly means?: string | undefined;
  readonly cell: (item: I) => string;
  readonly when?: ((item: I) => boolean) | undefined;
}

/** The cells of one item: every column's, but one whose `when` does not hold. */
function cellsOf<I>(columns: readonly Column<I>[], item: I): string[] {
  return columns
    .filter((column) => column.when === undefined || column.when(item))
    .map((column) => column.cell(item));
}

/** A head line: `# head value` (or `# head`), no item. */
export interface Head {
  readonly head: string;
  readonly value?: string | undefined;
}

/** Only this module mints a head's shape. */
const headShaped: unique symbol = Symbol('head shape');

/**
 * A head a listing writes, as data: its label, and what it tells in domain
 * words — what a tool's description says of it. Only `headShape` makes one.
 */
export interface HeadShape {
  readonly [headShaped]: true;
  readonly label: string;
  readonly about: string;
}

/** The shape of the head `label`, telling `about` (`the package read`). */
export function headShape(label: string, about: string): HeadShape {
  return { [headShaped]: true, label, about };
}

/** A mark line: `# mark words…`, each word a tab-separated cell. */
export interface Mark {
  readonly mark: string;
  readonly words: readonly string[];
}

/** A value that is no list and no object: what a list member may be beside its list. */
type Plain = string | number | boolean | bigint | symbol | null | undefined;

/** The list part of a member's type. */
type ListPart<T> = Extract<T, readonly unknown[]>;

/** The object part of a member's type: neither a list, a plain value nor a function. */
type ObjectPart<T> = Exclude<
  T,
  readonly unknown[] | Plain | ((...args: never[]) => unknown)
>;

/** A keyed collection a reading cannot hold: no schema writes one. */
type Collection = ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>;

/** `unknown` or `any`: a type that says nothing of its value. */
type Opaque<T> = 0 extends 1 & T ? true : unknown extends T ? true : false;

/** How deep the schema types look into a reading: far past any reading's own depth. */
type Deeper<D extends readonly unknown[]> = [...D, unknown];
type TooDeep<D extends readonly unknown[]> = D['length'] extends 8
  ? true
  : false;

/**
 * A member that may hold any JSON value (a parse, an answer's payload): one
 * value, written whole — its arrays are no lists of the reading. A typed
 * list (`X[] | false`) admits no string, so it is no such member.
 */
type AnyJson<T> = string | number | boolean | null extends T ? true : false;

/**
 * A member is a list when any part of its type is an array — `X[] | false`
 * included — unless it may hold any JSON value. An index signature is no
 * member here: a reading holding one whose values hold lists does not
 * compile (`RefusedAt`).
 */
type ArmListKeys<R> = {
  [K in keyof R]-?: string extends K
    ? never
    : number extends K
      ? never
      : AnyJson<R[K]> extends true
        ? never
        : [ListPart<R[K]>] extends [never]
          ? never
          : K;
}[keyof R];

/** A member holding an object with lists of its own, at any depth. */
type ArmNestedKeys<R, D extends readonly unknown[]> = {
  [K in keyof R]-?: string extends K
    ? never
    : number extends K
      ? never
      : AnyJson<R[K]> extends true
        ? never
        : [ObjectPart<R[K]>] extends [never]
          ? never
          : [SchemaKeysAt<ObjectPart<R[K]>, Deeper<D>>] extends [never]
            ? never
            : K;
}[keyof R];

/** The list members of `R`, on any arm of a union (an item that is itself a list has none: it is the list). */
export type ListKeys<R> = R extends Plain | readonly unknown[]
  ? never
  : R extends unknown
    ? ArmListKeys<R>
    : never;

/** The members of `R` holding an object with lists, at any depth, on any arm of a union. */
export type NestedKeys<R> = NestedKeysAt<R, []>;

type NestedKeysAt<R, D extends readonly unknown[]> =
  TooDeep<D> extends true
    ? never
    : R extends Plain | Collection | readonly unknown[]
      ? never
      : R extends unknown
        ? ArmNestedKeys<R, D>
        : never;

/** Every member of `R` a schema must account for: its lists and its objects holding lists, at any depth. */
export type SchemaKeys<R> = SchemaKeysAt<R, []>;

type SchemaKeysAt<R, D extends readonly unknown[]> =
  | ListKeys<R>
  | NestedKeysAt<R, D>;

/** What a schema of the member `K` of `R` writes: each item of its list, or its object. */
type ElementOf<R, K> = R extends unknown
  ? K extends keyof R
    ? ListPart<R[K]>[number] | ObjectPart<R[K]>
    : never
  : never;

/** The members of the element of `K` the schema of `K` must write in turn. */
export type Needed<R, K> = SchemaKeys<ElementOf<R, K>>;

/**
 * Whether `R` holds, at any depth, what no schema can write: a member typed
 * `unknown` or `any` (a reading is typed by its contract), a Map or a Set,
 * a member that may be any JSON value holding an array of items that are
 * not, a nesting past the depth cap (each type checked once on the way
 * down),
 * or an index signature whose values hold lists of anything but JSON data
 * (JSON data is written whole).
 */
type RefusedAt<R, D extends readonly unknown[]> =
  Opaque<R> extends true
    ? true
    : AnyJson<R> extends true
      ? // Any JSON value is one value — but an array in it of items that
        // are not themselves any JSON value is a list of the reading hidden
        // among scalars: refused.
        [ListPart<R>] extends [never]
        ? false
        : AnyJson<ListPart<R>[number]> extends true
          ? false
          : true
      : R extends unknown
        ? RefusedArm<R, D>
        : never;

/** Whether `A` and `B` are the very same type (not merely assignable). */
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Whether `R` is one of the types `D` met on the way down. */
type MetBefore<R, D extends readonly unknown[]> = D extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Same<R, Head> extends true
    ? true
    : MetBefore<R, Tail>
  : false;

/** `RefusedAt` of one arm of a union. */
type RefusedArm<R, D extends readonly unknown[]> =
  // The very type met again on the way down (a tree's node, a self
  // reference): checked where it was first met. By identity, never by a
  // structural subtype, so a narrower type is checked in its own right.
  MetBefore<R, D> extends true
    ? false
    : // Past the depth cap: no reading of a tool nests this deep, so a
      // reading that does is refused rather than left unchecked.
      TooDeep<D> extends true
      ? true
      : R extends Plain | ((...args: never[]) => unknown)
        ? false
        : R extends Collection
          ? true
          : R extends readonly (infer E)[]
            ? RefusedAt<E, D>
            : string extends keyof R
              ? AnyJson<R[string & keyof R]> extends true
                ? false
                : [ListPart<R[string & keyof R]>] extends [never]
                  ? RefusedAt<R[string & keyof R], [...D, R]>
                  : true
              : true extends {
                    [K in keyof R]-?: RefusedAt<R[K], [...D, R]>;
                  }[keyof R]
                ? true
                : false;

/**
 * An item JSON writes whole: every member a value JSON keeps — no function,
 * symbol or bigint, at any depth — so `JSON.stringify` writes all of it.
 */
type JsonSafe<I, D extends readonly unknown[] = []> =
  TooDeep<D> extends true
    ? true
    : I extends string | number | boolean | null | undefined
      ? true
      : I extends readonly (infer E)[]
        ? JsonSafe<E, Deeper<D>>
        : I extends (...args: never[]) => unknown
          ? false
          : I extends object
            ? false extends {
                [K in keyof I]-?: JsonSafe<I[K], Deeper<D>>;
              }[keyof I]
              ? false
              : true
            : false;

/**
 * A value written beside the lists (an entry's own members, an answer's
 * facts): one holding no list, so no list reaches the answer but through
 * its schema.
 */
type Listless<T> = T & ([SchemaKeys<T>] extends [never] ? unknown : never);

/** `T`, or `never` when the reading holds what no schema can write. */
export type Writable<R, T> = true extends (
  R extends readonly unknown[]
    ? true
    : false
)
  ? // A reading is an object holding its lists, never a list itself — on no
    // arm of a union: a list given as the reading has no member a schema
    // could be bound to.
    never
  : // A union is refused when any one of its arms is.
    true extends RefusedAt<R, []>
    ? never
    : T;

/**
 * What a schema writes, as data: the list it reads, how each item is written
 * (its columns, its mark, its kinds) and its items' own lists — read by the
 * description builder (`src/lib/description`), so a tool's description
 * states what its writer writes, and nothing else.
 */
export type ListShape = ShapeOf & {
  /** What the list holds, in domain words (`about`); none until stated. */
  readonly about?: string | undefined;
};

/** What each kind of schema writes, as data. */
type ShapeOf =
  | {
      readonly kind: 'rows' | 'node';
      readonly list: string;
      readonly columns: readonly string[];
      readonly means: readonly (string | undefined)[];
      /** The head labels it writes: its heading's, its groups'. */
      readonly heads: readonly string[];
      readonly tree: boolean;
      readonly omits: Readonly<Record<string, string>>;
      readonly lists: () => readonly ListShape[];
    }
  | {
      readonly kind: 'marks' | 'whole-marks';
      readonly list: string;
      readonly mark: string;
    }
  | { readonly kind: 'heads'; readonly list: string }
  | { readonly kind: 'omitted'; readonly list: string; readonly reason: string }
  | {
      readonly kind: 'bullets' | 'sections' | 'within';
      readonly list: string;
      readonly lists: () => readonly ListShape[];
    }
  | {
      readonly kind: 'kinds';
      readonly list: string;
      readonly discriminant: string;
      /** The header a row kind writes once, before the first item. */
      readonly header: readonly string[] | undefined;
      readonly kinds: readonly KindShape[];
    }
  | {
      readonly kind: 'parts';
      readonly list: string;
      readonly member?: string | undefined;
    }
  | {
      readonly kind: 'entries' | 'member';
      readonly list: string;
      readonly as: string;
      readonly omits?: Readonly<Record<string, string>> | undefined;
      readonly lists: () => readonly ListShape[];
    }
  | {
      readonly kind: 'values' | 'written-values' | 'whole-entries';
      readonly list: string;
      readonly as: string;
      readonly omits?: Readonly<Record<string, string>> | undefined;
    };

/** One kind of a list of several kinds, as data. */
export type KindShape =
  | {
      readonly kind: string;
      readonly row: readonly string[];
      readonly means: readonly (string | undefined)[];
      readonly lists: () => readonly ListShape[];
    }
  | { readonly kind: string; readonly omit: string }
  | { readonly kind: string; readonly mark: string }
  | { readonly kind: string; readonly lists: () => readonly ListShape[] };

/** A rows schema's shape: its columns, whether a tree, its left-out kinds and its items' lists. */
function rowsShape<I>(
  list: string,
  spec: RowSpec<I>,
  kind: 'rows' | 'node',
): ListShape {
  return {
    kind,
    list,
    columns: spec.columns.map((column) => column.name),
    means: spec.columns.map((column) => column.means),
    heads: [
      ...(spec.heading === undefined ? [] : [spec.heading.head]),
      ...(spec.groups ?? []).map((group) => group.label),
    ],
    tree: spec.tree === true || kind === 'node',
    omits: spec.omit?.reasons ?? {},
    lists: () => rowShapes(spec.lists),
  };
}

/** A kinds schema's shape: each kind with how it is written. */
function kindsShape<I>(
  list: string,
  discriminant: PropertyKey,
  table: Readonly<Record<string, KindSpec<I, never> | undefined>>,
  header: readonly string[] | undefined,
): ListShape {
  return {
    kind: 'kinds',
    list,
    discriminant: String(discriminant),
    header,
    kinds: Object.entries(table).flatMap(([kind, spec]): KindShape[] =>
      spec === undefined
        ? []
        : 'omit' in spec
          ? [{ kind, omit: spec.omit }]
          : 'row' in spec
            ? [
                {
                  kind,
                  row: spec.row.columns.map((column) => column.name),
                  means: spec.row.columns.map((column) => column.means),
                  lists: () => rowShapes(spec.row.lists),
                },
              ]
            : 'mark' in spec
              ? [{ kind, mark: spec.mark }]
              : [{ kind, lists: () => rowShapes(spec.lists) }],
    ),
  };
}

/** Only this module mints a binding. */
const binding: unique symbol = Symbol('binding');

/**
 * A schema with what its list holds, in domain words (`each object`, `the
 * objects SAP could not load`): what a tool's description says of the list
 * — never its form. The schema is otherwise the one given.
 */
export function about<B extends { readonly shape: ListShape }>(
  noun: string,
  schema: B,
): B {
  return { ...schema, shape: { ...schema.shape, about: noun } };
}

/**
 * A schema bound to the member `K` of a reading `R`; only this module's
 * factories make one. `covers` names the members of each item it writes
 * through schemas of their own (a phantom, never set): a schema is taken
 * for a list only when it covers every member its items hold lists in.
 */
export interface Bound<R, K, C extends PropertyKey = never> {
  readonly [binding]: true;
  readonly key: K;
  /** What it writes, as data: what a tool's description states of the list. */
  readonly shape: ListShape;
  readonly write: (reading: R, depth: number | undefined) => Line[];
  readonly covers?: ((members: C) => void) | undefined;
}

/**
 * One schema for every list of `R` — on any arm of a union, `X[] | false`
 * included — and for every member holding an object with lists of its
 * own at any depth (`within`), each bound to its own key and covering
 * every list its items hold, written in the order of the record: a member
 * without one is a compile error. A reading holding, at any depth, a
 * member typed `unknown`, a Map, a Set or an index signature of lists has
 * no schemas at all, so it does not compile.
 */
export type RowSchemas<R> = Writable<
  R,
  {
    readonly [K in SchemaKeys<R>]: Bound<R, K, Needed<R, K>>;
  }
>;

/** A value holding the list `K` of items `I`: what a schema of that list reads. */
type Holding<K extends string, I> = {
  readonly [P in K]?: readonly I[] | Plain;
};

/** A value holding the object `K` of type `O`: what a nested schema reads. */
type HoldingObject<K extends string, O> = {
  readonly [P in K]?: O | undefined;
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
export type RowSpec<I> = RowSpecBase<I> & ChildLists<I>;

/**
 * An item's own lists: required when it holds any (a tree item's
 * children), absent when it holds none.
 */
export type ChildLists<I> = [SchemaKeys<I>] extends [never]
  ? { readonly lists?: undefined }
  : { readonly lists: RowSchemas<I> };

/** What a row spec states beside an item's own lists. */
export interface RowSpecBase<I> {
  readonly columns: readonly Column<I>[];
  readonly header: 'always' | 'when-rows' | 'none';
  /**
   * A head line naming the list, written before it whenever the list is
   * present — an empty one too (`# list staged`): one list among several of
   * the same items.
   */
  readonly heading?: Head | undefined;
  readonly groups?: readonly Group<I>[] | undefined;
  /** The list is a tree's top: its rows at depth 0, their own lists one level deeper each. */
  readonly tree?: boolean | undefined;
  /**
   * Kinds of item the answer's approved shape leaves out by definition
   * (`omitting`): each item is still visited, its kind read, and only an
   * item of a kind named here — with the reason — writes no row.
   */
  readonly omit?: Omitting<I> | undefined;
}

/** Kinds of item a list's rows leave out, each named with its reason. */
export interface Omitting<I> {
  readonly omits: (item: I) => boolean;
  readonly reasons: Readonly<Record<string, string>>;
}

/**
 * Items of the kinds named left out of a list's rows, by definition of the
 * answer's shape: `kind` reads every item's kind, `omitted` names each
 * kind left out and why — a kind not named is written.
 */
export function omitting<I, K extends string>(
  kind: (item: I) => K,
  omitted: { readonly [P in K]?: string },
): Omitting<I> {
  const reasons: Record<string, string> = {};
  for (const [kindName, reason] of Object.entries<string | undefined>(
    omitted,
  )) {
    if (reason !== undefined) reasons[kindName] = reason;
  }
  return {
    omits: (item) => reasons[kind(item)] !== undefined,
    reasons,
  };
}

/** The items of the list `key` of a reading. */
function itemsOf<K extends string, I>(
  reading: Holding<K, I>,
  key: K,
): readonly I[] {
  const list = reading[key];
  return typeof list === 'object' && list !== null ? list : [];
}

/** Whether the list `key` of a reading is present: an array, not a plain value. */
function present<K extends string, I>(reading: Holding<K, I>, key: K): boolean {
  const list = reading[key];
  return typeof list === 'object' && list !== null;
}

/** The list `key` written as rows, one per item. */
export function rows<I, K extends string>(
  key: K,
  spec: RowSpec<I>,
): Bound<Holding<K, I>, K, SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: rowsShape(key, spec, 'rows'),
    // An absent list writes nothing, its header neither; an empty one its
    // header where the spec asks for it.
    write: (reading, depth) =>
      present(reading, key)
        ? [
            ...(spec.heading === undefined ? [] : [spec.heading]),
            ...rowLines(itemsOf(reading, key), spec, depth),
          ]
        : [],
  };
}

/**
 * The list `key` left out of the text whole, by definition of the answer's
 * approved shape (a component's links at terse: each repeats the source the
 * `# source` line names) — its reason stated where the schemas are, so a
 * reviewer sees it; every item visited, none written.
 */
export function omitted<I, K extends string>(
  key: K,
  reason: string,
): Bound<Holding<K, I>, K, PropertyKey> & { readonly reason: string } {
  return {
    [binding]: true,
    key,
    shape: { kind: 'omitted', list: key, reason },
    reason,
    write: (reading) => {
      for (const _item of itemsOf(reading, key)) {
        // Visited: the shape writes no line for it.
      }
      return [];
    },
  };
}

/**
 * The list `key` written as a bullet tree, `- label` per item indented by
 * its depth, depth first: an item `synthetic` says is no node of the
 * reading (the object asked, which SAP did not send) is written as the
 * tree's root and is no item; its own lists one level deeper.
 */
export function bullets<I, K extends string>(
  key: K,
  label: (item: I) => string,
  options: {
    readonly synthetic?: ((item: I) => boolean) | undefined;
  } & ChildLists<I>,
): Bound<Holding<K, I>, K, SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: {
      kind: 'bullets',
      list: key,
      lists: () => rowShapes(options.lists),
    },
    write: (reading, outerDepth) => {
      const depth = outerDepth ?? 0;
      return itemsOf(reading, key).flatMap((item): Line[] => [
        options.synthetic?.(item) === true
          ? { bulletRoot: label(item), depth }
          : { bullet: label(item), depth },
        ...(options.lists === undefined
          ? []
          : listLines(item, options.lists, depth + 1)),
      ]);
    },
  };
}

/**
 * The list `key` written as mark lines, `# mark words…`, one per item: it
 * writes no list of an item, so it is taken only for items that hold none.
 */
export function marks<I, K extends string>(
  key: K,
  mark: string,
  words: (item: I) => readonly string[],
): Bound<Holding<K, I>, K> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'marks', list: key, mark },
    write: (reading) =>
      itemsOf(reading, key).map((item): Line => ({ mark, words: words(item) })),
  };
}

/** The list `key` of head lines written as they are, one `# head value` line per item. */
export function headLines<K extends string>(
  key: K,
): Bound<Holding<K, Head>, K> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'heads', list: key },
    write: (reading) => itemsOf(reading, key).map((head): Line => head),
  };
}

/**
 * The list `key` written as mark lines, `# mark JSON`, one per item: each
 * item whole as one JSON cell — every list it holds inside it.
 */
export function wholeMarks<I, K extends string>(
  key: JsonSafe<I> extends true ? K : never,
  mark: string,
): Bound<Holding<K, I>, K, PropertyKey> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'whole-marks', list: key, mark },
    write: (reading) =>
      itemsOf(reading, key).map(
        (item): Line => ({ mark, words: [JSON.stringify(item)] }),
      ),
  };
}

/** The list `key` written as sections: per item its head (or mark) lines, then its own lists. */
export function sections<I, K extends string>(
  key: K,
  heads: (item: I) => readonly (Head | Mark)[],
  lists: RowSchemas<I>,
): Bound<Holding<K, I>, K, SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'sections', list: key, lists: () => rowShapes(lists) },
    write: (reading, depth) =>
      itemsOf(reading, key).flatMap((item): Line[] => [
        ...heads(item),
        ...listLines(item, lists, depth),
      ]),
  };
}

/**
 * The member `key` holding one object written as a row — a tree's root —
 * then its own lists one level deeper, by `spec` as `rows` writes each item.
 */
export function node<O, K extends string>(
  key: K,
  spec: RowSpec<O>,
): Bound<HoldingObject<K, O>, K, SchemaKeys<O>> {
  return {
    [binding]: true,
    key,
    shape: rowsShape(key, spec, 'node'),
    write: (reading, depth) => {
      const value: O | undefined = reading[key];
      return value === undefined ? [] : rowLines([value], spec, depth);
    },
  };
}

/**
 * The member `key` holding an object with lists of its own: its lists
 * written through its own schemas, at the depth of its holder.
 */
export function within<O, K extends string>(
  key: K,
  lists: RowSchemas<O>,
): Bound<HoldingObject<K, O>, K, SchemaKeys<O>> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'within', list: key, lists: () => rowShapes(lists) },
    write: (reading, depth) => {
      const value: O | undefined = reading[key];
      return value === undefined ? [] : listLines<O>(value, lists, depth);
    },
  };
}

/**
 * A member of `I` that names its kind: a union of string literals (`'row' |
 * 'error'`), never `string` — so a schema exists for every kind it can be,
 * and no constant selector stands in for the item's own.
 */
export type Discriminant<I> = {
  [K in keyof I]-?: I[K] extends string
    ? string extends I[K]
      ? never
      : K
    : never;
}[keyof I];

/** The arm of `I` whose discriminant `D` is `P`, or `never`. */
type KindArm<I, D extends PropertyKey, P> = I extends unknown
  ? D extends keyof I
    ? P extends I[D]
      ? // Every arm whose discriminant may be `P` — a wider arm (`kind:
        // string`) beside the exact one included, so its lists count too.
        I
      : never
    : never
  : never;

/** The kinds the discriminant `D` of `I` can be. */
export type KindOf<I, D extends Discriminant<I>> = I[D] & string;

/**
 * How one item of a list of several kinds is written: a row, a mark line,
 * or a section. `A` is the kind's own arm of the item's union: a mark line
 * writes no list, so it is taken only for a kind whose items hold none.
 */
export type KindSpec<I, A = I> =
  | { readonly row: RowSpec<I> }
  /** A kind the answer's approved shape leaves out by definition: written as nothing, the reason stated. */
  | { readonly omit: string }
  | ([SchemaKeys<A>] extends [never]
      ? {
          readonly mark: string;
          readonly words: (item: I) => readonly string[];
        }
      : never)
  | {
      readonly heads: (item: I) => readonly Head[];
      readonly lists: RowSchemas<I>;
    };

/**
 * The list `key` of items of several kinds: each item written by its
 * kind's spec — one for every kind, by the record's type. A header is
 * written once, before the first item, when a row kind asks for it.
 */
export function kinds<I, K extends string, D extends Discriminant<I>>(
  key: K,
  discriminant: D,
  specs: {
    readonly [P in KindOf<I, D>]: KindArm<I, D, P> extends never
      ? // No arm of the item's union has this kind alone (`{ kind: 'a' |
        // 'b' }` on one object type): no spec can be given, so such an
        // item is no list of kinds.
        never
      : KindSpec<I, KindArm<I, D, P>>;
  },
  header?: readonly string[] | undefined,
): Bound<Holding<K, I>, K, SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: kindsShape<I>(key, discriminant, specs, header),
    write: (reading, depth) => {
      const items = itemsOf(reading, key);
      const lines: Line[] = header === undefined ? [] : [{ header }];
      const table: Readonly<Record<string, KindSpec<I, never> | undefined>> =
        specs;
      for (const item of items) {
        // Every kind the discriminant can be has a spec, by `specs`' type.
        const spec = table[String(item[discriminant])];
        if (spec === undefined) continue;
        if ('omit' in spec) {
          // Visited, and left out by the shape: nothing written.
        } else if ('row' in spec) {
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
  const bound: readonly Bound<R, SchemaKeys<R>>[] =
    Object.values<Bound<R, SchemaKeys<R>>>(schemas);
  return bound.flatMap((schema) => schema.write(value, depth));
}

/** The shapes of a terse schemas record, in its order; none for no record. */
function rowShapes<R>(
  schemas: RowSchemas<R> | undefined,
): readonly ListShape[] {
  if (schemas === undefined) return [];
  return Object.values<Bound<R, SchemaKeys<R>>>(schemas).map(
    (schema) => schema.shape,
  );
}

/** The shapes of a JSON schemas record, in its order; none for no record. */
function jsonShapes<R>(
  schemas: JsonSchemas<R> | undefined,
): readonly ListShape[] {
  if (schemas === undefined) return [];
  return Object.values<JsonBound<R, SchemaKeys<R>>>(schemas).map(
    (schema) => schema.shape,
  );
}

/** What a tool's terse schemas write, as data: what its description states. */
export function shapesOf<R>(schemas: RowSchemas<R>): readonly ListShape[] {
  return rowShapes(schemas);
}

/** What a tool's medium schemas write, as data: what its description states. */
export function jsonShapesOf<R>(schemas: JsonSchemas<R>): readonly ListShape[] {
  return jsonShapes(schemas);
}

/** Rows, with their header, group lines and each item's own lists. */
function rowLines<I>(
  items: readonly I[],
  spec: RowSpec<I>,
  outerDepth: number | undefined,
): Line[] {
  const depth = spec.tree === true && outerDepth === undefined ? 0 : outerDepth;
  const lines: Line[] = [];
  const omit = spec.omit;
  if (omit !== undefined) {
    // Every item visited: one of a kind the shape leaves out writes no row.
    return rowLines(
      items.filter((item) => !omit.omits(item)),
      { ...spec, omit: undefined },
      outerDepth,
    );
  }
  if (
    spec.header === 'always' ||
    (spec.header === 'when-rows' && items.length > 0)
  ) {
    lines.push({ header: spec.columns.map((column) => column.name) });
  }
  const rowOf = (item: I): Line[] => [
    depth === undefined
      ? { row: cellsOf(spec.columns, item) }
      : { row: cellsOf(spec.columns, item), depth },
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

/** A tree's root row: the reading's own node, written by its columns as a row and no item. */
export interface Root<R> {
  readonly columns: readonly Column<R>[];
}

/** What a listing writes: its heads, the reading, and a schema for each of its lists. */
export interface Listing<R> {
  readonly heads: readonly Head[];
  readonly reading: R;
  readonly lists: RowSchemas<R>;
  /** A tree's root row before the lists, at depth 0; its lists then one level deeper. */
  readonly root?: Root<R> | undefined;
  /** A fixed title line before the lists, and one after them (`''`: the text ends with a line feed). */
  readonly title?:
    | 'tree:'
    | 'No nodes found in object structure response.'
    | undefined;
  readonly end?: '' | undefined;
}

/**
 * The only writer of a terse list: the heads, a tree's root row, then
 * every list of the reading through its schema — each item one row or one
 * mark line, nothing chosen by the caller.
 */
export function writeListing<R>(listing: Listing<R>): Written<string> {
  return new Written(mint, renderLines(listingLines(listing)));
}

/**
 * The lines a listing writes, as data — what the description tests read to
 * tie a tool's Returns to what it writes (`returnsMatch.ts`).
 */
export function writtenLines<R>(listing: Listing<R>): readonly Line[] {
  return listingLines(listing);
}

/** A listing's lines: its heads, a tree's root row, then every list of the reading. */
function listingLines<R>(listing: Listing<R>): Line[] {
  const lines: Line[] = [...listing.heads];
  if (listing.title !== undefined) lines.push({ title: listing.title });
  if (listing.root !== undefined) {
    lines.push({
      root: cellsOf(listing.root.columns, listing.reading),
      depth: 0,
    });
  }
  lines.push(
    ...listLines(
      listing.reading,
      listing.lists,
      listing.root === undefined ? undefined : 1,
    ),
  );
  if (listing.end !== undefined) lines.push({ title: listing.end });
  return lines;
}

/** Only this module mints a nested listing's lines. */
const nestedLines: unique symbol = Symbol('nested listing');

/**
 * A listing of a reading `R` written inside another: its lines, which only
 * `nest` makes. `of` (a phantom, never set) holds `R` both ways, so a part
 * takes only a listing of exactly the value it writes.
 */
export interface Nested<R> {
  readonly [nestedLines]: readonly Line[];
  readonly of?: ((reading: R) => R) | undefined;
}

/** A listing to write inside a part of another (a list call's object, its own tree). */
export function nest<R>(listing: Listing<R>): Nested<R> {
  return { [nestedLines]: listingLines(listing) };
}

/**
 * The list `key` written as parts: per item its head lines, then the
 * listing of the item itself (`nested`, a listing of exactly the item) —
 * every list the item holds written by that listing's schemas.
 */
export function parts<I, K extends string>(
  key: K,
  heads: (item: I) => readonly Head[],
  nested: (item: I) => Nested<I>,
  header?: readonly string[] | undefined,
): Bound<Holding<K, I>, K, SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'parts', list: key },
    // One header before the first part, where asked.
    write: (reading) => [
      ...(header === undefined ? [] : [{ header }]),
      ...itemsOf(reading, key).flatMap((item): Line[] => [
        ...heads(item),
        ...nested(item)[nestedLines],
      ]),
    ],
  };
}

/**
 * The list `key` written as parts: per item its head lines, then, where the
 * item holds its member `member`, the listing of exactly that value — a
 * list call's object, its read written as its single call writes it. It
 * covers that member alone: an item holding any other list is refused.
 */
export function partsOf<I, K extends string, M extends keyof I & string>(
  key: K,
  heads: (item: I) => readonly Head[],
  member: OneMember<M>,
  nested: (
    value: Exclude<I[OneMember<M>], undefined>,
    item: I,
  ) => Nested<Exclude<I[OneMember<M>], undefined>>,
  header?: readonly string[] | undefined,
): Bound<Holding<K, I>, K, M> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'parts', list: key, member },
    write: (reading) => [
      ...(header === undefined ? [] : [{ header }]),
      ...itemsOf(reading, key).flatMap((item): Line[] => {
        return [
          ...heads(item),
          ...nestedOf(item[member], (value) => nested(value, item)),
        ];
      }),
    ],
  };
}

/**
 * `M` when it is one member, never a union of several: a part writes one
 * member, so each other member holding lists needs a part of its own.
 */
type OneMember<M> = [M] extends [UnionToIntersection<M>] ? M : never;

/** The intersection of a union's arms: what only one member satisfies. */
type UnionToIntersection<U> = (
  U extends unknown
    ? (arm: U) => void
    : never
) extends (all: infer I) => void
  ? I
  : never;

/** The lines of the listing `nested` makes of a value present. */
function nestedOf<V>(
  value: V,
  nested: (value: Exclude<V, undefined>) => Nested<Exclude<V, undefined>>,
): readonly Line[] {
  return defined(value) ? nested(value)[nestedLines] : [];
}

/** Whether a member's value is present. */
function defined<V>(value: V): value is Exclude<V, undefined> {
  return value !== undefined;
}

/**
 * A JSON schema bound to the member `K` of a reading `R`: what it writes of
 * it (one entry per item of a list, or the object), or nothing when it is
 * absent; only this module's factories make one. `covers` as for `Bound`.
 */
export interface JsonBound<R, K, E = unknown, C extends PropertyKey = never> {
  readonly [binding]: true;
  readonly key: K;
  /** What it writes, as data: what a tool's description states of the list. */
  readonly shape: ListShape;
  /** The member it is written under in the answer. */
  readonly as: string;
  readonly write: (reading: R) => E | undefined;
  readonly covers?: ((members: C) => void) | undefined;
}

/**
 * One JSON schema for every list of `R` — on any arm of a union, `X[] |
 * false` included — and for every member holding an object with lists at
 * any depth (`member`), each bound to its own key and covering every list
 * its items hold: a member without one is a compile error, and a reading
 * holding what no schema can write (`RowSchemas`) does not compile.
 */
export type JsonSchemas<R> = Writable<
  R,
  {
    readonly [K in SchemaKeys<R>]: JsonBound<R, K, unknown, Needed<R, K>>;
  }
>;

/** An item's own lists in its JSON entry: required when it holds any, absent when it holds none. */
export type ChildJsonLists<I> = [SchemaKeys<I>] extends [never]
  ? { readonly lists?: undefined }
  : { readonly lists: JsonSchemas<I> };

/** What `entries` takes beside an item's own lists. */
export interface EntriesOptions<I> {
  readonly as?: string | undefined;
  /** An empty list writes no member, as an absent one (a tree's leaf, medium). */
  readonly omitEmpty?: boolean | undefined;
  /** Kinds of item the answer's approved shape leaves out (`omitting`): visited, no entry. */
  readonly omit?: Omitting<I> | undefined;
}

/**
 * The options of a schema writing items `I`: optional when the items hold
 * no lists, required — with a schema for each of their lists — when they
 * do.
 */
type OptionsOf<I, O> = [SchemaKeys<I>] extends [never]
  ? [options?: O & ChildJsonLists<I>]
  : [options: O & ChildJsonLists<I>];

/**
 * The list `key` written as JSON entries, one per item: the item's own
 * members from `entry`, then its own lists (`lists`, required when it
 * holds any), each under its name. An absent list writes no member; an
 * empty one, `[]`.
 */
export function entries<I, K extends string, E extends object>(
  key: K,
  entry: (item: I) => Listless<E>,
  ...[options]: OptionsOf<I, EntriesOptions<I>>
): JsonBound<Holding<K, I>, K, readonly E[], SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: {
      kind: 'entries',
      list: key,
      as: options?.as ?? key,
      lists: () => jsonShapes(options?.lists),
      omits: options?.omit?.reasons ?? {},
    },
    as: options?.as ?? key,
    write: (reading) => {
      if (!present(reading, key)) return undefined;
      const list = itemsOf(reading, key);
      if (options?.omitEmpty === true && list.length === 0) return undefined;
      const omit = options?.omit;
      const written =
        omit === undefined ? list : list.filter((item) => !omit.omits(item));
      // Read when written: a tree's schemas name themselves.
      const lists: JsonSchemas<I> | undefined = options?.lists;
      return written.map((item) =>
        lists === undefined
          ? entry(item)
          : { ...entry(item), ...jsonMembers(item, lists) },
      );
    },
  };
}

/**
 * The member `key` holding an object with lists of its own, written as one
 * JSON object: its own members from `entry`, then its lists through their
 * schemas. An absent object writes no member.
 */
export function member<O, K extends string, E extends object>(
  key: K,
  entry: (value: O) => Listless<E>,
  options: { readonly as?: string | undefined } & ChildJsonLists<O>,
): JsonBound<HoldingObject<K, O>, K, E, SchemaKeys<O>> {
  return {
    [binding]: true,
    key,
    shape: {
      kind: 'member',
      list: key,
      as: options.as ?? key,
      lists: () => jsonShapes(options.lists),
    },
    as: options.as ?? key,
    write: (reading) => {
      const value: O | undefined = reading[key];
      if (value === undefined) return undefined;
      const lists: JsonSchemas<O> | undefined = options.lists;
      return lists === undefined
        ? entry(value)
        : { ...entry(value), ...jsonMembers(value, lists) };
    },
  };
}

/**
 * The list `key` written as JSON entries, each item whole as it is — every
 * list it holds inside it.
 */
export function wholeEntries<I, K extends string>(
  key: JsonSafe<I> extends true ? K : never,
): JsonBound<Holding<K, I>, K, readonly I[], PropertyKey> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'whole-entries', list: key, as: key },
    as: key,
    write: (reading) =>
      present(reading, key) ? itemsOf(reading, key) : undefined,
  };
}

/**
 * The list `key` written as JSON values, one per item, each the value
 * `value` makes of it: it writes no list of an item, so it is taken only
 * for items that hold none (a list call's answers are written answers:
 * `written`).
 */
export function values<I, K extends string, V>(
  key: K,
  value: (item: I) => V,
  options?: {
    /** Kinds of item the answer's approved shape leaves out (`omitting`): visited, no value. */
    readonly omit?: Omitting<I> | undefined;
  },
): JsonBound<Holding<K, I>, K, readonly V[]> {
  return {
    [binding]: true,
    key,
    shape: {
      kind: 'values',
      list: key,
      as: key,
      omits: options?.omit?.reasons ?? {},
    },
    as: key,
    write: (reading) => {
      if (!present(reading, key)) return undefined;
      const omit = options?.omit;
      const list = itemsOf(reading, key);
      return (
        omit === undefined ? list : list.filter((item) => !omit.omits(item))
      ).map(value);
    },
  };
}

/**
 * The list `key` written as JSON values, one per item, each an answer a
 * writer wrote of it (a list call's objects, each as its single call
 * answered it): every list of an item is the writer's to write.
 */
export function writtenValues<I, K extends string, V>(
  key: K,
  value: (item: I) => Written<V>,
): JsonBound<Holding<K, I>, K, readonly V[], SchemaKeys<I>> {
  return {
    [binding]: true,
    key,
    shape: { kind: 'written-values', list: key, as: key },
    as: key,
    write: (reading) =>
      present(reading, key)
        ? itemsOf(reading, key).map((item) => value(item).answer)
        : undefined,
  };
}

/**
 * Every schema of `value` as its JSON member, in its schemas' order; an
 * absent one writes none. The members are defined as own properties
 * (`Object.fromEntries`), so a name such as `__proto__` is a member like
 * any other, never a prototype. Two
 * bindings written under one name would replace one another: refused when
 * written (no type can tell two strings apart at construction).
 */
function jsonMembers<R>(
  value: R,
  schemas: JsonSchemas<R>,
): Record<string, unknown> {
  const members: [string, unknown][] = [];
  const bound: readonly JsonBound<R, SchemaKeys<R>>[] =
    Object.values<JsonBound<R, SchemaKeys<R>>>(schemas);
  const names = new Set<string>();
  for (const schema of bound) {
    if (names.has(schema.as)) {
      throw new Error(`two lists are written under one name: ${schema.as}`);
    }
    names.add(schema.as);
    const written = schema.write(value);
    if (written !== undefined) members.push([schema.as, written]);
  }
  return Object.fromEntries(members);
}

/**
 * The only writer of a JSON list answer: `rest`, then every list of the
 * reading as its member — each item one entry, nothing chosen by the
 * caller — then `after`. The lists are written again after `after`, so
 * none of its keys can replace them.
 */
export function writeJson<R, A extends object, B extends object>(
  rest: Listless<A>,
  reading: R,
  lists: JsonSchemas<R>,
  after?: Listless<B> | undefined,
): Written<A & Partial<B> & Record<string, unknown>> {
  const members = jsonMembers(reading, lists);
  const facts: A = rest;
  const beside: B | undefined = after;
  return new Written(mint, { ...facts, ...members, ...beside, ...members });
}

/**
 * The only writer of a JSON array answer: one entry per item of the
 * reading's one list — a reading holding any other member a schema must
 * write does not compile.
 */
export function writeJsonList<R, K extends ListKeys<R>, E>(
  reading: [Exclude<SchemaKeys<R>, K>] extends [never] ? Writable<R, R> : never,
  list: JsonBound<NoInfer<R>, K, readonly E[], Needed<NoInfer<R>, K>>,
): Written<readonly E[]> {
  return new Written(mint, list.write(reading) ?? []);
}

/** The only writer of a JSON tree answer: the root's own members, then its lists through their schemas. */
export function writeJsonRoot<R, E extends object>(
  reading: R,
  entry: (root: R) => Listless<E>,
  lists: JsonSchemas<R>,
): Written<object> {
  return new Written(mint, {
    ...entry(reading),
    ...jsonMembers(reading, lists),
  });
}

/** A tool's text answer, as the answer boundary hands it back. */
export interface TextResult {
  readonly isError: false;
  readonly content: Array<{ type: 'text'; text: string }>;
}

/** A written text as a tool's text answer, written still. */
export function asTextResult(text: Written<string>): Written<TextResult> {
  return new Written(mint, {
    isError: false,
    content: [{ type: 'text', text: text.answer }],
  });
}

/** A written JSON answer as a tool's text answer, written still. */
export function asJsonResult<A>(json: Written<A>): Written<TextResult> {
  return asTextResult(new Written(mint, JSON.stringify(json.answer)));
}

/** A written JSON answer as its text, written still. */
export function jsonText<A>(json: Written<A>): Written<string> {
  return new Written(mint, JSON.stringify(json.answer));
}

/** Written content entries as a tool's answer of several text entries, written still. */
export function asContentResult(
  content: Written<readonly { type: 'text'; text: string }[]>,
): Written<TextResult> {
  return new Written(mint, { isError: false, content: [...content.answer] });
}

/**
 * A written answer shown beside facts of its reading (a transport read: the
 * item it answers for, and what is shown of it), written still; none when
 * the reading had nothing to write.
 */
export function shownBeside<E extends object, A>(
  extra: E,
  shown: Written<A> | undefined,
): Written<E & { readonly shown: A | undefined }> {
  return new Written(mint, { ...extra, shown: shown?.answer });
}

/**
 * The answer of the level asked for, written: terse and medium as their
 * writers wrote them, full and raw whole (the answer before `detail`, which
 * reshapes nothing) — what a list call writes of each object.
 */
export function listWrittenAt<V, A>(
  table: ListAnswerTable<V, A>,
  detail: DetailLevel,
): (value: V) => Written<A> {
  if (detail === 'terse') return table.terse;
  if (detail === 'medium') return table.medium;
  const level = table[detail];
  return (value) => new Written(mint, level(value));
}
