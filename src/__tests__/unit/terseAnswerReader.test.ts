/**
 * The live suites' terse reader (`integration/helpers/terseAnswer.ts`),
 * held to recorded terse answers: heads by key, rows by the header's
 * column names (a column the answer gains leaves the others readable), a
 * header repeated per object skipped.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../helpers/repoRoot';
import {
  type FullWhereUsedReference,
  headOf,
  rowsWithoutTypeOrName,
  terseOf,
  whereUsedTerseMismatches,
} from '../integration/helpers/terseAnswer';

const GOLDENS: Record<string, { parts: string[] }> = JSON.parse(
  readFileSync(
    join(repositoryRoot(__dirname), 'tests/fixtures/tools/terse-goldens.json'),
    'utf8',
  ),
);

function golden(key: string): string {
  const text = GOLDENS[key]?.parts[0];
  assert.ok(text !== undefined, key);
  return text;
}

describe('the live terse reader', () => {
  it('reads a function group list by column name, the uri column beside', () => {
    const answer = terseOf(
      golden("ListFunctionGroupIncludes a group's children @terse"),
    );
    assert.equal(headOf(answer, 'function_group'), 'ZFG');
    assert.equal(Number(headOf(answer, 'total')), answer.rows.length);
    assert.deepEqual(answer.columns, ['name', 'uri', 'description']);
    // A nameless entry is named by its uri, read by column name too.
    assert.ok(
      answer.rows.every(
        (row) => (row.name ?? '') !== '' || (row.uri ?? '') !== '',
      ),
    );
    assert.ok(answer.rows.some((row) => row.name === '' && row.uri !== ''));
  });

  it('reads a where-used answer of two objects, its repeated header skipped', () => {
    const answer = terseOf(
      golden('GetWhereUsed two objects, one refused @terse'),
    );
    assert.equal(headOf(answer, 'total'), '4');
    for (const column of ['type', 'name', 'usage']) {
      assert.ok(answer.columns.includes(column));
    }
    assert.ok(answer.rows.length > 0);
    assert.ok(answer.rows.every((row) => row.type !== 'type'));
  });

  it('skips a header repeated by the next object of an answer', () => {
    const answer = terseOf(
      '# object A\ntype\tname\nCLAS/OC\tZA\n# object B\ntype\tname\nPROG/P\tZB',
    );
    assert.deepEqual(
      answer.rows.map((row) => row.name),
      ['ZA', 'ZB'],
    );
  });

  it('names the rows without a type or a name, by the header', () => {
    const answer = terseOf(
      'element\ttype\tname\n\tCLAS/OC\tZA\nRUN\tPROG/P\t\n\t\tZN\n\tINTF/OI\t',
    );
    assert.deepEqual(
      rowsWithoutTypeOrName(answer).map((row) => `${row.type}|${row.name}`),
      ['PROG/P|', '|ZN', 'INTF/OI|'],
    );
  });

  const FULL: FullWhereUsedReference[] = [
    { name: 'ZPKG', type: 'DEVC/K', uri: '/p' },
    { name: 'ZCL', type: 'CLAS/OC', uri: '/c' },
    {
      name: 'MAIN',
      type: '',
      uri: '/c#main',
      usage_information: 'gradeElement',
      parent_type: 'CLAS/OC',
      parent_name: 'ZCL',
      element: 'MAIN',
    },
    { name: 'RUN', type: '', uri: '/absent#run', usage_information: 'g' },
    { name: 'ZPROG', type: 'PROG/P', uri: '/prog', usage_information: 'g' },
  ];
  const HEADER = 'type\tname\telement\turi\tusage';

  it('where-used: terse matches full — the resolved by type, name and element, the unresolved by its URI', () => {
    const terse = terseOf(
      `${HEADER}\nCLAS/OC\tZCL\tMAIN\t\t\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg`,
    );
    assert.deepEqual(whereUsedTerseMismatches(terse, FULL), []);
  });

  it('where-used: a resolved usage answered without its class is a mismatch', () => {
    const terse = terseOf(
      `${HEADER}\n\tMAIN\t\t/c#main\t\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg`,
    );
    assert.equal(whereUsedTerseMismatches(terse, FULL).length, 2);
  });

  it('where-used: a row without a type and no URI full leaves unresolved is a mismatch', () => {
    const terse = terseOf(
      `${HEADER}\nCLAS/OC\tZCL\tMAIN\t\t\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg\n\tZX\t\t\tg`,
    );
    assert.equal(whereUsedTerseMismatches(terse, FULL).length, 1);
  });
});
