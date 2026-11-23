/**
 * The lines of a terse text and their rendering, used by the listing
 * writers alone (`./listing`). An answer is the complete result or an error,
 * never a partial one (the owner's rule): since plan step 9 completeness
 * holds by construction — a writer takes the reading's own lists and writes
 * every item — so no after-the-fact count remains here.
 *
 * Every value is escaped as a cell is (`./tsvCells`): a tab or any line
 * terminator in SAP's text can add no column and no line, and a row's first
 * cell starting with `#` is escaped at every depth, so no row reads as a `#`
 * line.
 */

import { cell, line } from './tsvCells';

/** One line of a written text. */
export type Line =
  /** `# head value` (or `# head`): never a row. */
  | { readonly head: string; readonly value?: string | undefined }
  /** `# group value`: the group of the rows after it. */
  | { readonly group: string; readonly value: string }
  /** The header line: the columns, tab-separated. */
  | { readonly header: readonly string[] }
  /** A row; `depth` indents it as a tree node. */
  | { readonly row: readonly string[]; readonly depth?: number | undefined }
  /** A tree's root row. */
  | { readonly root: readonly string[]; readonly depth?: number | undefined }
  /** `# mark words…`, the marker and each word a tab-separated cell. */
  | { readonly mark: string; readonly words: readonly string[] }
  /** `- label`, a tree's node as a bullet, indented by its depth. */
  | { readonly bullet: string; readonly depth: number }
  /** A bullet that is no node: the object asked, which SAP did not send. */
  | { readonly bulletRoot: string; readonly depth: number }
  /** A fixed title line; `''` ends the text with a line feed. */
  | {
      readonly title:
        | 'tree:'
        | 'No nodes found in object structure response.'
        | '';
    };

/** The text of typed lines, every value escaped. */
export function renderLines(lines: readonly Line[]): string {
  return lines
    .map((entry) => {
      if ('head' in entry) {
        return entry.value === undefined
          ? `# ${cell(entry.head)}`
          : `# ${cell(entry.head)} ${cell(entry.value)}`;
      }
      if ('group' in entry)
        return `# ${cell(entry.group)} ${cell(entry.value)}`;
      // A header cell starting with `#` escaped like a row's first cell.
      if ('header' in entry) return line(entry.header);
      if ('row' in entry) return written(entry.row, entry.depth);
      if ('root' in entry) return written(entry.root, entry.depth);
      if ('mark' in entry) {
        return [`# ${cell(entry.mark)}`, ...entry.words.map(cell)].join('\t');
      }
      if ('bullet' in entry) {
        return `${'  '.repeat(entry.depth)}- ${cell(entry.bullet)}`;
      }
      if ('bulletRoot' in entry) {
        return `${'  '.repeat(entry.depth)}- ${cell(entry.bulletRoot)}`;
      }
      return entry.title;
    })
    .join('\n');
}

/** A row's text: its cells as a line, indented by its depth in a tree. */
function written(cells: readonly string[], depth: number | undefined): string {
  // A first cell starting with `#` escaped at every depth, the root's
  // included: no row reads as a `#` line.
  return depth === undefined
    ? line(cells)
    : `${'  '.repeat(depth)}${line(cells)}`;
}
