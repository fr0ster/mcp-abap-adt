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
import {
  usingObject,
  type WhereUsedReference,
} from '../../../lib/strategies/whereUsedList';

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

  // The onprem case (CL_ABAP_UNIT_ASSERT): 107,174 usages, nearly all in
  // methods of test classes. Written with the class and its type on every
  // row, the answer grew to 10,913,053 bytes (measured on premise); each
  // class is now written once on its `# in` line, its elements under it.
  // No bound is asserted: how long a message may be is the client's
  // (`--stdio-message-limit`), and every usage is answered.
  it("GetWhereUsed's terse answer of 107,174 element usages, the class once per # in line, is shorter than with the class on every row", () => {
    const USAGES = 107_174;
    const PER_CLASS = 10;
    const CLASSES_PER_PACKAGE = 30;
    const references: WhereUsedReference[] = Array.from(
      { length: USAGES },
      (_, i) => {
        const owner = Math.floor(i / PER_CLASS);
        const pkg = `ZABAPUNIT_USERS_PKG_${String(Math.floor(owner / CLASSES_PER_PACKAGE)).padStart(5, '0')}`;
        const name = `ZCL_ABAPUNIT_ASSERT_USER_${String(owner).padStart(5, '0')}`;
        const element = `LTCL_ASSERT_TESTS=>TEST_${String(i).padStart(6, '0')}`;
        return {
          name: element,
          type: '',
          uri: `/sap/bc/adt/oo/classes/${name.toLowerCase()}/includes/testclasses#type=CLAS%2FOLD;name=${element}`,
          parent_uri: `/sap/bc/adt/oo/classes/${name.toLowerCase()}`,
          usage_information: 'gradeElement,includeProductive',
          parent_type: 'CLAS/OC',
          parent_name: name,
          parent_package: pkg,
          element,
        };
      },
    );
    const text = writeListing({
      heads: [{ head: 'total', value: String(USAGES) }],
      reading: { totalReferences: USAGES, references },
      lists: WHERE_USED_LISTS,
    }).answer;
    // The header row and every usage, one `# in` line per class.
    assert.equal(rowCount(text), USAGES + 1);
    // The same usages with the class's type and name on every row and no
    // `# in` line: the shape the grouping replaced.
    const perRow = writeListing({
      heads: [{ head: 'total', value: String(USAGES) }],
      reading: { totalReferences: USAGES, references },
      lists: {
        references: rows('references', {
          columns: [
            {
              name: 'type',
              cell: (r: WhereUsedReference) => usingObject(r).type,
            },
            {
              name: 'name',
              cell: (r: WhereUsedReference) => usingObject(r).name,
            },
            {
              name: 'element',
              cell: (r: WhereUsedReference) => usingObject(r).element ?? '',
            },
            { name: 'uri', cell: () => '' },
            {
              name: 'usage',
              cell: (r: WhereUsedReference) => r.usage_information ?? '',
            },
          ],
          header: 'always',
          groups: [
            {
              label: 'package',
              of: (r: WhereUsedReference) => usingObject(r).package_name ?? '',
              mode: 'gathered',
            },
          ],
        }),
      },
    }).answer;
    const bytes = (answer: string) =>
      Buffer.byteLength(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: answer }] },
        }),
        'utf8',
      );
    const size = bytes(text);
    const perRowSize = bytes(perRow);
    assert.ok(size < perRowSize, `${size} bytes, per row ${perRowSize}`);
    console.log(
      `[largeListing] 107,174 element usages: ${size} bytes, ${perRowSize} with the class on every row`,
    );
  });
});
