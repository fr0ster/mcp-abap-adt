/**
 * What the listing writers render (`src/lib/detail/complete.ts`, written
 * through `./listing`): every value escaped — a tab or any line terminator
 * in SAP's text adds no column and no line, a first cell starting with `#`
 * is escaped at every depth, mark words are tab-separated cells — and a
 * written answer is made by the writers alone (with `listing.test.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  marks,
  omitted,
  type RowSchemas,
  rows,
  Written,
  writeListing,
} from '../../../lib/detail';
import { cellsOf } from '../../../lib/detail/tsvCells';

type Cells = { readonly cells: readonly string[] };
const rowsOf = (...lines: (readonly string[])[]) =>
  writeListing({
    heads: [],
    reading: { lines: lines.map((cells) => ({ cells })) },
    lists: {
      lines: rows('lines', {
        columns: [0, 1].map((i) => ({
          name: String(i),
          cell: (line: Cells) => line.cells[i] ?? '',
          when: (line: Cells) => i < line.cells.length,
        })),
        header: 'none',
        lists: {
          cells: omitted<string, 'cells'>('cells', 'written as the columns'),
        },
      }),
    },
  }).answer;

describe('the writers escape every value', () => {
  it('a line break in a head value or a cell adds no line', () => {
    const text = writeListing({
      heads: [{ head: 'object', value: 'ZA\n# injected' }],
      reading: { lines: [{ cells: ['a\tb\nc'] }] },
      lists: {
        lines: rows('lines', {
          columns: [
            { name: 'name', cell: (line: Cells) => line.cells[0] ?? '' },
          ],
          header: 'always',
          lists: {
            cells: omitted<string, 'cells'>('cells', 'written as the columns'),
          },
        }),
      },
    }).answer;
    assert.equal(text.split('\n').length, 3, text);
  });

  it('every line terminator in a cell is escaped, and reads back', () => {
    const value = 'a b c\u0085d\ve\ff\ng\rh\ti\\j';
    const text = rowsOf([value, 'x']);
    for (const terminator of ['\n', '\r', '\v', '\f', '\u0085', ' ', ' ']) {
      assert.ok(!text.includes(terminator), JSON.stringify(text));
    }
    assert.deepStrictEqual(cellsOf(text), [value, 'x']);
  });

  it('a first cell starting with # is escaped at every depth, the root too', () => {
    type N = {
      readonly name: string;
      readonly children?: readonly N[] | undefined;
    };
    const tree: RowSchemas<N> = {
      children: rows('children', {
        columns: [{ name: 'name', cell: (n: N) => n.name }],
        header: 'none',
        get lists() {
          return tree;
        },
      }),
    };
    const text = writeListing({
      heads: [],
      reading: { name: '# forged', children: [{ name: '# forged' }] },
      root: { columns: [{ name: 'name', cell: (n: N) => n.name }] },
      lists: tree,
    }).answer;
    for (const line of text.split('\n')) {
      assert.ok(!line.trimStart().startsWith('#'), text);
    }
  });

  it('head labels and header cells are escaped like every value', () => {
    const text = writeListing({
      heads: [{ head: 'a\nb', value: 'v' }],
      reading: { lines: [] },
      lists: {
        lines: rows('lines', {
          columns: [
            { name: 'x\ny', cell: (line: Cells) => line.cells[0] ?? '' },
          ],
          header: 'always',
          lists: {
            cells: omitted<string, 'cells'>('cells', 'written as the columns'),
          },
        }),
      },
    }).answer;
    assert.equal(text.split('\n').length, 2, text);
  });

  // Codex round 10: a header's first cell starting with `#` is escaped as a
  // row's is — no header reads as a `#` line.
  it('a header cell starting with # is escaped', () => {
    const text = writeListing({
      heads: [],
      reading: { lines: [] },
      lists: {
        lines: rows('lines', {
          columns: [
            { name: '# forged', cell: (line: Cells) => line.cells[0] ?? '' },
          ],
          header: 'always',
          lists: {
            cells: omitted<string, 'cells'>('cells', 'written as the columns'),
          },
        }),
      },
    }).answer;
    assert.equal(text, '\\# forged');
  });

  it('two lists of mark words never render alike', () => {
    const markOf = (words: readonly string[]) =>
      writeListing({
        heads: [],
        reading: { marked: [words] },
        lists: {
          marked: marks('marked', 'm', (item: readonly string[]) => item),
        },
      }).answer;
    const answers = [
      ['a b', 'c'],
      ['a', 'b c'],
      ['a\tb', 'c'],
      ['a', 'b', 'c'],
    ].map(markOf);
    assert.equal(new Set(answers).size, 4, answers.join(' | '));
  });

  it('a written answer is made by the writers alone: no constructor call compiles outside', () => {
    // @ts-expect-error the token the constructor takes is not exported.
    new Written(Symbol('written'), 'forged');
  });
});
