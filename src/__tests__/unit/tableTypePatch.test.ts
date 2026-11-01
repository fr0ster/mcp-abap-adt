import { patchTableTypeXml } from '../../lib/strategies/tableTypePatch';
import { XmlPatchError } from '../../lib/strategies/xmlPatch';

/** The document ADT answers for a table type, as `getTypeInfo.test.ts` has it. */
const TABLE_TYPE = `<?xml version="1.0" encoding="utf-8"?>
<ttyp:tableType adtcore:name="STRING_TABLE" adtcore:type="TTYP/DA" adtcore:description="before" adtcore:masterLanguage="EN" abapLanguageVersion="standard" xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/sool" adtcore:type="DEVC/K" adtcore:name="SOOL"/>
  <ttyp:rowType>
    <ttyp:typeKind>predefinedAbapType</ttyp:typeKind>
    <ttyp:typeName/>
    <ttyp:builtInType>
      <ttyp:dataType>STRING</ttyp:dataType>
      <ttyp:length>000000</ttyp:length>
      <ttyp:decimals>000000</ttyp:decimals>
    </ttyp:builtInType>
  </ttyp:rowType>
  <ttyp:accessType>standard</ttyp:accessType>
  <ttyp:primaryKey ttyp:isVisible="true">
    <ttyp:definition>standard</ttyp:definition>
    <ttyp:kind>nonUnique</ttyp:kind>
  </ttyp:primaryKey>
</ttyp:tableType>`;

/** The document with one exact piece replaced: what a single patch must equal. */
const changing = (from: string, to: string): string => {
  expect(TABLE_TYPE).toContain(from);
  return TABLE_TYPE.replace(from, to);
};

describe('patching a table type changes what was asked and nothing else', () => {
  it('returns an equal document for an empty change set', () => {
    expect(patchTableTypeXml(TABLE_TYPE, {})).toBe(TABLE_TYPE);
  });

  it.each([
    [
      'description',
      { description: 'after' },
      'adtcore:description="before"',
      'adtcore:description="after"',
    ],
    [
      'row_type_kind',
      { row_type_kind: 'dictionaryType' },
      '<ttyp:typeKind>predefinedAbapType</ttyp:typeKind>',
      '<ttyp:typeKind>dictionaryType</ttyp:typeKind>',
    ],
    [
      'row_type_name',
      { row_type_name: 'MARA' },
      '<ttyp:typeName/>',
      '<ttyp:typeName>MARA</ttyp:typeName>',
    ],
    [
      'data_type',
      { data_type: 'CHAR' },
      '<ttyp:dataType>STRING</ttyp:dataType>',
      '<ttyp:dataType>CHAR</ttyp:dataType>',
    ],
    [
      'length',
      { length: 10 },
      '<ttyp:length>000000</ttyp:length>',
      '<ttyp:length>10</ttyp:length>',
    ],
    [
      'decimals as text',
      { decimals: '2' },
      '<ttyp:decimals>000000</ttyp:decimals>',
      '<ttyp:decimals>2</ttyp:decimals>',
    ],
    [
      'access_type',
      { access_type: 'sorted' },
      '<ttyp:accessType>standard</ttyp:accessType>',
      '<ttyp:accessType>sorted</ttyp:accessType>',
    ],
    [
      'key_definition',
      { key_definition: 'componentList' },
      '<ttyp:definition>standard</ttyp:definition>',
      '<ttyp:definition>componentList</ttyp:definition>',
    ],
    [
      'key_kind',
      { key_kind: 'unique' },
      '<ttyp:kind>nonUnique</ttyp:kind>',
      '<ttyp:kind>unique</ttyp:kind>',
    ],
  ])('%s: only that element changes', (_name, changes, from, to) => {
    expect(patchTableTypeXml(TABLE_TYPE, changes)).toBe(changing(from, to));
  });

  it('truncates a description to 60 characters', () => {
    const out = patchTableTypeXml(TABLE_TYPE, { description: 'x'.repeat(70) });
    expect(out).toContain(`adtcore:description="${'x'.repeat(60)}"`);
  });

  it('clears a value given as an empty string', () => {
    const out = patchTableTypeXml(TABLE_TYPE, { data_type: '' });
    expect(out).toContain('<ttyp:dataType/>');
  });

  it('changes several properties together and keeps the rest', () => {
    const out = patchTableTypeXml(TABLE_TYPE, {
      access_type: 'hashed',
      key_kind: 'unique',
    });
    expect(out).toBe(
      changing(
        '<ttyp:accessType>standard</ttyp:accessType>',
        '<ttyp:accessType>hashed</ttyp:accessType>',
      ).replace(
        '<ttyp:kind>nonUnique</ttyp:kind>',
        '<ttyp:kind>unique</ttyp:kind>',
      ),
    );
  });

  it('refuses a document without the element to change', () => {
    expect(() =>
      patchTableTypeXml('<ttyp:tableType/>', { access_type: 'sorted' }),
    ).toThrow(XmlPatchError);
  });
});
