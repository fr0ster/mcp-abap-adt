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

import { cell, line } from './tsvCells';

/** One row as its line, escaped as in {@link tsv}: for a writer that interleaves its own group lines. */
export function tsvRow(row: readonly string[]): string {
  return line(row);
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

/** A row of an indented tree: its depth (0 for the root) and its cells. */
export interface TreeRow {
  readonly depth: number;
  readonly cells: readonly string[];
}

/**
 * A tree as indented TSV, no header: each row on its own line, two spaces
 * per level of depth before its cells, the cells escaped as in {@link tsv}.
 */
export function indentedTsv(rows: readonly TreeRow[]): string {
  return rows
    .map((row) => `${'  '.repeat(row.depth)}${row.cells.map(cell).join('\t')}`)
    .join('\n');
}
