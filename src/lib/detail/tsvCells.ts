/**
 * A cell and a row of the terse list format, escaped: a backslash, a tab and
 * every line terminator — line feed, carriage return, vertical tab, form
 * feed, NEL, the line and paragraph separators — are written as their
 * escapes, and a row's first cell starting with `#` gets a backslash before
 * it, so no row reads as a `#` line. Shared by the guarded serializers
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
    else if (character === '\v') written += '\\v';
    else if (character === '\f') written += '\\f';
    // Every other line terminator a reader may split on — NEL, the line
    // and paragraph separators — as its `\\uXXXX` escape (Codex round 9).
    else if (
      character === '\u0085' ||
      character === '\u2028' ||
      character === '\u2029'
    ) {
      written += `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    } else written += character;
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
  // The four hex digits of a `\\uXXXX` escape still to read.
  let code: string | undefined;
  for (const character of written) {
    if (code !== undefined) {
      code += character;
      if (code.length === 4) {
        current += String.fromCharCode(Number.parseInt(code, 16));
        code = undefined;
      }
    } else if (escaped) {
      if (character === 'u') code = '';
      else {
        current +=
          character === 't'
            ? '\t'
            : character === 'n'
              ? '\n'
              : character === 'r'
                ? '\r'
                : character === 'v'
                  ? '\v'
                  : character === 'f'
                    ? '\f'
                    : character;
      }
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
