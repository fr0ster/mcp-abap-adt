/**
 * An answer is the complete result or an error, never a partial one (the
 * owner's rule). SAP's read gives all or nothing; the risk is a formatter of
 * ours that drops, merges or misses an item, so the model reads an answer
 * that looks whole and is not.
 *
 * **The identities come from what was written, never from a claim beside
 * it** (Codex round 5, P1-1). A guarded formatter writes its answer only
 * through the serializers of {@link Written} — `tsv`, `groupedTsv`,
 * `indented`, `lines`, the JSON writers `list` and `tree` — each of which
 * takes typed rows (or reads the emitted JSON) and returns the text and the
 * identity of every item written, both from the same rows. `Written` has a
 * private constructor, so a formatter that builds its text any other way has
 * no `Written` to hand `completeAnswer`, and does not compile.
 *
 * `completeAnswer` compares the identities written with the items the
 * reading held — its entries, and the incomplete entries, not-loaded nodes
 * and incomplete objects beside them — each as often as it comes. On any
 * difference the call ends with `IncompleteAnswerError`, in fixed words
 * naming the tool, which the answer boundary answers as the error
 * `incomplete_answer` (`src/lib/answer.ts`, `src/lib/utils.ts`) — no partial
 * answer, and no SAP text.
 *
 * `raw` answers the documents as ADT sent them (`./wire`), and the generic
 * parse of `full` (`fullLevel`) keeps every element: neither reshapes, so
 * neither can lose an item. A `full` of our own assembly is guarded like any
 * other formatter.
 */

import { cell, line } from './tsvCells';

/** A row of a list: its cells, and the identity of the item it is written of. */
export interface ItemRow {
  readonly cells: readonly string[];
  readonly identity: string;
}

/** A row of an indented tree: its depth (0 for the root) as well. */
export interface TreeItemRow extends ItemRow {
  readonly depth: number;
}

/** A run of rows sharing one value, stated once on its group line. */
export interface ItemGroup {
  readonly field: string;
  readonly value: string;
  readonly rows: readonly ItemRow[];
}

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

/**
 * An answer and the identity of every item it holds, made only by the
 * serializers below, which take both from the same rows.
 */
export class Written<A> {
  /** Makes the type nominal: nothing but these serializers builds one. */
  private readonly written = true;

  private constructor(
    readonly answer: A,
    readonly identities: readonly string[],
  ) {}

  /** The header line, then one line per row (`./tsv`'s format). */
  static tsv(
    columns: readonly string[],
    rows: readonly ItemRow[],
  ): Written<string> {
    return new Written(
      [columns.join('\t'), ...rows.map((row) => line(row.cells))].join('\n'),
      rows.map((row) => row.identity),
    );
  }

  /** The header line, then each group: its group line, then its rows. */
  static groupedTsv(
    columns: readonly string[],
    groups: readonly ItemGroup[],
  ): Written<string> {
    const lines = [columns.join('\t')];
    const identities: string[] = [];
    for (const group of groups) {
      lines.push(`# ${group.field} ${cell(group.value)}`);
      for (const row of group.rows) {
        lines.push(line(row.cells));
        identities.push(row.identity);
      }
    }
    return new Written(lines.join('\n'), identities);
  }

  /** A tree as indented rows, two spaces per level; a row whose identity is `''` is no item (a root). */
  static indented(rows: readonly TreeItemRow[]): Written<string> {
    return new Written(
      rows
        .map(
          (row) => `${'  '.repeat(row.depth)}${row.cells.map(cell).join('\t')}`,
        )
        .join('\n'),
      rows.flatMap((row) => (row.identity === '' ? [] : [row.identity])),
    );
  }

  /**
   * A tree as bulleted lines, `- label`, two spaces per level of depth, each
   * line ending with a line feed; a row whose identity is `''` is no item.
   */
  static bulleted(
    rows: readonly { depth: number; label: string; identity: string }[],
  ): Written<string> {
    return new Written(
      rows.map((row) => `${'  '.repeat(row.depth)}- ${row.label}\n`).join(''),
      rows.flatMap((row) => (row.identity === '' ? [] : [row.identity])),
    );
  }

  /** One row as its line, for a writer that interleaves its own group lines. */
  static row(cells: readonly string[], identity: string): Written<string> {
    return new Written(line(cells), [identity]);
  }

  /**
   * A `#` line that is one item: an entry SAP lists without a name, a node
   * SAP could not load, an object's failure. Its words are kept on the one
   * line — a line break or a tab in them is written as its escape.
   */
  static marked(
    marker: string,
    words: readonly string[],
    identity: string,
  ): Written<string> {
    return new Written([`# ${marker}`, ...words.map(oneLine)].join(' '), [
      identity,
    ]);
  }

  /**
   * Lines already written by another tool's guarded writer (a search's
   * hit rows) that are one item here: at least one line.
   */
  static block(
    lines: readonly [string, ...string[]],
    identity: string,
  ): Written<string> {
    return new Written(lines.join('\n'), [identity]);
  }

  /** Lines joined: plain lines carry no item, written parts carry theirs, in order. */
  static lines(
    parts: readonly (string | Written<string>)[],
    separator = '\n',
  ): Written<string> {
    const texts: string[] = [];
    const identities: string[] = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        texts.push(part);
        continue;
      }
      texts.push(part.answer);
      identities.push(...part.identities);
    }
    return new Written(texts.join(separator), identities);
  }

  /** A JSON answer whose items are a list inside it: their identities read from the answer itself. */
  static list<A, I>(
    answer: A,
    itemsOf: (answer: A) => readonly I[],
    identityOf: (item: I) => string,
  ): Written<A> {
    return new Written(answer, itemsOf(answer).map(identityOf));
  }

  /** JSON answers in a list, each with the items it holds. */
  static each<A>(parts: readonly Written<A>[]): Written<A[]> {
    return new Written(
      parts.map((part) => part.answer),
      parts.flatMap((part) => part.identities),
    );
  }

  /**
   * A JSON tree: the identities of its nodes read from the answer itself,
   * depth first; the root's too when `withRoot`.
   */
  static tree<A, N>(
    answer: A,
    rootOf: (answer: A) => N,
    childrenOf: (node: N) => readonly N[],
    identityOf: (node: N, depth: number) => string,
    withRoot: boolean,
  ): Written<A> {
    const below = (node: N, depth: number): string[] =>
      childrenOf(node).flatMap((child) => [
        identityOf(child, depth + 1),
        ...below(child, depth + 1),
      ]);
    const root = rootOf(answer);
    return new Written(answer, [
      ...(withRoot ? [identityOf(root, 0)] : []),
      ...below(root, 0),
    ]);
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
