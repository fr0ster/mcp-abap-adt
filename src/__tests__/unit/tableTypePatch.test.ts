import { corpusBody } from '../../lib/adtCorpus';
import {
  patchTableTypeXml,
  readTableTypeDefinition,
} from '../../lib/strategies/tableTypePatch';
import { readStoredDefinition } from '../../lib/strategies/tableTypeStored';
import { XmlPatchError } from '../../lib/strategies/xmlPatch';

/**
 * The document SAP answers for STRING_TABLE, byte for byte (the corpus
 * fixture): root description, a package reference with a description of its
 * own, and the value lists every ttyp answer carries.
 */
const TABLE_TYPE = corpusBody(
  'read-metadata-table-type--01-tabletypes-string_table',
);

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
      'adtcore:description="Tabelle von Strings"',
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
      { key_definition: 'keyComponents' },
      '<ttyp:definition>standard</ttyp:definition>',
      '<ttyp:definition>keyComponents</ttyp:definition>',
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

  it('changes the description of the root and of nothing else with a description', () => {
    const out = patchTableTypeXml(TABLE_TYPE, { description: 'after' });
    expect(out).toBe(
      changing(
        'adtcore:description="Tabelle von Strings"',
        'adtcore:description="after"',
      ),
    );
    expect(out).toContain(
      'adtcore:name="SOOL" adtcore:description="Object-Oriented Basis Classes"',
    );
    expect(out).toContain('adtcore:descriptionTextLimit="60"');
    expect(out.match(/ttyp:description=""/g)).toHaveLength(
      TABLE_TYPE.match(/ttyp:description=""/g)?.length ?? -1,
    );
  });

  it.each([
    ['row_type_kind', { row_type_kind: 'dictionaryType' }],
    ['row_type_name', { row_type_name: 'MARA' }],
    ['data_type', { data_type: 'CHAR' }],
    ['length', { length: 10 }],
    ['decimals', { decimals: 2 }],
    ['access_type', { access_type: 'sorted' }],
    ['key_definition', { key_definition: 'rowType' }],
    ['key_kind', { key_kind: 'unique' }],
  ])('%s: the value lists SAP sends are left as they are', (_name, changes) => {
    const valueHelps = (xml: string) =>
      xml.slice(xml.indexOf('<ttyp:valueHelps>'));
    expect(valueHelps(patchTableTypeXml(TABLE_TYPE, changes))).toBe(
      valueHelps(TABLE_TYPE),
    );
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

describe('reading the definition a table type document states', () => {
  it('reads each element patchTableTypeXml writes, as SAP wrote it', () => {
    expect(readTableTypeDefinition(TABLE_TYPE)).toEqual({
      row_type_kind: 'predefinedAbapType',
      row_type_name: '',
      data_type: 'STRING',
      length: '000000',
      decimals: '000000',
      access_type: 'standard',
      key_definition: 'standard',
      key_kind: 'nonUnique',
    });
  });

  it('reads back what a patch wrote', () => {
    const patched = patchTableTypeXml(TABLE_TYPE, {
      row_type_kind: 'dictionaryType',
      row_type_name: 'MARA',
      access_type: 'hashed',
      key_definition: 'rowType',
      key_kind: 'unique',
    });
    expect(readTableTypeDefinition(patched)).toMatchObject({
      row_type_kind: 'dictionaryType',
      row_type_name: 'MARA',
      access_type: 'hashed',
      key_definition: 'rowType',
      key_kind: 'unique',
    });
  });

  it('leaves out an element the document does not hold', () => {
    const without = TABLE_TYPE.replace(
      '<ttyp:accessType>standard</ttyp:accessType>',
      '',
    );
    const read = readTableTypeDefinition(without);
    expect(read).toBeDefined();
    expect(read).not.toHaveProperty('access_type');
    expect(read?.key_kind).toBe('nonUnique');
  });

  it.each([
    ['an empty body', ''],
    ['text that is not XML', 'not xml'],
    [
      'another document',
      '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message>refused</message></exc:exception>',
    ],
  ])('answers undefined for %s', (_what, document) => {
    expect(readTableTypeDefinition(document)).toBeUndefined();
  });
});

describe('reading the stored definition from the wait', () => {
  it("says it was not read when the read throws, with the throw's answer", async () => {
    const said = await readStoredDefinition(async () => {
      throw new Error('socket hang up');
    }, 'terse');
    expect(said).toEqual({
      stored_definition_not_read: {
        error: 'client_threw',
        message: 'socket hang up',
        step: 'read stored definition',
      },
    });
  });
});
