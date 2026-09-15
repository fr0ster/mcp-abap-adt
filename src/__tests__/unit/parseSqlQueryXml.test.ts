/**
 * Unit tests for the ADT data preview parser.
 *
 * The primary fixture is a VERBATIM capture from a 7.5x system of
 *   SELECT FIELDNAME, CHECKTABLE FROM DD03L WHERE TABNAME = 'E070'
 * It is the minimal real payload that exhibits the alignment bug: eight of the
 * nine CHECKTABLE cells are empty, and SAP emits each of them as a
 * self-closing <dataPreview:data/>.
 */

import { parseSqlQueryXml } from '../../handlers/system/readonly/handleGetSqlQuery';

/** Verbatim server response — do not reformat; the self-closing <data/> elements are the point. */
const DD03L_PAYLOAD = `<?xml version="1.0" encoding="utf-8"?><dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview"><dataPreview:totalRows>9</dataPreview:totalRows><dataPreview:isHanaAnalyticalView>false</dataPreview:isHanaAnalyticalView><dataPreview:executedQueryString>SELECT FIELDNAME, CHECKTABLE FROM DD03L WHERE TABNAME = 'E070'   INTO     TABLE @DATA(LT_RESULT)   UP TO 15  ROWS   .</dataPreview:executedQueryString><dataPreview:queryExecutionTime>8.5520000</dataPreview:queryExecutionTime><dataPreview:columns><dataPreview:metadata dataPreview:name="FIELDNAME" dataPreview:type="C" dataPreview:description="FIELDNAME" dataPreview:keyAttribute="false" dataPreview:colType="" dataPreview:isKeyFigure="false"/><dataPreview:dataSet><dataPreview:data>AS4USER</dataPreview:data><dataPreview:data>AS4DATE</dataPreview:data><dataPreview:data>AS4TIME</dataPreview:data><dataPreview:data>TRKORR</dataPreview:data><dataPreview:data>TRFUNCTION</dataPreview:data><dataPreview:data>KORRDEV</dataPreview:data><dataPreview:data>TRSTATUS</dataPreview:data><dataPreview:data>TARSYSTEM</dataPreview:data><dataPreview:data>STRKORR</dataPreview:data></dataPreview:dataSet></dataPreview:columns><dataPreview:columns><dataPreview:metadata dataPreview:name="CHECKTABLE" dataPreview:type="C" dataPreview:description="CHECKTABLE" dataPreview:keyAttribute="false" dataPreview:colType="" dataPreview:isKeyFigure="false"/><dataPreview:dataSet><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data/><dataPreview:data>E070</dataPreview:data></dataPreview:dataSet></dataPreview:columns></dataPreview:tableData>`;

