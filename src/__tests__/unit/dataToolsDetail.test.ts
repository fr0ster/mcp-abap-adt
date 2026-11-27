/**
 * The data tools at each `detail` — `GetSqlQuery`, `GetTableContents` and
 * compact `HandlerGetData`, which delegates to them — over the captured
 * freestyle preview and a real adt-clients run on a recording connection:
 * terse a row per record under the column names, after how many records
 * the selection holds where SAP reports it and, when fewer are listed, how
 * many and what cut them; medium the rows with each column's type and
 * description; full that with the whole document parsed; raw the document.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import type { DetailLevel } from '../../lib/detail';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { recordingConnection } from '../helpers/recordingConnection';

const PREVIEW = corpusBody(
  'read-sql-query-with-blank-cells--01-datapreview-freestyle',
);

const xmlHead = '<?xml version="1.0" encoding="utf-8"?>';

/** A preview of the given columns, each `[name, cells]`, without a total when `total` is absent. */
function previewOf(
  columns: ReadonlyArray<readonly [string, readonly string[]]>,
  total?: number,
): string {
  const cells = (values: readonly string[]) =>
    values
      .map((value) =>
        value === ''
          ? '<dataPreview:data/>'
          : `<dataPreview:data>${value}</dataPreview:data>`,
      )
      .join('');
  return `${xmlHead}<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">${
    total === undefined
      ? ''
      : `<dataPreview:totalRows>${total}</dataPreview:totalRows>`
  }<dataPreview:queryExecutionTime>0.1</dataPreview:queryExecutionTime>${columns
    .map(
      ([name, values]) =>
        `<dataPreview:columns><dataPreview:metadata dataPreview:name="${name}" dataPreview:type="C" dataPreview:description="${name} text"/><dataPreview:dataSet>${cells(values)}</dataPreview:dataSet></dataPreview:columns>`,
    )
    .join('')}</dataPreview:tableData>`;
}

/** An answer's text and error flag. */
interface Answered {
  readonly isError: boolean;
  readonly text: string;
}

/** A context whose connection answers `document`, on premise. */
function contextOn(document: string) {
  const connection = recordingConnection([{ data: document }]);
  declareSystemKind(connection, 'onprem');
  return { connection, logger: undefined };
}

const textOf = (result: {
  isError?: boolean | undefined;
  content: Array<{ text?: string }>;
}): Answered => ({
  isError: result.isError === true,
  text: result.content.map((part) => part.text ?? '').join(''),
});

/** GetSqlQuery over `document` at `detail`. */
async function selected(
  document: string,
  detail?: DetailLevel,
): Promise<Answered> {
  return textOf(
    await handleGetSqlQuery(contextOn(document), {
      sql_query: 'SELECT * FROM I_Country',
      row_number: 5,
      ...(detail === undefined ? {} : { detail }),
    }),
  );
}

/** GetTableContents over `document` at `detail`. */
async function contents(
  document: string,
  detail?: DetailLevel,
): Promise<Answered> {
  return textOf(
    await handleGetTableContents(contextOn(document), {
      table_name: 'I_Country',
      max_rows: 5,
      detail: detail ?? 'terse',
    }),
  );
}

describe('the data tools answer terse by default: a row per record', () => {
  for (const [tool, read] of [
    ['GetSqlQuery', selected],
    ['GetTableContents', contents],
  ] as const) {
    it(`${tool}: the total, the column names, a row per record`, async () => {
      const terse = await read(PREVIEW);
      assert.equal(terse.isError, false, terse.text);
      const lines = terse.text.split('\n');
      assert.equal(lines[0], '# total_rows 249');
      // Five of 249 listed: the answer says so, and what cut them.
      assert.equal(
        lines[1],
        `# rows 5 of 249, cut at ${tool === 'GetSqlQuery' ? 'row_number' : 'max_rows'} 5`,
      );
      const header = lines[2]?.split('\t') ?? [];
      assert.equal(header.length, 13, terse.text);
      assert.equal(header[0], 'COUNTRY');
      assert.equal(lines.length, 3 + 5, terse.text);
      assert.equal(lines[3]?.split('\t')[0], 'AD');
      assert.equal(
        lines
          .slice(3)
          .map((line) => line.split('\t')[0])
          .join(','),
        'AD,AE,AF,AG,AI',
      );
    });
  }

  it('writes each value in its own column, a blank cell empty', async () => {
    const terse = await selected(
      previewOf(
        [
          ['C1', ['a', 'b']],
          ['C2', ['', 'y']],
          ['C3', ['x', '']],
        ],
        2,
      ),
    );
    assert.equal(terse.text, '# total_rows 2\nC1\tC2\tC3\na\t\tx\nb\ty\t');
  });

  it('carries no technical field: no statement, row limit, timing, type or description', async () => {
    const terse = await selected(previewOf([['C1', ['a']]], 1));
    for (const field of [
      'sql_query',
      'row_number',
      'execution_time',
      'C1 text',
      '"type"',
    ]) {
      assert.ok(!terse.text.includes(field), `${field} in ${terse.text}`);
    }
  });

  it('a selection with no records: its header alone', async () => {
    const terse = await selected(previewOf([['C1', []]], 0));
    assert.equal(terse.text, '# total_rows 0\nC1');
  });

  it('no total when SAP sent none', async () => {
    const terse = await selected(previewOf([['C1', ['a']]]));
    assert.equal(terse.text, 'C1\na');
  });

  it('escapes a tab or a line break in a value: it adds no column and no row', async () => {
    const terse = await selected(previewOf([['C1', ['a\tb\nc']]], 1));
    assert.equal(terse.text, '# total_rows 1\nC1\na\\tb\\nc');
  });
});

describe('the data tools at medium, full and raw', () => {
  for (const [tool, read] of [
    ['GetSqlQuery', selected],
    ['GetTableContents', contents],
  ] as const) {
    it(`${tool} medium: the rows with each column's type and description, no document`, async () => {
      const medium = JSON.parse((await read(PREVIEW, 'medium')).text);
      assert.equal(medium.total_rows, 249);
      assert.equal(medium.row_number, 5);
      assert.equal(medium.rows_listed, 5);
      assert.equal(medium.rows.length, 5);
      assert.equal(medium.rows[0].ISEUROPEANUNIONMEMBER, null);
      assert.deepStrictEqual(medium.columns[0], {
        name: 'COUNTRY',
        type: 'C',
        description: 'COUNTRY',
      });
      assert.equal(medium.document, undefined);
    });

    it(`${tool} full: medium with the whole document parsed`, async () => {
      const full = JSON.parse((await read(PREVIEW, 'full')).text);
      assert.equal(full.rows.length, 5);
      assert.ok(
        JSON.stringify(full.document).includes('dataPreview:isKeyFigure'),
      );
    });

    it(`${tool} raw: the document as SAP sent it`, async () => {
      assert.equal((await read(PREVIEW, 'raw')).text, PREVIEW);
    });
  }
});
