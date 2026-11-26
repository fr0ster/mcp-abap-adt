import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import * as clients from '../../lib/clients';
import { parseSqlPreview, sqlPreview } from '../../lib/strategies/sqlPreview';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import { okResponse } from '../helpers/fakeClient';

/**
 * The reading behind `GetSqlQuery` and `GetTableContents`, against the
 * captured document.
 *
 * This was a set of regular expressions inside the handler, and it dropped
 * every blank cell: ADT sends one as a self-closing `<dataPreview:data/>`,
 * which `<dataPreview:data[^>]*>(.*?)</dataPreview:data>` cannot match. The
 * column came back short and every value below the first blank moved up a
 * row — onto the wrong record, with nothing in the answer to say so. Found by
 * mpauspor (#179) and anggakharisma (#180) on their own systems, because
 * nothing here had a document to test against: the corpus had no
 * `dataPreview` capture at all until this change added one.
 *
 * `I_Country` answers both cell shapes at once — 51 paired and 14
 * self-closing over 13 columns — which is why it is the one captured.
 */
const PREVIEW = corpusBody(
  'read-sql-query-with-blank-cells--01-datapreview-freestyle',
);

describe('a data preview, read from the captured document', () => {
  const preview = parseSqlPreview(PREVIEW);

  it('reads every column and every row', () => {
    assert.equal(preview.columns.length, 13);
    assert.equal(preview.rows.length, 5);
    assert.equal(preview.total_rows, 249);
    assert.deepStrictEqual(preview.columns[0], {
      name: 'COUNTRY',
      type: 'C',
      description: 'COUNTRY',
    });
  });

  /**
   * The defect itself. Andorra's row is the one to read: its
   * `ISEUROPEANUNIONMEMBER` is blank, and under the regular expression that
   * cell vanished — so every country below moved up one and `AE` took the
   * values of `AF`.
   */
  it('keeps each value on its own row, across a blank cell', () => {
    assertMatchObject(preview.rows[0], {
      COUNTRY: 'AD',
      COUNTRYTHREELETTERISOCODE: 'AND',
      COUNTRYTHREEDIGITISOCODE: '020',
      COUNTRYISOCODE: 'AD',
      ISEUROPEANUNIONMEMBER: null,
    });
    assert.deepStrictEqual(
      preview.rows.map((row) => row.COUNTRY),
      ['AD', 'AE', 'AF', 'AG', 'AI'],
    );
    // Every row carries every column, blank or not: 5 × 13 with none missing.
    for (const row of preview.rows) {
      assert.equal(Object.keys(row).length, 13);
    }
  });

  /**
   * `detail: 'full'` promises the whole parse, so the reading carries the
   * whole document beside the rows — not a hand-picked set of extra fields,
   * which is what the first two attempts at this were: one dropped
   * everything, the next named `executedQueryString` and
   * `isHanaAnalyticalView` and still dropped the column attributes.
   */
  it('carries the whole document, not a chosen few of its fields', () => {
    assert.ok(
      preview.execution_time !== undefined &&
        Math.abs(preview.execution_time - 0.316) < 10 ** -3 / 2,
    );

    const document = preview.document as any;
    const table = document['dataPreview:tableData'];
    assert.ok(
      table['dataPreview:executedQueryString'].includes(
        'SELECT * FROM I_COUNTRY',
      ),
    );
    assert.equal(table['dataPreview:isHanaAnalyticalView'], 'false');

    // The column attributes the shaped reading has no use for, and which a
    // hand-picked `full` left behind.
    const metadata = JSON.stringify(table['dataPreview:columns']);
    for (const attribute of [
      'dataPreview:keyAttribute',
      'dataPreview:colType',
      'dataPreview:isKeyFigure',
    ]) {
      assert.ok(metadata.includes(attribute));
    }
  });

  it('reports a blank cell as null rather than as an empty string', () => {
    const blanks = preview.rows.flatMap((row) =>
      Object.values(row).filter((value) => value === null),
    );
    assert.equal(blanks.length, 14);
    assert.deepStrictEqual(
      preview.rows.flatMap((row) =>
        Object.values(row).filter((value) => value === ''),
      ),
      [],
    );
  });
});

