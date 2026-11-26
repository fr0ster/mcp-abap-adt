import { cellsOf } from '../../../lib/detail/tsvCells';

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
 * GetWhereUsed's terse rows, each naming its object, every cell decoded as
 * the writer escaped it (`cellsOf`): a row under an `# in TYPE NAME` line
 * (a usage in a method or section of that object) read with that type and
 * name; the line holds until the next `# in`, `# package` or `# object`
 * line. Every other row as it is.
 */
export function whereUsedRows(
  answer: TerseAnswer,
): ReadonlyArray<Readonly<Record<string, string>>> {
  const rows: Array<Readonly<Record<string, string>>> = [];
  let owner: { type: string; name: string } | undefined;
  let columns: string[] | undefined;
  let header: string | undefined;
  for (const line of answer.text.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('# in ')) {
      const value = cellsOf(line.slice('# in '.length))[0] ?? '';
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
    if (header === undefined) {
      header = line;
      columns = cellsOf(line);
      continue;
    }
    if (line === header) continue;
    const cells = cellsOf(line);
    const row: Record<string, string> = {};
    for (const [at, column] of (columns ?? []).entries()) {
      row[column] = cells[at] ?? '';
    }
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
  readonly snippets?:
    | ReadonlyArray<{ readonly content: string; readonly uri?: string }>
    | undefined;
}

/** The usage terse leaves empty, as the tool writes it. */
const COMMON_USAGE = 'gradeDirect,includeProductive';

/** The element a line's position names (`…;name=RUN;…`), decoded; `''` for none. */
function positionElement(uri: string | undefined): string {
  if (uri === undefined) return '';
  const hash = uri.indexOf('#');
  if (hash < 0) return '';
  for (const part of uri.slice(hash + 1).split(';')) {
    if (!part.startsWith('name=')) continue;
    try {
      return decodeURIComponent(part.slice('name='.length));
    } catch {
      return part.slice('name='.length);
    }
  }
  return '';
}

/** A row's identity for the comparison: every column, in a fixed order. */
function rowKey(row: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(
    ['type', 'name', 'element', 'uri', 'usage', 'code'].map(
      (column) => row[column] ?? '',
    ),
  );
}

/**
 * The terse rows `full` implies, one per code line of each usage (a
 * reference with `usage_information`), one with no line for a usage SAP
 * gave none: its object (the parent's type and name where full names one),
 * its element (full's, else the line's position's), its URI where the
 * object is untold (no type or no name), its usage as terse writes it, the
 * line trimmed.
 */
function expectedRows(
  references: readonly FullWhereUsedReference[],
): Array<Record<string, string>> {
  return references.flatMap((reference) => {
    if (reference.usage_information === undefined) return [];
    const type = reference.parent_type ?? reference.type ?? '';
    const name = reference.parent_name ?? reference.name ?? '';
    const base = {
      type,
      name,
      uri: type === '' || name === '' ? (reference.uri ?? '') : '',
      usage:
        reference.usage_information === COMMON_USAGE
          ? ''
          : reference.usage_information,
    };
    const lines = reference.snippets ?? [];
    if (lines.length === 0) {
      return [{ ...base, element: reference.element ?? '', code: '' }];
    }
    return lines.map((line) => ({
      ...base,
      element: reference.element ?? positionElement(line.uri),
      code: line.content.trim(),
    }));
  });
}

/**
 * What GetWhereUsed's terse answer gets wrong against the `full` answer of
 * the same call, one line each; empty when it gets nothing wrong.
 *
 * Whole rows are compared, each as many times as it occurs: every row full
 * implies ({@link expectedRows}: the object, the element, the URI of an
 * unresolved reference, the usage, the code line) must be a terse row
 * ({@link whereUsedRows}, its cells decoded), and terse must hold no row
 * more. A line under the wrong element, a usage missing or doubled, an
 * unresolved reference's line: each is a mismatch.
 */
export function whereUsedTerseMismatches(
  answer: TerseAnswer,
  references: readonly FullWhereUsedReference[],
): string[] {
  const counts = new Map<string, number>();
  for (const row of expectedRows(references)) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of whereUsedRows(answer)) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) ?? 0) - 1);
  }
  const wrong: string[] = [];
  for (const [key, count] of counts) {
    if (count > 0) wrong.push(`${count} terse row(s) missing: ${key}`);
    if (count < 0) wrong.push(`${-count} terse row(s) full has not: ${key}`);
  }
  return wrong;
}
