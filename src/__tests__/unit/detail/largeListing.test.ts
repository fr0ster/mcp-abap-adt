/**
 * A terse list of a very large reading is written in linear, iterative
 * steps (the onprem where-used case answered 107,174 references, and the
 * writer overflowed the stack): 200,000 items, gathered under one group, in
 * runs, and under a tree's root, each written whole.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WHERE_USED_LISTS } from '../../../handlers/system/readonly/handleGetWhereUsed';
import { rows, writeListing } from '../../../lib/detail';
import type { WhereUsedReference } from '../../../lib/strategies/whereUsedList';

interface Item {
  readonly type: string;
  readonly name: string;
  readonly pkg: string;
}

const COUNT = 200_000;

const items: readonly Item[] = Array.from({ length: COUNT }, (_, i) => ({
  type: 'CLAS/OC',
  name: `ZCL_${i}`,
  // One package: its group holds every item.
  pkg: 'ZA',
}));

const columns = [
  { name: 'type', cell: (item: Item) => item.type },
  { name: 'name', cell: (item: Item) => item.name },
];

/** The rows the text holds: lines that are no head. */
const rowCount = (text: string) =>
  text.split('\n').filter((line) => line !== '' && !line.startsWith('#'))
    .length;

describe('a terse list of 200,000 items', () => {
  it('gathered under their group, each written', () => {
    const text = writeListing({
      heads: [{ head: 'total', value: String(COUNT) }],
      reading: { items },
      lists: {
        items: rows('items', {
          columns,
          header: 'always',
          groups: [
            {
              label: 'package',
              of: (item: Item) => item.pkg,
              mode: 'gathered',
            },
          ],
        }),
      },
    }).answer;
    // The header row and every item.
    assert.equal(rowCount(text), COUNT + 1);
  });

  it('in runs of their group, each written', () => {
    const text = writeListing({
      heads: [],
      reading: { items },
      lists: {
        items: rows('items', {
          columns,
          header: 'none',
          groups: [
            { label: 'package', of: (item: Item) => item.pkg, mode: 'run' },
          ],
        }),
      },
    }).answer;
    assert.equal(rowCount(text), COUNT);
  });

  it('under a tree root, each written', () => {
    const text = writeListing({
      heads: [],
      reading: { name: 'ROOT', items },
      root: {
        columns: [{ name: 'name', cell: (r: { name: string }) => r.name }],
      },
      lists: { items: rows('items', { columns, header: 'none' }) },
    }).answer;
    assert.equal(rowCount(text), COUNT + 1);
  });

  it("GetWhereUsed's terse table of 200,000 references, every usage written", () => {
    const references: WhereUsedReference[] = Array.from(
      { length: COUNT },
      (_, i) => ({
        name: `ZCL_${i}`,
        type: 'CLAS/OC',
        package_name: 'ZA',
        usage_information: 'gradeDirect',
      }),
    );
    const text = writeListing({
      heads: [{ head: 'total', value: String(COUNT) }],
      reading: { totalReferences: COUNT, references },
      lists: WHERE_USED_LISTS,
    }).answer;
    // The header row and every usage.
    assert.equal(rowCount(text), COUNT + 1);
  });
});
