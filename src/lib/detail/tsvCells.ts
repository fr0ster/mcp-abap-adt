/**
 * A cell and a row of the terse list format (`./tsv`), escaped: a backslash,
 * a tab, a line feed and a carriage return are written as their escapes,
 * and a row's first cell starting with `#` gets a backslash before it, so no
 * row reads as a group line. Shared by `./tsv` and the guarded serializers
 * (`./complete`).
 */

/** A cell, escaped for one column of one line. */
export function cell(value: string): string {
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
export function line(row: readonly string[]): string {
  const cells = row.map(cell);
  const first = cells[0];
  if (first?.startsWith('#')) cells[0] = `\\${first}`;
  return cells.join('\t');
}

/**
 * A line {@link line} wrote, read back into its cells: the inverse of the
 * escapes, for a writer that takes another tool's written rows as its own.
 */
export function cellsOf(written: string): string[] {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const character of written) {
    if (escaped) {
      current +=
        character === 't'
          ? '\t'
          : character === 'n'
            ? '\n'
            : character === 'r'
              ? '\r'
              : character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '\t') {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}
