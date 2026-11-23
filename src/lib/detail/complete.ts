/**
 * An answer is the complete result or an error, never a partial one (the
 * owner's rule). SAP's read gives all or nothing; the risk is a formatter of
 * ours that drops, merges or misses an item, so the model reads an answer
 * that looks whole and is not.
 *
 * **The identities are the cells written** (Codex rounds 5 and 6, P1-1). A
 * guarded formatter writes its answer only through {@link Written}: for
 * text, `Written.text` over typed lines — `#` heads, a header, item rows,
 * item marks, tree bullets — whose items' identities are their identity
 * columns *as written into the text*; for JSON, `Written.json` and
 * `Written.jsonTree`, which place the typed rows into the answer and read
 * each identity from the same row. Nothing appends text after a serializer
 * ran, and `Written` has a private constructor, so a formatter that builds
 * text any other way has no `Written` to hand `completeAnswer` and does not
 * compile. A head line is always `# …`, so it can carry no row.
 *
 * `completeAnswer` compares the identities written with the items the
 * reading held — its entries, and the incomplete entries, not-loaded nodes
 * and incomplete objects beside them — each as often as it comes, the held
 * ones computed from the reading's own values ({@link identityOf}). On any
 * difference the call ends with `IncompleteAnswerError`, in fixed words
 * naming the tool, which the answer boundary answers as the error
 * `incomplete_answer` (`src/lib/answer.ts`, `src/lib/utils.ts`) — no partial
 * answer, and no SAP text.
 *
 * Out of scope, as contrived forms in our own code: a cast, and mutating a
 * value after a serializer wrote it.
 *
 * `raw` answers the responses as ADT sent them (`./wire`), and the generic
 * parse of `full` (`fullLevel`) keeps every element: neither reshapes, so
 * neither can lose an item.
 */

import { cell, line } from './tsvCells';

/**
 * An item's identity from its identity values, each escaped as a written
 * cell is (`./tsvCells`): the same escaped value the text holds, so a line
 * break or a tab in SAP's text can neither add a line or a column nor make
 * two items one. A reading's held items are computed with it too.
 */
export function identityOf(values: readonly string[]): string {
  return values.map(cell).join('\t');
}

/** One line of a written text. */
export type Line =
  /** `# head value` (or `# head`): no item, and never a row. */
  | { readonly head: string; readonly value?: string | undefined }
  /** `# group value`, the value escaped as a cell: a group of the rows after it, no item. */
  | { readonly group: string; readonly value: string }
  /** The header line: the columns, tab-separated. */
  | { readonly header: readonly string[] }
  /**
   * A row that is an item; `depth` indents it as a tree node; `identity`
   * names the columns of its identity where they differ from the text's.
   */
  | {
      readonly row: readonly string[];
      readonly depth?: number | undefined;
      readonly identity?: readonly number[] | undefined;
    }
  /** A tree's root row: written as a row, and no item. */
  | { readonly root: readonly string[]; readonly depth?: number | undefined }
  /** `# mark words…`, a line that is an item (an entry without a name, a node not loaded, a failure). */
  | { readonly mark: string; readonly words: readonly string[] }
  /** `- label`, a tree's node as a bullet, indented by its depth, identified by its identity words. */
  | {
      readonly bullet: string;
      readonly depth: number;
      readonly identity: readonly string[];
    }
  /** A bullet that is no item: the object asked, which SAP did not send. */
  | { readonly bulletRoot: string; readonly depth: number }
  /** A fixed title line; `''` ends the text with a line feed. */
  | {
      readonly title:
        | 'tree:'
        | 'No nodes found in object structure response.'
        | '';
    };

/** The identity of a row: its identity columns, as written. */
function rowIdentity(
  cells: readonly string[],
  identityColumns: readonly number[],
): string {
  return identityOf(identityColumns.map((index) => cells[index] ?? ''));
}

/**
 * An answer and the identity of every item it holds, made only by the
 * serializers below, which take both from what they write.
 */
