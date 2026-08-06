import { parseSqlQueryXml } from '../../handlers/system/readonly/handleGetSqlQuery';

/**
 * The ADT Data Preview API serialises a blank cell as a self-closing
 * <dataPreview:data/>. The response is column-oriented, so a parser that skips
 * those elements produces a short column: every value after a blank shifts up
 * and is reported against the wrong row.
 */
const column = (name: string, type: string, cells: (string | null)[]) =>
  `<dataPreview:columns>` +
  `<dataPreview:metadata dataPreview:name="${name}" dataPreview:type="${type}" dataPreview:description="${name}" dataPreview:keyAttribute="false" dataPreview:colType="" dataPreview:isKeyFigure="false"/>` +
  `<dataPreview:dataSet>` +
  cells
    .map((cell) =>
      cell === null
        ? '<dataPreview:data/>'
        : `<dataPreview:data>${cell}</dataPreview:data>`,
    )
    .join('') +
  `</dataPreview:dataSet>` +
  `</dataPreview:columns>`;

const tableData = (totalRows: number, columns: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">` +
  `<dataPreview:totalRows>${totalRows}</dataPreview:totalRows>` +
  `<dataPreview:isHanaAnalyticalView>false</dataPreview:isHanaAnalyticalView>` +
  `<dataPreview:queryExecutionTime>28.3920000</dataPreview:queryExecutionTime>` +
  columns.join('') +
  `</dataPreview:tableData>`;

describe('parseSqlQueryXml', () => {
  describe('blank cells', () => {
    it('keeps values on their own row when a column starts with a blank', () => {
      const xml = tableData(3, [
        column('EBELP', 'N', ['00010', '00020', '00030']),
        column('LOEKZ', 'C', [null, 'L', null]),
      ]);

      const result = parseSqlQueryXml(xml, 'SELECT ...', 10);

      expect(result.rows).toEqual([
        { EBELP: '00010', LOEKZ: null },
        { EBELP: '00020', LOEKZ: 'L' },
        { EBELP: '00030', LOEKZ: null },
      ]);
    });

    it('keeps values on their own row when a blank sits between values', () => {
      const xml = tableData(3, [
        column('EBELP', 'N', ['00010', '00020', '00030']),
        column('LOEKZ', 'C', ['S', null, 'L']),
      ]);

      const result = parseSqlQueryXml(xml, 'SELECT ...', 10);

      expect(result.rows).toEqual([
        { EBELP: '00010', LOEKZ: 'S' },
        { EBELP: '00020', LOEKZ: null },
        { EBELP: '00030', LOEKZ: 'L' },
      ]);
    });

    it('returns null for every row of an all-blank column', () => {
      const xml = tableData(3, [
        column('EBELN', 'C', ['4200000034', '4200000034', '4200000034']),
        column('LOEKZ', 'C', [null, null, null]),
      ]);

      const result = parseSqlQueryXml(xml, 'SELECT ...', 10);

      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((row) => row.LOEKZ)).toEqual([null, null, null]);
    });

    it('does not lose rows whose trailing cells are all blank', () => {
      const xml = tableData(3, [
        column('MATNR', 'C', ['A', 'B', null]),
        column('CHARG', 'C', ['X', null, null]),
      ]);

      const result = parseSqlQueryXml(xml, 'SELECT ...', 10);

      expect(result.rows).toEqual([
        { MATNR: 'A', CHARG: 'X' },
        { MATNR: 'B', CHARG: null },
        { MATNR: null, CHARG: null },
      ]);
    });
  });

  describe('populated cells', () => {
    it('reads column metadata and values', () => {
      const xml = tableData(2, [
        column('EBELN', 'C', ['4200000034', '4200000035']),
        column('LOEKZ', 'C', ['L', 'S']),
      ]);

      const result = parseSqlQueryXml(xml, 'SELECT ...', 10);

      expect(result.total_rows).toBe(2);
      expect(result.columns.map((col) => col.name)).toEqual(['EBELN', 'LOEKZ']);
      expect(result.rows).toEqual([
        { EBELN: '4200000034', LOEKZ: 'L' },
        { EBELN: '4200000035', LOEKZ: 'S' },
      ]);
    });
  });
});