describe('what the regular expression got wrong, one case each', () => {
  const documentOf = (columns: string) =>
    `<?xml version="1.0" encoding="utf-8"?><dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview"><dataPreview:totalRows>2</dataPreview:totalRows>${columns}</dataPreview:tableData>`;

  it('matches a cell, never the dataSet that holds them', () => {
    // `<dataPreview:data[^>]*>` has no boundary after `data`, so it matched
    // the opening `<dataPreview:dataSet>` as well and read the whole block as
    // one value (#180's finding).
    const preview = parseSqlPreview(
      documentOf(
        '<dataPreview:columns><dataPreview:metadata dataPreview:name="C1" dataPreview:type="C" dataPreview:description="C1"/><dataPreview:dataSet><dataPreview:data>one</dataPreview:data><dataPreview:data>two</dataPreview:data></dataPreview:dataSet></dataPreview:columns>',
      ),
    );
    assert.deepStrictEqual(preview.rows, [{ C1: 'one' }, { C1: 'two' }]);
  });

  it('decodes what the document escaped', () => {
    // A cell is data, and data carries ampersands. The caller was handed the
    // escape.
    const preview = parseSqlPreview(
      documentOf(
        '<dataPreview:columns><dataPreview:metadata dataPreview:name="C1" dataPreview:type="C" dataPreview:description="C1"/><dataPreview:dataSet><dataPreview:data>A &amp; B</dataPreview:data><dataPreview:data>&lt;tag&gt;</dataPreview:data></dataPreview:dataSet></dataPreview:columns>',
      ),
    );
    assert.deepStrictEqual(preview.rows, [{ C1: 'A & B' }, { C1: '<tag>' }]);
  });

  it('pads a short column instead of shortening the rows after it', () => {
    // Two columns of different heights: the taller one decides, and the
    // missing cells are absent values rather than a silent re-pairing.
    const preview = parseSqlPreview(
      documentOf(
        '<dataPreview:columns><dataPreview:metadata dataPreview:name="C1" dataPreview:type="C" dataPreview:description="C1"/><dataPreview:dataSet><dataPreview:data>a</dataPreview:data><dataPreview:data>b</dataPreview:data></dataPreview:dataSet></dataPreview:columns>' +
          '<dataPreview:columns><dataPreview:metadata dataPreview:name="C2" dataPreview:type="C" dataPreview:description="C2"/><dataPreview:dataSet><dataPreview:data>x</dataPreview:data></dataPreview:dataSet></dataPreview:columns>',
      ),
    );
    assert.deepStrictEqual(preview.rows, [
      { C1: 'a', C2: 'x' },
      { C1: 'b', C2: null },
    ]);
  });

  it('answers an empty reading for a document that is not a preview', () => {
    // No columns and no rows, but the document is still carried: `full`
    // promises the parse of whatever came back, including the answer that
    // explains why there are no rows in it.
    const nothing = parseSqlPreview('<other:thing/>');
    assert.deepStrictEqual(nothing.columns, []);
    assert.deepStrictEqual(nothing.rows, []);
    assert.deepStrictEqual(nothing.document, { 'other:thing': '' });
  });
});

/**
 * The two tools over this reading, and the one thing `detail` must not do:
 * cost a caller a field.
 */
describe('detail over a data preview', () => {
  let fakeClient: any;
  // The client swapped on the module that defines createAdtClient: the
  // handler reads it at call time.
  mock.method(clients, 'createAdtClient', () => fakeClient);

  const context = { connection: {} as any, logger: undefined };
  const answerOf = async (detail?: 'terse' | 'medium' | 'full' | 'raw') => {
    fakeClient = {
      getUtils: () => ({
        getSqlQuery: async () =>
          okResponse(sqlPreview({ data: PREVIEW, status: 200 } as any)),
      }),
    };
    const result: any = await handleGetSqlQuery(context as any, {
      sql_query: 'SELECT * FROM I_Country',
      row_number: 5,
      detail,
    });
    // `raw` answers the document itself, which is text and not the JSON
    // envelope the other two levels build.
    const text = String(result.content[0].text);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  it('answers the rows with their columns on medium, the document left out', async () => {
    const medium = await answerOf('medium');
    assert.equal(medium.rows.length, 5);
    assert.equal(medium.document, undefined);
  });

  it('answers the whole parse on full', async () => {
    const full = await answerOf('full');
    assert.equal(full.rows.length, 5);
    const table = full.document['dataPreview:tableData'];
    assert.ok(
      table['dataPreview:executedQueryString'].includes(
        'SELECT * FROM I_COUNTRY',
      ),
    );
    assert.ok(
      JSON.stringify(table['dataPreview:columns']).includes(
        'dataPreview:isKeyFigure',
      ),
    );
  });

  it('answers the document on raw', async () => {
    assert.ok(String(await answerOf('raw')).includes('<dataPreview:tableData'));
  });

  // `GetTableContents` reads the same freestyle document: the rows it asked
  // for and the table's own count, not `/datapreview/ddic`'s N+1 rows and 0.
  it('GetTableContents answers the freestyle preview: its rows and its total', async () => {
    fakeClient = {
      getUtils: () => ({
        getSqlQuery: async () =>
          okResponse(sqlPreview({ data: PREVIEW, status: 200 } as any)),
      }),
    };
    // The raw arguments, untyped.
    const result: any = await handleGetTableContents(
      context as any,
      {
        table_name: 'I_Country',
        max_rows: 5,
        detail: 'medium',
      } as never,
    );
    const medium = JSON.parse(String(result.content[0].text));
    assertMatchObject(medium, {
      sql_query: 'SELECT * FROM I_Country',
      row_number: 5,
      total_rows: 249,
    });
    assert.equal(medium.rows.length, 5);
    assert.equal(medium.columns.length, 13);
  });
});