export class Written<A> {
  /**
   * Makes the type nominal, and an instance opaque: nothing but these
   * serializers builds one, and an assigned copy (`Object.assign`) carries
   * no `#written` — `completeAnswer` refuses it.
   */
  readonly #written = true;

  /** Whether `value` is an instance a serializer made, not a copy. */
  static isWritten<A>(value: Written<A>): boolean {
    return #written in value && value.#written;
  }

  /** Every item the answer holds, as its rows, marks and bullets write it. */
  get identities(): readonly string[] {
    return this.items;
  }

  /**
   * Whether the answer's roots are valid: a text has one root at most. A
   * check of its own, never an item: a second root cannot stand in for an
   * omitted row (Codex round 9).
   */
  get rootsValid(): boolean {
    return this.roots <= 1;
  }

  private constructor(
    readonly answer: A,
    private readonly items: readonly string[],
    private readonly roots = 0,
  ) {}

  /**
   * A text of typed lines (`./tsv`'s format). Each item's identity is read
   * from what is written: a row's identity columns (`identityColumns`, or
   * the row's own), a mark's marker and words, a bullet's identity words.
   */
  static text(
    lines: readonly Line[],
    identityColumns: readonly number[],
  ): Written<string> {
    const texts: string[] = [];
    const identities: string[] = [];
    // Roots counted apart from the items: more than one is refused.
    let roots = 0;
    for (const entry of lines) {
      if ('head' in entry) {
        // The label and the value escaped: SAP's text can add no line.
        texts.push(
          entry.value === undefined
            ? `# ${cell(entry.head)}`
            : `# ${cell(entry.head)} ${cell(entry.value)}`,
        );
      } else if ('group' in entry) {
        texts.push(`# ${cell(entry.group)} ${cell(entry.value)}`);
      } else if ('header' in entry) {
        texts.push(entry.header.map(cell).join('\t'));
      } else if ('row' in entry) {
        texts.push(written(entry.row, entry.depth));
        identities.push(
          rowIdentity(entry.row, entry.identity ?? identityColumns),
        );
      } else if ('root' in entry) {
        texts.push(written(entry.root, entry.depth));
        roots += 1;
      } else if ('mark' in entry) {
        // The marker and each word a cell, the words tab-separated: a tab
        // inside a word is escaped, so two lists of words never read alike.
        texts.push(
          [`# ${cell(entry.mark)}`, ...entry.words.map(cell)].join('\t'),
        );
        identities.push(identityOf([entry.mark, ...entry.words]));
      } else if ('bullet' in entry) {
        texts.push(`${'  '.repeat(entry.depth)}- ${cell(entry.bullet)}`);
        identities.push(identityOf(entry.identity));
      } else if ('bulletRoot' in entry) {
        texts.push(`${'  '.repeat(entry.depth)}- ${cell(entry.bulletRoot)}`);
        roots += 1;
      } else {
        texts.push(entry.title);
      }
    }
    return new Written(texts.join('\n'), identities, roots);
  }

  /**
   * A JSON answer: `rest`, with the typed rows of `rowsBy` (each key a
   * list's name in the answer, in order) after it, and `after`'s keys
   * after them. Each row's identity is read from
   * the row itself: its `identityKeys`' text values.
   */
  static json<
    R extends object,
    K extends string,
    I extends object,
    T extends object = Record<never, never>,
  >(
    rest: R,
    rowsBy: Partial<Record<K, readonly I[]>>,
    identityKeys: readonly TextKey<I>[],
    after?: T,
  ): Written<R & Partial<Record<K, readonly I[]>> & Partial<T>> {
    const rows: readonly I[] = Object.values<readonly I[] | undefined>(
      rowsBy,
    ).flatMap((list) => list ?? []);
    // The rows spread again after `after`: a key of `after` cannot overwrite
    // them, and each keeps its place in the answer.
    return new Written(
      { ...rest, ...rowsBy, ...after, ...rowsBy },
      rows.map((row) => textIdentity(row, identityKeys)),
    );
  }

