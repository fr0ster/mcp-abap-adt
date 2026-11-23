/**
 * The terse list format: tab-separated values.
 *
 * One header line naming the columns, then one line per row. Where a value
 * would repeat on every row of a run (a package, a task, an object), the rows
 * are grouped and the value stated once, on a group line `# <field> <value>`
 * before them (`groupedTsv`).
 *
 * A cell is written as it is, except the characters that would break a line
 * or a column: `\` is written `\\`, a tab `\t`, a line feed `\n`, a carriage
 * return `\r`, and a row's first cell starting with `#` gets a `\` before it,
 * so no row reads as a group line. Nothing is dropped or cut.
 */

/** A cell, escaped for one column of one line. */
function cell(value: string): string {
  let written = '';
  for (const character of value) {
    if (character === '\\') written += '\\\\';
    else if (character === '\t') written += '\\t';
    else if (character === '\n') written += '\\n';
    else if (character === '\r') written += '\\r';
    else written += character;
  }
  return written;
}

/** One row as a line: its first cell may not read as a group line. */
function line(row: readonly string[]): string {
  const cells = row.map(cell);
  const first = cells[0];
  if (first?.startsWith('#')) cells[0] = `\\${first}`;
  return cells.join('\t');
}

/** The header line, then one line per row. */
export function tsv(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  return [columns.join('\t'), ...rows.map(line)].join('\n');
}

/** A run of rows sharing one value, stated once on its group line. */
export interface TsvGroup {
  /** The field the group line names. */
  readonly field: string;
  /** Its value, shared by every row of the group. */
  readonly value: string;
  readonly rows: readonly (readonly string[])[];
}

/** The header line, then each group: its group line, then its rows. */
export function groupedTsv(
  columns: readonly string[],
  groups: readonly TsvGroup[],
): string {
  const lines = [columns.join('\t')];
  for (const group of groups) {
    lines.push(`# ${group.field} ${cell(group.value)}`);
    for (const row of group.rows) lines.push(line(row));
  }
  return lines.join('\n');
}
