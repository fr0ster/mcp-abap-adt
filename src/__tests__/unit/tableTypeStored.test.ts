import { patchTableTypeDocument } from '@mcp-abap-adt/adt-clients';
import {
  readStoredDefinition,
  readTableTypeDefinition,
} from '../../lib/strategies/tableTypeStored';
import { corpusBody } from '../helpers/adtCorpus';

/**
 * The document SAP answers for STRING_TABLE, byte for byte (the corpus
 * fixture): root description, a package reference with a description of its
 * own, and the value lists every ttyp answer carries.
 */
const TABLE_TYPE = corpusBody(
  'read-metadata-table-type--01-tabletypes-string_table',
);

describe('reading the definition a table type document states', () => {
  it('reads each element the table-type writes change, as SAP wrote it', () => {
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
    const patched = patchTableTypeDocument(TABLE_TYPE, {
      rowTypeKind: 'dictionaryType',
      rowTypeName: 'MARA',
      accessType: 'hashed',
      keyDefinition: 'rowType',
      keyKind: 'unique',
    });
    if (!patched.ok) throw new Error(`patch refused: ${patched.refusal.kind}`);
    expect(readTableTypeDefinition(patched.document)).toMatchObject({
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

describe('reading the stored definition', () => {
  it("says it was not read when the read throws, with the throw's answer and the version", async () => {
    const said = await readStoredDefinition(
      async () => {
        throw new Error('socket hang up');
      },
      'active',
      'terse',
    );
    expect(said).toEqual({
      stored_version: 'active',
      stored_definition_not_read: {
        error: 'client_threw',
        message: 'socket hang up',
        step: 'read stored definition',
      },
    });
  });
});