  /**
   * A JSON tree: `rest`, the root of `rootBy` (one key) after it, and
   * `after`'s keys after that. Each node's identity is read from the node:
   * its `identityKeys`' text values; the root's too when `withRoot`.
   */
  static jsonTree<
    R extends object,
    K extends string,
    N extends object,
    T extends object = Record<never, never>,
  >(
    rest: R,
    rootBy: Record<K, N>,
    childrenOf: (node: N) => readonly N[],
    identityKeys: readonly TextKey<N>[],
    withRoot: boolean,
    after?: T,
  ): Written<R & Record<K, N> & Partial<T>> {
    const roots: readonly N[] = Object.values<N>(rootBy);
    // The tree spread again after `after`: a key of `after` cannot
    // overwrite it.
    return new Written(
      { ...rest, ...rootBy, ...after, ...rootBy },
      roots.flatMap((root) =>
        treeIdentities(root, childrenOf, identityKeys, withRoot),
      ),
    );
  }

  /** A JSON tree that is the answer itself: its nodes identified as in {@link Written.jsonTree}. */
  static jsonTreeRoot<N extends object>(
    root: N,
    childrenOf: (node: N) => readonly N[],
    identityKeys: readonly TextKey<N>[],
    withRoot: boolean,
  ): Written<N> {
    return new Written(
      root,
      treeIdentities(root, childrenOf, identityKeys, withRoot),
    );
  }

  /** A JSON answer that is the typed rows themselves, each identified by its `identityKeys`' text values. */
  static jsonRows<I extends object>(
    rows: readonly I[],
    identityKeys: readonly TextKey<I>[],
  ): Written<readonly I[]> {
    return new Written(
      rows,
      rows.map((row) => textIdentity(row, identityKeys)),
    );
  }

  /**
   * A written answer under `key` of a larger one, the container's own
   * fields beside it. The inner answer is set last, whole: nothing of the
   * container can replace it, and its items are the answer's.
   */
  static nested<R extends object, B>(
    rest: R,
    key: string,
    inner: Written<B>,
  ): Written<R & { [key: string]: B }> {
    return new Written(
      { ...rest, [key]: inner.answer },
      inner.items,
      inner.roots,
    );
  }

  /** JSON answers in a list, each with the items it holds. */
  static each<A>(parts: readonly Written<A>[]): Written<A[]> {
    return new Written(
      parts.map((part) => part.answer),
      parts.flatMap((part) => part.identities),
    );
  }

  /** A tool's answer of text entries, each an item identified by its text as written. */
  static content(entries: readonly { type: 'text'; text: string }[]): Written<{
    isError: boolean;
    content: Array<{ type: 'text'; text: string }>;
  }> {
    return new Written(
      { isError: false, content: [...entries] },
      entries.map((entry) => identityOf([entry.text])),
    );
  }

  /** A written text as a tool's text answer, its items unchanged. */
  static asText(written: Written<string>): Written<{
    isError: boolean;
    content: Array<{ type: 'text'; text: string }>;
  }> {
    return new Written(
      { isError: false, content: [{ type: 'text', text: written.answer }] },
      written.items,
      written.roots,
    );
  }

  /**
   * An answer a listing writer (`./listing`) built from the reading's own
   * lists, complete by construction; transitional until the writers own
   * the type (plan 9.8).
   */
  static answerOf<A>(answer: A): Written<A> {
    return new Written(answer, []);
  }

  /** A written JSON value as its text, its items unchanged. */
  static stringified<A>(written: Written<A>): Written<string> {
    return new Written(
      JSON.stringify(written.answer),
      written.items,
      written.roots,
    );
  }
}