function buildPayload(
  columns: Array<{ name: string; type?: string; values: string[] }>,
): string {
  const blocks = columns
    .map(
      ({ name, type = 'C', values }) =>
        `<dataPreview:columns><dataPreview:metadata dataPreview:name="${name}" dataPreview:type="${type}" dataPreview:description="${name}"/><dataPreview:dataSet>${values
          .map((value) =>
            value === ''
              ? '<dataPreview:data/>'
              : `<dataPreview:data>${value}</dataPreview:data>`,
          )
          .join('')}</dataPreview:dataSet></dataPreview:columns>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?><dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview"><dataPreview:totalRows>${columns[0]?.values.length ?? 0}</dataPreview:totalRows><dataPreview:queryExecutionTime>1.0</dataPreview:queryExecutionTime>${blocks}</dataPreview:tableData>`;
}

describe('parseSqlQueryXml', () => {
  describe('row alignment with empty cells', () => {
    const result = parseSqlQueryXml(DD03L_PAYLOAD, 'SELECT ...', 15);

    it('returns every row', () => {
      expect(result.rows).toHaveLength(9);
      expect(result.total_rows).toBe(9);
    });

    it('attributes CHECKTABLE=E070 to STRKORR, not to the first row', () => {
      // The whole bug in one assertion: the single non-empty value belongs to
      // the last row. A parser that drops self-closing <data/> puts it first.
      const strkorr = result.rows.find((row) => row.FIELDNAME === 'STRKORR');
      expect(strkorr?.CHECKTABLE).toBe('E070');

      const as4user = result.rows.find((row) => row.FIELDNAME === 'AS4USER');
      expect(as4user?.CHECKTABLE).toBe('');
    });

    it('keeps FIELDNAME in its original order', () => {
      expect(result.rows.map((row) => row.FIELDNAME)).toEqual([
        'AS4USER',
        'AS4DATE',
        'AS4TIME',
        'TRKORR',
        'TRFUNCTION',
        'KORRDEV',
        'TRSTATUS',
        'TARSYSTEM',
        'STRKORR',
      ]);
    });

    it('represents an empty cell as an empty string rather than null', () => {
      expect(result.rows.slice(0, 8).map((row) => row.CHECKTABLE)).toEqual(
        Array(8).fill(''),
      );
    });

    it('reports no warnings for a well-formed payload', () => {
      expect(result.warnings).toBeUndefined();
    });

    it('exposes the statement SAP actually executed', () => {
      expect(result.executed_query).toContain(
        'INTO     TABLE @DATA(LT_RESULT)',
      );
      expect(result.executed_query).toContain('UP TO 15  ROWS');
    });

    it('reads column metadata', () => {
      expect(result.columns).toEqual([
        {
          name: 'FIELDNAME',
          key: 'FIELDNAME',
          type: 'C',
          description: 'FIELDNAME',
          length: undefined,
        },
        {
          name: 'CHECKTABLE',
          key: 'CHECKTABLE',
          type: 'C',
          description: 'CHECKTABLE',
          length: undefined,
        },
      ]);
    });
  });

  describe('duplicate column names', () => {
    // A JOIN over E070/E071 returns TRKORR twice; keying by name alone makes
    // the second column overwrite the first and silently halves the result.
    const payload = buildPayload([
      { name: 'TRKORR', values: ['DESK1', 'DESK2'] },
      { name: 'TRKORR', values: ['TASK1', 'TASK2'] },
      { name: 'TRKORR', values: ['SUB1', 'SUB2'] },
    ]);
    const result = parseSqlQueryXml(payload, 'SELECT ...', 10);

    it('disambiguates rather than overwriting', () => {
      expect(result.rows[0]).toEqual({
        TRKORR: 'DESK1',
        TRKORR_2: 'TASK1',
        TRKORR_3: 'SUB1',
      });
    });

    it('reports the original name alongside the key', () => {
      expect(result.columns.map((column) => [column.name, column.key])).toEqual(
        [
          ['TRKORR', 'TRKORR'],
          ['TRKORR', 'TRKORR_2'],
          ['TRKORR', 'TRKORR_3'],
        ],
      );
    });

    it('warns about the collision', () => {
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings?.[0]).toContain('TRKORR_2');
    });
  });

  describe('value fidelity', () => {
    it('keeps NUMC values as zero-padded strings', () => {
      const payload = buildPayload([
        { name: 'POSITION', type: 'N', values: ['0001', '0010'] },
      ]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.rows.map((row) => row.POSITION)).toEqual(['0001', '0010']);
    });

    it('keeps "0" instead of turning it into null', () => {
      const payload = buildPayload([{ name: 'FLAG', values: ['0', '1', '0'] }]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.rows.map((row) => row.FLAG)).toEqual(['0', '1', '0']);
    });

    it('decodes XML entities', () => {
      const payload = buildPayload([
        { name: 'TEXT', values: ['A &amp; B', '&lt;tag&gt;'] },
      ]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.rows.map((row) => row.TEXT)).toEqual(['A & B', '<tag>']);
    });
  });

  describe('degenerate payloads', () => {
    it('handles a single row without collapsing the array', () => {
      const payload = buildPayload([
        { name: 'FIELDNAME', values: ['STRKORR'] },
        { name: 'CHECKTABLE', values: ['E070'] },
      ]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.rows).toEqual([
        { FIELDNAME: 'STRKORR', CHECKTABLE: 'E070' },
      ]);
    });

    it('handles an empty result set', () => {
      const payload = buildPayload([{ name: 'FIELDNAME', values: [] }]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.rows).toEqual([]);
      expect(result.columns).toHaveLength(1);
    });

    it('warns when columns disagree on row count', () => {
      const payload = buildPayload([
        { name: 'A', values: ['1', '2', '3'] },
        { name: 'B', values: ['x'] },
      ]);
      const result = parseSqlQueryXml(payload, 'SELECT ...', 10);
      expect(result.warnings?.join(' ')).toContain('misaligned');
      expect(result.rows[2]).toEqual({ A: '3', B: null });
    });

    it('reports a parse failure instead of returning a plausible empty table', () => {
      const result: any = parseSqlQueryXml('not xml at all', 'SELECT ...', 10);
      expect(result.error).toContain('Failed to parse');
    });
  });
});
