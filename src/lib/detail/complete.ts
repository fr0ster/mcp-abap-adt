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

/** An item's identity from its identity values, as a reading's held items are computed. */
export function identityOf(values: readonly string[]): string {
  return values.join('\t');
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

/** A word kept on one line: a line break or a tab in it written as its escape. */
function oneLine(word: string): string {
  let written = '';
  for (const character of word) {
    if (character === '\n') written += '\\n';
    else if (character === '\r') written += '\\r';
    else if (character === '\t') written += '\\t';
    else written += character;
  }
  return written;
}

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
  /** Makes the type nominal: nothing but these serializers builds one. */
  private readonly written = true;

  private constructor(
    readonly answer: A,
    readonly identities: readonly string[],
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
    for (const entry of lines) {
      if ('head' in entry) {
        texts.push(
          entry.value === undefined
            ? `# ${entry.head}`
            : `# ${entry.head} ${entry.value}`,
        );
      } else if ('group' in entry) {
        texts.push(`# ${entry.group} ${cell(entry.value)}`);
      } else if ('header' in entry) {
        texts.push(entry.header.join('\t'));
      } else if ('row' in entry) {
        texts.push(written(entry.row, entry.depth));
        identities.push(
          rowIdentity(entry.row, entry.identity ?? identityColumns),
        );
      } else if ('root' in entry) {
        texts.push(written(entry.root, entry.depth));
      } else if ('mark' in entry) {
        const words = entry.words.map(oneLine);
        texts.push([`# ${entry.mark}`, ...words].join(' '));
        identities.push(identityOf([entry.mark, ...words]));
      } else if ('bullet' in entry) {
        texts.push(`${'  '.repeat(entry.depth)}- ${entry.bullet}`);
        identities.push(identityOf(entry.identity));
      } else if ('bulletRoot' in entry) {
        texts.push(`${'  '.repeat(entry.depth)}- ${entry.bulletRoot}`);
      } else {
        texts.push(entry.title);
      }
    }
    return new Written(texts.join('\n'), identities);
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
    return new Written(
      { ...rest, ...rowsBy, ...after },
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
    return new Written(
      { ...rest, ...rootBy, ...after },
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

  /** JSON answers in a list, each with the items it holds. */
  static each<A>(parts: readonly Written<A>[]): Written<A[]> {
    return new Written(
      parts.map((part) => part.answer),
      parts.flatMap((part) => part.identities),
    );
  }

  /** Written texts as sections of one text, each item kept. */
  static sections(parts: readonly Written<string>[]): Written<string> {
    return new Written(
      parts.map((part) => part.answer).join('\n'),
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
      written.identities,
    );
  }

  /** A written JSON value as its text, its items unchanged. */
  static stringified<A>(written: Written<A>): Written<string> {
    return new Written(JSON.stringify(written.answer), written.identities);
  }
}

/** A row's text: its cells as a line, indented by its depth in a tree. */
function written(cells: readonly string[], depth: number | undefined): string {
  return depth === undefined
    ? line(cells)
    : `${'  '.repeat(depth)}${cells.map(cell).join('\t')}`;
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
    if (!sameItems(held(value), written.identities)) {
      throw new IncompleteAnswerError(tool);
    }
    return written.answer;
  };
}
