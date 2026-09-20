import { corpusBody } from '../../lib/adtCorpus';
import { parseSqlPreview } from '../../lib/strategies/sqlPreview';

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
    expect(preview.columns).toHaveLength(13);
    expect(preview.rows).toHaveLength(5);
    expect(preview.total_rows).toBe(249);
    expect(preview.columns[0]).toEqual({
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
    expect(preview.rows[0]).toMatchObject({
      COUNTRY: 'AD',
      COUNTRYTHREELETTERISOCODE: 'AND',
      COUNTRYTHREEDIGITISOCODE: '020',
      COUNTRYISOCODE: 'AD',
      ISEUROPEANUNIONMEMBER: null,
    });
    expect(preview.rows.map((row) => row.COUNTRY)).toEqual([
      'AD',
      'AE',
      'AF',
      'AG',
      'AI',
    ]);
    // Every row carries every column, blank or not: 5 × 13 with none missing.
    for (const row of preview.rows) {
      expect(Object.keys(row)).toHaveLength(13);
    }
  });

  /**
   * `detail: 'full'` promises the whole parse, so the parse has to hold the
   * whole document. These two fields were reachable through the generic
   * `structured` parse the slot used to carry; a reading of our own that
   * dropped them would have taken a field away while fixing a defect — which
   * it briefly did, until review caught it.
   */
  it('keeps the rest of the document, not only the rows', () => {
    expect(preview.executed_query_string).toContain('SELECT * FROM I_COUNTRY');
    expect(preview.is_hana_analytical_view).toBe(false);
    expect(preview.execution_time).toBeCloseTo(0.316, 3);
  });

  it('reports a blank cell as null rather than as an empty string', () => {
    const blanks = preview.rows.flatMap((row) =>
      Object.values(row).filter((value) => value === null),
    );
    expect(blanks).toHaveLength(14);
    expect(
      preview.rows.flatMap((row) =>
        Object.values(row).filter((value) => value === ''),
      ),
    ).toEqual([]);
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
    expect(preview.rows).toEqual([{ C1: 'one' }, { C1: 'two' }]);
  });

  it('decodes what the document escaped', () => {
    // A cell is data, and data carries ampersands. The caller was handed the
    // escape.
    const preview = parseSqlPreview(
      documentOf(
        '<dataPreview:columns><dataPreview:metadata dataPreview:name="C1" dataPreview:type="C" dataPreview:description="C1"/><dataPreview:dataSet><dataPreview:data>A &amp; B</dataPreview:data><dataPreview:data>&lt;tag&gt;</dataPreview:data></dataPreview:dataSet></dataPreview:columns>',
      ),
    );
    expect(preview.rows).toEqual([{ C1: 'A & B' }, { C1: '<tag>' }]);
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
    expect(preview.rows).toEqual([
      { C1: 'a', C2: 'x' },
      { C1: 'b', C2: null },
    ]);
  });

  it('answers an empty reading for a document that is not a preview', () => {
    expect(parseSqlPreview('<other:thing/>')).toEqual({
      columns: [],
      rows: [],
    });
  });
});

/**
 * The two tools over this reading, and the one thing `detail` must not do:
 * cost a caller a field.
 */
describe('detail over a data preview', () => {
  let fakeClient: any;
  jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

  const {
    handleGetSqlQuery,
  } = require('../../handlers/system/readonly/handleGetSqlQuery');
  const { okResponse } = require('../helpers/fakeClient');
  const { sqlPreview } = require('../../lib/strategies/sqlPreview');

  const context = { connection: {} as any, logger: undefined };
  const answerOf = async (detail?: string) => {
    fakeClient = {
      getUtils: () => ({
        getSqlQuery: async () =>
          okResponse(sqlPreview({ data: PREVIEW, status: 200 })),
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

  it('answers the acting fields on terse', async () => {
    const terse = await answerOf();
    expect(terse.rows).toHaveLength(5);
    expect(terse.executed_query_string).toBeUndefined();
  });

  it('answers the whole parse on full', async () => {
    const full = await answerOf('full');
    expect(full.rows).toHaveLength(5);
    expect(full.executed_query_string).toContain('SELECT * FROM I_COUNTRY');
    expect(full.is_hana_analytical_view).toBe(false);
  });

  it('answers the document on raw', async () => {
    expect(String(await answerOf('raw'))).toContain('<dataPreview:tableData');
  });
});
