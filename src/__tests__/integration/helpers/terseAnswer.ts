/**
 * A terse answer read back for a live case: its head lines (`# key value`)
 * and its table, each row read by the header's column names, never by
 * position — so a column the answer gains or drops leaves every other
 * column where the case reads it.
 */

/** One terse answer: its heads, in order, and its rows by column name. */
export interface TerseAnswer {
  /** The text read, for the message of a failing assert. */
  readonly text: string;
  /** Each `# key value` line: its key and value, in answer order. */
  readonly heads: ReadonlyArray<readonly [string, string]>;
  /** The table's header: the first line that is neither a head nor blank. */
  readonly columns: readonly string[];
  /** Each row after the header, by column name. */
  readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}

/** The answer's text: its first text block. */
export function terseText(answer: {
  readonly content?: ReadonlyArray<{ readonly text?: string }>;
  readonly text?: string;
}): string {
  if (typeof answer.text === 'string') return answer.text;
  return answer.content?.find((block) => block.text !== undefined)?.text ?? '';
}

/** The terse answer `text` holds. */
export function terseOf(text: string): TerseAnswer {
  const heads: Array<readonly [string, string]> = [];
  let columns: string[] | undefined;
  const rows: Array<Record<string, string>> = [];
  for (const line of text.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('# ')) {
      const body = line.slice(2);
      const space = body.indexOf(' ');
      heads.push(
        space < 0 ? [body, ''] : [body.slice(0, space), body.slice(space + 1)],
      );
      continue;
    }
    const cells = line.split('\t');
    if (columns === undefined) {
      columns = cells;
      continue;
    }
    // A header repeated (one table per object of a multi-object answer).
    if (line === columns.join('\t')) continue;
    const row: Record<string, string> = {};
    for (const [at, column] of columns.entries()) {
      row[column] = cells[at] ?? '';
    }
    rows.push(row);
  }
  return { text, heads, columns: columns ?? [], rows };
}

/** The value of the first head named `key`, or `undefined`. */
export function headOf(answer: TerseAnswer, key: string): string | undefined {
  return answer.heads.find(([name]) => name === key)?.[1];
}

/**
 * The rows of `answer` that do not name their object by a type and a name.
 * Empty when every row names both.
 */
export function rowsWithoutTypeOrName(
  answer: TerseAnswer,
): ReadonlyArray<Readonly<Record<string, string>>> {
  return answer.rows.filter((row) => !row.type || !row.name);
}

/**
 * GetWhereUsed's terse rows, each naming its object: a row under an
 * `# in TYPE NAME` line (a usage in a method or section of that object)
 * read with that type and name; the line holds until the next `# in`,
 * `# package` or `# object` line. Every other row as it is.
 */
export function whereUsedRows(
  answer: TerseAnswer,
): ReadonlyArray<Readonly<Record<string, string>>> {
  const rows: Array<Readonly<Record<string, string>>> = [];
  let owner: { type: string; name: string } | undefined;
  let columns: string[] | undefined;
  for (const line of answer.text.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('# in ')) {
      const value = line.slice('# in '.length);
      const space = value.indexOf(' ');
      owner =
        space < 0
          ? { type: value, name: '' }
          : { type: value.slice(0, space), name: value.slice(space + 1) };
      continue;
    }
    if (line.startsWith('# ')) {
      if (line.startsWith('# package') || line.startsWith('# object')) {
        owner = undefined;
      }
      continue;
    }
    const cells = line.split('\t');
    if (columns === undefined) {
      columns = cells;
      continue;
    }
    if (line === columns.join('\t')) continue;
    const row: Record<string, string> = {};
    for (const [at, column] of columns.entries()) row[column] = cells[at] ?? '';
    rows.push(
      owner === undefined
        ? row
        : { ...row, type: owner.type, name: owner.name },
    );
  }
  return rows;
}

/** One reference of GetWhereUsed's `full` answer: the fields compared. */
export interface FullWhereUsedReference {
  readonly name?: string | undefined;
  readonly type?: string | undefined;
  readonly uri?: string | undefined;
  readonly usage_information?: string | undefined;
  readonly parent_type?: string | undefined;
  readonly parent_name?: string | undefined;
  readonly element?: string | undefined;
}

/**
 * What GetWhereUsed's terse answer gets wrong against the `full` answer of
 * the same call, one line each; empty when it gets nothing wrong.
 *
 * Every usage `full` lists (a reference with `usage_information`) must be a
 * terse row: one `full` resolves — a type and a name of its own, or its
 * parent's — by that type, name and element; one it leaves unresolved by
 * its URI, as SAP gave it. A terse row without a type or a name must be one
 * of those unresolved references, by its URI. A row under an `# in` line
 * names its object by that line ({@link whereUsedRows}).
 */
export function whereUsedTerseMismatches(
  answer: TerseAnswer,
  references: readonly FullWhereUsedReference[],
): string[] {
  const rows = whereUsedRows(answer);
  const named = new Set(
    rows
      .filter((row) => row.type && row.name)
      .map((row) => `${row.type}\t${row.name}\t${row.element ?? ''}`),
  );
  const byUri = new Set(rows.map((row) => row.uri ?? ''));
  const unresolved = new Set<string>();
  const wrong: string[] = [];
  for (const reference of references) {
    if (reference.usage_information === undefined) continue;
    const type = reference.parent_type ?? reference.type ?? '';
    const name = reference.parent_name ?? reference.name ?? '';
    if (type !== '' && name !== '') {
      const key = `${type}\t${name}\t${reference.element ?? ''}`;
      if (!named.has(key)) wrong.push(`no terse row ${key}`);
      continue;
    }
    const uri = reference.uri ?? '';
    unresolved.add(uri);
    if (uri === '' || !byUri.has(uri)) {
      wrong.push(
        `no terse row for the unresolved ${JSON.stringify(reference)}`,
      );
    }
  }
  for (const row of rows.filter((row) => !row.type || !row.name)) {
    if (!unresolved.has(row.uri ?? '') || (row.uri ?? '') === '') {
      wrong.push(
        `a terse row without a type or a name: ${JSON.stringify(row)}`,
      );
    }
  }
  return wrong;
}
