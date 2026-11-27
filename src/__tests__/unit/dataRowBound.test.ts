/**
 * The data tools' row count (fr0ster/mcp-abap-adt#391, items 1–3): the
 * server picks no number of its own, and the owner made the count a
 * required argument — the model states it. It is handed on as given, `0`
 * included: SAP refuses `0` and anything above 2147483646 (`400`, "UP TO …
 * cannot be specified"), measured on the BTP ABAP environment 2026-11-27.
 *
 * The answer says when fewer records are listed than the selection holds.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import {
  handleGetSqlQuery,
  TOOL_DEFINITION as SqlQuery,
} from '../../handlers/system/readonly/handleGetSqlQuery';
import {
  handleGetTableContents,
  TOOL_DEFINITION as TableContents,
} from '../../handlers/table/readonly/handleGetTableContents';
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

describe('GetSqlQuery: row_number is required, handed on as given', () => {
  it('the schema refuses a call without row_number', () => {
    assert.equal(
      SqlQuery.inputSchema.safeParse({ sql_query: 'SELECT * FROM T' }).success,
      false,
    );
  });

  for (const given of [5, 0, 2147483646]) {
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

describe('GetTableContents: max_rows is required, handed on as given', () => {
  it('the schema refuses a call without max_rows', () => {
    assert.equal(
      TableContents.inputSchema.safeParse({ table_name: 'T' }).success,
      false,
    );
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
  it('terse: the head names the records listed of the total, and the bound that cut them', async () => {
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
      await handleGetSqlQuery(context, {
        sql_query: 'SELECT * FROM T',
        row_number: 10,
      }),
    );
    assert.equal(text, '# total_rows 2\nC1\na\nb');
  });

  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: rows_listed against total_rows, and the bound that cut them`, async () => {
      preview = { ...preview, total_rows: 249 };
      const cut = JSON.parse(
        textOf(
          await handleGetSqlQuery(context, {
            sql_query: 'SELECT * FROM T',
            row_number: 2,
            detail,
          }),
        ),
      );
      assert.equal(cut.total_rows, 249);
      assert.equal(cut.rows_listed, 2);
      assert.equal(cut.cut_by, 'row_number 2');
      assert.equal(cut.row_number, 2);
    });

    it(`${detail}: rows_listed always, no cut_by when every record was listed`, async () => {
      const whole = JSON.parse(
        textOf(
          await handleGetSqlQuery(context, {
            sql_query: 'SELECT * FROM T',
            row_number: 10,
            detail,
          }),
        ),
      );
      assert.equal(whole.rows_listed, 2);
      assert.equal('cut_by' in whole, false);
    });
  }
});
