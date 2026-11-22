/** The terse list format (`src/lib/detail/tsv.ts`). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupedTsv, tsv } from '../../../lib/detail';

describe('tsv', () => {
  it('writes the header, then one line per row', () => {
    assert.equal(
      tsv(
        ['name', 'type'],
        [
          ['A', 'CLAS/OC'],
          ['B', 'INTF/OI'],
        ],
      ),
      'name\ttype\nA\tCLAS/OC\nB\tINTF/OI',
    );
  });

  it('writes the header alone for no rows', () => {
    assert.equal(tsv(['name'], []), 'name');
  });

  it('escapes what would break a line or a column, and drops nothing', () => {
    assert.equal(
      tsv(['a', 'b'], [['x\ty', 'l1\nl2\r\\']]),
      'a\tb\nx\\ty\tl1\\nl2\\r\\\\',
    );
  });

  it('keeps a row from reading as a group line', () => {
    assert.equal(tsv(['a'], [['#x']]), 'a\n\\#x');
  });
});

describe('groupedTsv', () => {
  it('states a shared value once, on its group line, before its rows', () => {
    assert.equal(
      groupedTsv(
        ['type', 'name'],
        [
          { field: 'task', value: 'T1', rows: [['CLAS', 'A']] },
          {
            field: 'task',
            value: 'T2',
            rows: [
              ['INTF', 'B'],
              ['PROG', 'C'],
            ],
          },
        ],
      ),
      'type\tname\n# task T1\nCLAS\tA\n# task T2\nINTF\tB\nPROG\tC',
    );
  });

  it('escapes a group value', () => {
    assert.equal(
      groupedTsv(['a'], [{ field: 'f', value: 'v\nw', rows: [] }]),
      'a\n# f v\\nw',
    );
  });
});
