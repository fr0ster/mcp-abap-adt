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
  whereUsedRows,
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
      `${HEADER}\n# package ZPKG\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg\n# in CLAS/OC ZCL\n\t\tMAIN\t\tgradeElement`,
    );
    assert.deepEqual(whereUsedTerseMismatches(terse, FULL), []);
  });

  it('where-used: a resolved usage answered without its class is a mismatch', () => {
    const terse = terseOf(
      `${HEADER}\n\tMAIN\t\t/c#main\t\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg`,
    );
    assert.deepEqual(whereUsedTerseMismatches(terse, FULL), [
      '1 terse row(s) missing: ["CLAS/OC","ZCL","MAIN","","gradeElement",""]',
      '1 terse row(s) full has not: ["","MAIN","","/c#main","",""]',
    ]);
  });

  it('where-used: a row without a type and no URI full leaves unresolved is a mismatch', () => {
    const terse = terseOf(
      `${HEADER}\n\tRUN\t\t/absent#run\tg\nPROG/P\tZPROG\t\t\tg\n\tZX\t\t\tg\n# in CLAS/OC ZCL\n\t\tMAIN\t\tgradeElement`,
    );
    assert.deepEqual(whereUsedTerseMismatches(terse, FULL), [
      '1 terse row(s) full has not: ["","ZX","","","g",""]',
    ]);
  });

  it('where-used: a row under an # in line is read with its type and name, until the next package', () => {
    const terse = terseOf(
      `${HEADER}\n# package ZA\n# in CLAS/OC ZCL\n\t\tMAIN\t\t\n# package ZB\n\tRUN\t\t/r\tg`,
    );
    assert.deepEqual(
      whereUsedRows(terse).map(
        (row) => `${row.type}|${row.name}|${row.element}`,
      ),
      ['CLAS/OC|ZCL|MAIN', '|RUN|'],
    );
  });

  it('where-used: a code line full holds that no terse row carries is a mismatch', () => {
    const withLine: FullWhereUsedReference[] = [
      {
        name: 'ZPROG',
        type: 'PROG/P',
        uri: '/prog',
        usage_information: 'g',
        snippets: [{ content: '  DATA x TYPE zdtel.' }],
      },
    ];
    const header = 'type\tname\telement\turi\tusage\tcode';
    assert.deepEqual(
      whereUsedTerseMismatches(
        terseOf(`${header}\nPROG/P\tZPROG\t\t\tg\tDATA x TYPE zdtel.`),
        withLine,
      ),
      [],
    );
    assert.equal(
      whereUsedTerseMismatches(
        terseOf(`${header}\nPROG/P\tZPROG\t\t\tg\t`),
        withLine,
      ).length,
      2,
    );
  });

  // Codex's case: terse gives method A's line to method B and drops one of
  // two identical usages — the comparison must see both.
  it('where-used: a line under the wrong element, or a usage missing, is a mismatch', () => {
    const full: FullWhereUsedReference[] = [
      {
        name: 'A',
        type: '',
        uri: '/c#a',
        usage_information: 'gradeElement',
        parent_type: 'CLAS/OC',
        parent_name: 'ZCL',
        element: 'A',
        snippets: [{ content: 'DATA a TYPE zd.', uri: '/c#a;start=1,1' }],
      },
      {
        name: 'B',
        type: '',
        uri: '/c#b',
        usage_information: 'gradeElement',
        parent_type: 'CLAS/OC',
        parent_name: 'ZCL',
        element: 'B',
        snippets: [
          { content: 'DATA b TYPE zd.', uri: '/c#b;start=1,1' },
          { content: 'DATA b TYPE zd.', uri: '/c#b;start=2,1' },
        ],
      },
    ];
    const header = 'type\tname\telement\turi\tusage\tcode';
    const right = `${header}\n# in CLAS/OC ZCL\n\t\tA\t\tgradeElement\tDATA a TYPE zd.\n\t\tB\t\tgradeElement\tDATA b TYPE zd.\n\t\tB\t\tgradeElement\tDATA b TYPE zd.`;
    assert.deepEqual(whereUsedTerseMismatches(terseOf(right), full), []);
    const wrong = `${header}\n# in CLAS/OC ZCL\n\t\tA\t\tgradeElement\tDATA a TYPE zd.\n\t\tB\t\tgradeElement\tDATA a TYPE zd.\n\t\tB\t\tgradeElement\tDATA b TYPE zd.`;
    assert.notDeepEqual(whereUsedTerseMismatches(terseOf(wrong), full), []);
  });

  // A cell the writer escaped (a backslash, a tab in the line) is compared
  // decoded, as the writer wrote it from full's text.
  it('where-used: escaped cells are compared decoded', () => {
    const full: FullWhereUsedReference[] = [
      {
        name: 'ZPROG',
        type: 'PROG/P',
        uri: '/prog',
        usage_information: 'g',
        snippets: [{ content: "  x = 'a\\b\tc'.", uri: '/prog#start=1,1' }],
      },
    ];
    const header = 'type\tname\telement\turi\tusage\tcode';
    assert.deepEqual(
      whereUsedTerseMismatches(
        terseOf(`${header}\nPROG/P\tZPROG\t\t\tg\tx = 'a\\\\b\\tc'.`),
        full,
      ),
      [],
    );
  });
});