/** A row's text: its cells as a line, indented by its depth in a tree. */
function written(cells: readonly string[], depth: number | undefined): string {
  // A first cell starting with `#` escaped at every depth, the root's
  // included: no row reads as a `#` line (Codex round 9).
  return depth === undefined
    ? line(cells)
    : `${'  '.repeat(depth)}${line(cells)}`;
}

/** A tree's nodes, depth first, each by its identity keys; the root's too when `withRoot`. */
function treeIdentities<N>(
  root: N,
  childrenOf: (node: N) => readonly N[],
  identityKeys: readonly TextKey<N>[],
  withRoot: boolean,
): string[] {
  const below = (node: N): string[] =>
    childrenOf(node).flatMap((child) => [
      textIdentity(child, identityKeys),
      ...below(child),
    ]);
  return [
    ...(withRoot ? [textIdentity(root, identityKeys)] : []),
    ...below(root),
  ];
}

/** The keys of `I` whose values are text (or absent). */
export type TextKey<I> = {
  [P in keyof I]-?: I[P] extends string | undefined ? P : never;
}[keyof I];

/**
 * One part of a list call's terse text: its own head lines (the object or
 * feed it answers for), then the object's own written answer — or its
 * failure, one escaped `# error` line.
 */
export type ListedPart<R> = { readonly heads: readonly Line[] } & (
  | { readonly read: R }
  | { readonly error: string }
);

/**
 * A list call's terse text, written entirely through `Written`: each part's
 * heads escaped as head lines, its read rendered by the tool's own terse
 * writer, its failure one `# error` line. Guarded like a single answer:
 * every item each read held is written, or the call answers
 * `incomplete_answer`.
 */
export function listedText<R>(
  tool: string,
  parts: readonly ListedPart<R>[],
  held: (read: R) => readonly string[],
  render: (read: R) => Written<string>,
): string {
  // Each part is its own section, guarded on its own: its read's items
  // against its own rows, its own root at most — an item of one object
  // written under another is refused (Codex round 9).
  const sectioned = completeAnswer(tool, held, render);
  return parts
    .flatMap((part) => [
      Written.text(part.heads, []).answer,
      'read' in part
        ? sectioned(part.read)
        : Written.text([{ head: 'error', value: part.error }], []).answer,
    ])
    .filter((text) => text !== '')
    .join('\n');
}

/** A JSON row's identity: its text keys' values, an absent one `''`. */
function textIdentity<I>(row: I, keys: readonly TextKey<I>[]): string {
  return identityOf(
    keys.map((key) => {
      const value: I[TextKey<I>] = row[key];
      return typeof value === 'string' ? value : '';
    }),
  );
}

/** The fixed words of an incomplete answer: the tool, and what to ask instead. */
export function incompleteAnswerWords(tool: string): string {
  return `${tool}: the compact answer could not represent every item the reading held, so nothing is answered; ask detail: 'full'`;
}

/** A formatter wrote other items than its reading held. */
export class IncompleteAnswerError extends Error {
  constructor(readonly tool: string) {
    super(incompleteAnswerWords(tool));
    this.name = 'IncompleteAnswerError';
  }
}

/** Whether two lists hold the same items, each as often. */
function sameItems(held: readonly string[], written: readonly string[]) {
  if (held.length !== written.length) return false;
  const counts = new Map<string, number>();
  for (const item of held) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of written) {
    const left = counts.get(item) ?? 0;
    if (left === 0) return false;
    counts.set(item, left - 1);
  }
  return true;
}

/**
 * `render` guarded: its answer when it wrote every item `held` names, each
 * once per holding; otherwise `IncompleteAnswerError` for `tool`.
 */
export function completeAnswer<T, A>(
  tool: string,
  held: (value: T) => readonly string[],
  render: (value: T) => Written<A>,
): (value: T) => A {
  return (value) => {
    const written = render(value);
    if (
      !Written.isWritten(written) ||
      !written.rootsValid ||
      !sameItems(held(value), written.identities)
    ) {
      throw new IncompleteAnswerError(tool);
    }
    return written.answer;
  };
}
