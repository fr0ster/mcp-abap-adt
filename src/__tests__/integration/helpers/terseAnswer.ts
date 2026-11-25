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
