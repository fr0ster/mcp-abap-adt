/**
 * The data tools' row bound (fr0ster/mcp-abap-adt#391, items 1–3): the
 * server picks no number of its own. Without `row_number` / `max_rows` the
 * read is handed none, so the bound is SAP's; a bound given is handed on as
 * given, `0` included — SAP refuses it (`400`, "UP TO … 0 cannot be
 * specified"), measured on cloud 2026-11-27.
 *
 * The answer says when SAP answered fewer records than the selection holds.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import {
  handleGetSqlQuery,
  TOOL_DEFINITION as SqlQuery,
} from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import * as clients from '../../lib/clients';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

const asked: unknown[] = [];
let preview = {
  columns: [{ name: 'C1', type: 'C' }],
  rows: [{ C1: 'a' }, { C1: 'b' }],
  total_rows: 2 as number | undefined,
};

mock.method(clients, 'createAdtClient', () =>
  fakeClientOf({
    getSqlQuery: async (params: never) => {
      asked.push(params);
      return okResponse(reading(preview, '<raw/>'));
    },
  }),
);

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

beforeEach(() => {
  asked.length = 0;
  preview = {
    columns: [{ name: 'C1', type: 'C' }],
    rows: [{ C1: 'a' }, { C1: 'b' }],
    total_rows: 2,
  };
});

const textOf = (result: { content: Array<{ text?: string }> }) =>
  result.content.map((part) => part.text ?? '').join('');

describe('GetSqlQuery: the row bound is the consumer’s or SAP’s', () => {
  it('the schema gives no row_number of its own', () => {
    const parsed = SqlQuery.inputSchema.parse({ sql_query: 'SELECT * FROM T' });
    assert.equal('row_number' in parsed, false, JSON.stringify(parsed));
  });

  it('without row_number the read is handed no bound', async () => {
    await handleGetSqlQuery(context, { sql_query: 'SELECT * FROM T' });
    assert.deepStrictEqual(asked, [{ sql_query: 'SELECT * FROM T' }]);
  });

  for (const given of [5, 0]) {
    it(`row_number ${given} is handed on as given`, async () => {
      await handleGetSqlQuery(context, {
        sql_query: 'SELECT * FROM T',
        row_number: given,
      });
      assert.deepStrictEqual(asked, [
        { sql_query: 'SELECT * FROM T', row_number: given },
      ]);
    });
  }
});

describe('GetTableContents: the row bound is the consumer’s or SAP’s', () => {
  it('without max_rows the read is handed no bound', async () => {
    await handleGetTableContents(context, {
      table_name: 'T',
      detail: 'terse',
    });
    assert.deepStrictEqual(asked, [{ sql_query: 'SELECT * FROM T' }]);
  });

  for (const given of [7, 0]) {
    it(`max_rows ${given} is handed on as given`, async () => {
      await handleGetTableContents(context, {
        table_name: 'T',
        max_rows: given,
        detail: 'terse',
      });
      assert.deepStrictEqual(asked, [
        { sql_query: 'SELECT * FROM T', row_number: given },
      ]);
    });
  }
});

describe('a cut is unmistakable: the answer names the records listed against the total', () => {
  it('terse: the head names the records listed of the total, and SAP as what cut them when no bound was given', async () => {
    preview = { ...preview, total_rows: 249 };
    const text = textOf(
      await handleGetSqlQuery(context, { sql_query: 'SELECT * FROM T' }),
    );
    assert.equal(
      text.split('\n').slice(0, 2).join('\n'),
      '# total_rows 249\n# rows 2 of 249, cut by SAP: no row_number given',
    );
  });

  it('terse: the head names the bound given as what cut them', async () => {
    preview = { ...preview, total_rows: 899 };
    const text = textOf(
      await handleGetSqlQuery(context, {
        sql_query: 'SELECT * FROM T',
        row_number: 2,
      }),
    );
    assert.equal(
      text.split('\n').slice(0, 2).join('\n'),
      '# total_rows 899\n# rows 2 of 899, cut at row_number 2',
    );
  });

  it('terse GetTableContents: the bound given is named by its own parameter', async () => {
    preview = { ...preview, total_rows: 899 };
    const text = textOf(
      await handleGetTableContents(context, {
        table_name: 'T',
        max_rows: 2,
        detail: 'terse',
      }),
    );
    assert.equal(text.split('\n')[1], '# rows 2 of 899, cut at max_rows 2');
  });

  it('terse: no cut line when every record was listed', async () => {
    const text = textOf(
      await handleGetSqlQuery(context, { sql_query: 'SELECT * FROM T' }),
    );
    assert.equal(text, '# total_rows 2\nC1\na\nb');
  });

  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: rows_listed against total_rows, and what cut them`, async () => {
      preview = { ...preview, total_rows: 249 };
      const cutBySap = JSON.parse(
        textOf(
          await handleGetSqlQuery(context, {
            sql_query: 'SELECT * FROM T',
            detail,
          }),
        ),
      );
      assert.equal(cutBySap.total_rows, 249);
      assert.equal(cutBySap.rows_listed, 2);
      assert.equal(cutBySap.cut_by, 'SAP: no row_number given');
      assert.equal('row_number' in cutBySap, false);
      const cutAtBound = JSON.parse(
        textOf(
          await handleGetSqlQuery(context, {
            sql_query: 'SELECT * FROM T',
            row_number: 2,
            detail,
          }),
        ),
      );
      assert.equal(cutAtBound.rows_listed, 2);
      assert.equal(cutAtBound.cut_by, 'row_number 2');
      assert.equal(cutAtBound.row_number, 2);
    });

    it(`${detail}: rows_listed always, no cut_by when every record was listed`, async () => {
      const whole = JSON.parse(
        textOf(
          await handleGetSqlQuery(context, {
            sql_query: 'SELECT * FROM T',
            detail,
          }),
        ),
      );
      assert.equal(whole.rows_listed, 2);
      assert.equal('cut_by' in whole, false);
    });
  }
});
