/**
 * The six metadata handler families patch through adt-clients
 * (`patch<Type>Document`, 45.2.0): the handler names the changes, the library
 * writes them, and a refusal of the patch is the answer — a failure of the
 * step `patch`, naming the field, with nothing written.
 *
 * Each case reads a captured document (or, for the message class, the shape
 * measured on premise) and asserts every value the handler's mapping passes,
 * as the library writes it into the document sent: a field dropped from a
 * mapping leaves the document's own value and fails its assertion.
 */

import { handleCreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/high/handleUpdateDataElement';
import { handleUpdateDataElement as handleUpdateDataElementLow } from '../../handlers/data_element/low/handleUpdateDataElement';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import { handleUpdateDomain as handleUpdateDomainLow } from '../../handlers/domain/low/handleUpdateDomain';
import { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { handleUpdateMessageClass } from '../../handlers/message_class/high/handleUpdateMessageClass';
import { handleUpdatePackage } from '../../handlers/package/high/handleUpdatePackage';
import { handleUpdatePackage as handleUpdatePackageLow } from '../../handlers/package/low/handleUpdatePackage';
import { handleCreateTableType } from '../../handlers/table_type/high/handleCreateTableType';
import { handleUpdateTableType } from '../../handlers/table_type/high/handleUpdateTableType';
import { corpusBody } from '../helpers/adtCorpus';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

const DOMAIN = corpusBody('create-domain--01-ddic-domains');
const DATA_ELEMENT = corpusBody(
  'read-metadata-data-element--01-ddic-dataelements',
);
const TABLE_TYPE = corpusBody(
  'read-metadata-table-type--01-tabletypes-string_table',
);
const FUNCTION_GROUP = corpusBody(
  'read-metadata-function-group--01-groups-zmcpshrfgrp',
);
const PACKAGE = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
const MESSAGE_CLASS =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<mc:messageClass adtcore:name="ZMY_MSGS" adtcore:type="MSAG/N" adtcore:description="before" xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<mc:messages mc:msgno="000" mc:msgtext="First &amp;1" adtcore:name="ZMY_MSGS000" adtcore:description="a message"/>' +
  '</mc:messageClass>';

/** A description over every limit SAP states (40, 60). */
const LONG = 'D'.repeat(70);

/** What the fake answers, and the document the handler sent. */
function wire(document: string, high: boolean) {
  const sent: { source?: string; updates: number; unlocks: number } = {
    updates: 0,
    unlocks: 0,
  };
  fakeClient = fakeClientOf({
    validate: async () => okResponse(reading({ valid: true })),
    create: async () => okResponse(reading(undefined, '', 201)),
    lock: async () => okResponse('h'),
    readMetadata: async () =>
      okResponse(high ? reading(document, document) : document),
    updateMetadata: async (_config: unknown, options: { source: string }) => {
      sent.source = options.source;
      sent.updates += 1;
      return okResponse(high ? reading(undefined, '', 200) : undefined);
    },
    unlock: async () => {
      sent.unlocks += 1;
      return okResponse(undefined);
    },
    check: async () => okResponse(reading({ ran: true, messages: [] })),
  });
  return sent;
}

/** The element's text in the document sent. */
function textOf(document: string | undefined, tag: string): string | undefined {
  if (document === undefined) return undefined;
  const open = `<${tag}>`;
  const start = document.indexOf(open);
  if (start < 0) return document.includes(`<${tag}/>`) ? '' : undefined;
  const end = document.indexOf(`</${tag}>`, start);
  return document.slice(start + open.length, end);
}

/** The root's own `adtcore:description` in the document sent. */
function rootDescription(document: string | undefined): string | undefined {
  if (document === undefined) return undefined;
  const rootStart = document.indexOf('<', document.indexOf('?>') + 2);
  const rootEnd = document.indexOf('>', rootStart);
  const tag = document.slice(rootStart, rootEnd);
  const marker = 'adtcore:description="';
  const at = tag.indexOf(marker);
  if (at < 0) return undefined;
  return tag.slice(at + marker.length, tag.indexOf('"', at + marker.length));
}

/** The failure a tool answered. */
function failureOf(result: any): Record<string, unknown> {
  expect(result.isError).toBe(true);
  return JSON.parse(result.content[0].text);
}

describe('Domain: the handlers name the changes, adt-clients writes them', () => {
  it('CreateDomain writes its defaults and the description on the root', async () => {
    const sent = wire(DOMAIN, true);
    const result: any = await handleCreateDomain(context as any, {
      domain_name: 'zd',
      package_name: '$TMP',
      activate: false,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe('ZD');
    expect(textOf(sent.source, 'doma:datatype')).toBe('CHAR');
    expect(sent.source).toContain(
      '<doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000100</doma:length><doma:decimals>000000</doma:decimals>',
    );
    expect(textOf(sent.source, 'doma:signExists')).toBe('false');
    expect(textOf(sent.source, 'doma:lowercase')).toBe('false');
  });

  it('UpdateDomain (high) passes every field it is given', async () => {
    const sent = wire(DOMAIN, true);
    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      package_name: '$TMP',
      description: LONG,
      datatype: 'NUMC',
      length: 12,
      decimals: 2,
      conversion_exit: 'ALPHA',
      lowercase: true,
      sign_exists: true,
      value_table: 'ZTAB',
      fixed_values: [{ low: 'A', text: 'Alpha' }],
      activate: false,
    });
    expect(result.isError).toBe(false);
    // Passed as given: SAP's answer to a long one is SAP's.
    expect(rootDescription(sent.source)).toBe(LONG);
    expect(sent.source).toContain(
      '<doma:datatype>NUMC</doma:datatype><doma:length>000012</doma:length><doma:decimals>000002</doma:decimals>',
    );
    expect(textOf(sent.source, 'doma:conversionExit')).toBe('ALPHA');
    expect(textOf(sent.source, 'doma:signExists')).toBe('true');
    expect(textOf(sent.source, 'doma:lowercase')).toBe('true');
    expect(sent.source).toContain('<doma:valueTableRef adtcore:name="ZTAB"');
    expect(sent.source).toContain('<doma:low>A</doma:low>');
    expect(sent.source).toContain('<doma:text>Alpha</doma:text>');
  });

  it('UpdateDomainLow reads the bag: a length as text is a number, a flag as text a flag', async () => {
    const sent = wire(DOMAIN, false);
    const result: any = await handleUpdateDomainLow(context as any, {
      domain_name: 'zd',
      properties: {
        description: 'after',
        datatype: 'CHAR',
        length: '8',
        decimals: 0,
        conversion_exit: null,
        sign_exists: 'true',
        lowercase: false,
        value_table: 'ZTAB2',
        fixed_values: [{ low: 'X', text: 'Ex' }],
      },
      lock_handle: 'h',
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe('after');
    expect(sent.source).toContain(
      '<doma:datatype>CHAR</doma:datatype><doma:length>000008</doma:length><doma:decimals>000000</doma:decimals>',
    );
    expect(textOf(sent.source, 'doma:conversionExit')).toBe('');
    expect(textOf(sent.source, 'doma:signExists')).toBe('true');
    expect(textOf(sent.source, 'doma:lowercase')).toBe('false');
    expect(sent.source).toContain('<doma:valueTableRef adtcore:name="ZTAB2"');
    expect(sent.source).toContain('<doma:low>X</doma:low>');
  });

  it('a read that answered no document is the failure of the step patch; nothing written, the lock released', async () => {
    const sent = wire('', true);
    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'zd',
      package_name: '$TMP',
      description: 'after',
      activate: false,
    });
    const failure = failureOf(result);
    expect(failure.step).toBe('patch');
    expect(failure.code).toBe('DOCUMENT_NOT_PATCHED');
    expect(String(failure.message)).toContain('domain ZD');
    expect(sent.updates).toBe(0);
    expect(sent.unlocks).toBe(1);
  });
});

describe('Data element: the handlers name the changes, adt-clients writes them', () => {
  it('CreateDataElement writes its defaults, the domain fallback and the label lengths', async () => {
    const sent = wire(DATA_ELEMENT, true);
    const result: any = await handleCreateDataElement(context as any, {
      data_element_name: 'zde',
      package_name: '$TMP',
      type_name: 'zdom',
      short_label: 'Short',
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe('ZDE');
    expect(textOf(sent.source, 'dtel:typeKind')).toBe('domain');
    expect(textOf(sent.source, 'dtel:typeName')).toBe('ZDOM');
    expect(textOf(sent.source, 'dtel:dataType')).toBe('CHAR');
    expect(textOf(sent.source, 'dtel:dataTypeLength')).toBe('000100');
    expect(textOf(sent.source, 'dtel:dataTypeDecimals')).toBe('000000');
    expect(textOf(sent.source, 'dtel:shortFieldLabel')).toBe('Short');
    expect(textOf(sent.source, 'dtel:shortFieldLength')).toBe('05');
  });

  it('UpdateDataElement (high) passes every field it is given', async () => {
    const sent = wire(DATA_ELEMENT, true);
    const result: any = await handleUpdateDataElement(context as any, {
      data_element_name: 'zde',
      package_name: '$TMP',
      description: LONG,
      type_kind: 'predefinedAbapType',
      type_name: 'ignored_case',
      data_type: 'NUMC',
      length: 7,
      decimals: 1,
      field_label_short: '',
      field_label_medium: 'Medium',
      field_label_long: 'Long label',
      field_label_heading: 'Heading',
      search_help: 'ZSH',
      search_help_parameter: 'P1',
      set_get_parameter: 'ZPID',
      activate: false,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
    expect(textOf(sent.source, 'dtel:typeKind')).toBe('predefinedAbapType');
    expect(textOf(sent.source, 'dtel:typeName')).toBe('IGNORED_CASE');
    expect(textOf(sent.source, 'dtel:dataType')).toBe('NUMC');
    expect(textOf(sent.source, 'dtel:dataTypeLength')).toBe('000007');
    expect(textOf(sent.source, 'dtel:dataTypeDecimals')).toBe('000001');
    // An empty label: its length is the default for its kind.
    expect(textOf(sent.source, 'dtel:shortFieldLabel')).toBe('');
    expect(textOf(sent.source, 'dtel:shortFieldLength')).toBe('10');
    expect(textOf(sent.source, 'dtel:mediumFieldLabel')).toBe('Medium');
    expect(textOf(sent.source, 'dtel:mediumFieldLength')).toBe('06');
    expect(textOf(sent.source, 'dtel:longFieldLabel')).toBe('Long label');
    expect(textOf(sent.source, 'dtel:longFieldLength')).toBe('10');
    expect(textOf(sent.source, 'dtel:headingFieldLabel')).toBe('Heading');
    expect(textOf(sent.source, 'dtel:headingFieldLength')).toBe('07');
    expect(textOf(sent.source, 'dtel:searchHelp')).toBe('ZSH');
    expect(textOf(sent.source, 'dtel:searchHelpParameter')).toBe('P1');
    expect(textOf(sent.source, 'dtel:setGetParameter')).toBe('ZPID');
  });

  it('UpdateDataElementLow reads both spellings of the bag', async () => {
    const sent = wire(DATA_ELEMENT, false);
    const result: any = await handleUpdateDataElementLow(context as any, {
      data_element_name: 'zde',
      properties: {
        description: 'after',
        typeKind: 'domain',
        dataType: 'zdom2',
        length: '4',
        field_label_long: 'Long',
      },
      lock_handle: 'h',
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe('after');
    expect(textOf(sent.source, 'dtel:typeKind')).toBe('domain');
    expect(textOf(sent.source, 'dtel:typeName')).toBe('ZDOM2');
    expect(textOf(sent.source, 'dtel:dataType')).toBe('zdom2');
    expect(textOf(sent.source, 'dtel:dataTypeLength')).toBe('000004');
    expect(textOf(sent.source, 'dtel:longFieldLabel')).toBe('Long');
    expect(textOf(sent.source, 'dtel:longFieldLength')).toBe('04');
  });

  it('UpdateDataElementLow refuses a type kind SAP does not know, before anything is sent', async () => {
    const sent = wire(DATA_ELEMENT, false);
    const result: any = await handleUpdateDataElementLow(context as any, {
      data_element_name: 'zde',
      properties: { type_kind: 'table' },
      lock_handle: 'h',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('type_kind');
    expect(sent.updates).toBe(0);
  });

  it('a field the document has no place for is the failure of the step patch, naming the field', async () => {
    const without = DATA_ELEMENT.replace('<dtel:searchHelp/>', '');
    const sent = wire(without, false);
    const result: any = await handleUpdateDataElementLow(context as any, {
      data_element_name: 'zde',
      properties: { search_help: 'ZSH' },
      lock_handle: 'h',
    });
    const failure = failureOf(result);
    expect(failure.step).toBe('patch');
    expect(failure.code).toBe('DOCUMENT_NOT_PATCHED');
    expect(String(failure.message)).toContain('searchHelp');
    expect(String(failure.message)).toContain('data element ZDE');
    expect(sent.updates).toBe(0);
  });
});

describe('Table type: the handlers name the changes, adt-clients writes them', () => {
  const changes = {
    row_type_kind: 'predefinedAbapType' as const,
    row_type_name: 'ZROW',
    data_type: 'CHAR',
    length: 20,
    decimals: 0,
    access_type: 'sorted' as const,
    key_definition: 'rowType' as const,
    key_kind: 'unique' as const,
  };

  const assertWritten = (source: string | undefined) => {
    expect(textOf(source, 'ttyp:typeKind')).toBe('predefinedAbapType');
    expect(textOf(source, 'ttyp:typeName')).toBe('ZROW');
    expect(textOf(source, 'ttyp:dataType')).toBe('CHAR');
    expect(textOf(source, 'ttyp:length')).toBe('000020');
    expect(textOf(source, 'ttyp:decimals')).toBe('000000');
    expect(textOf(source, 'ttyp:accessType')).toBe('sorted');
    expect(textOf(source, 'ttyp:definition')).toBe('rowType');
    expect(textOf(source, 'ttyp:kind')).toBe('unique');
  };

  it('CreateTableType writes the name as the description by default, and every field', async () => {
    const sent = wire(TABLE_TYPE, true);
    const result: any = await handleCreateTableType(context as any, {
      table_type_name: 'ztt',
      package_name: '$TMP',
      ...changes,
      activate: false,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe('ZTT');
    assertWritten(sent.source);
  });

  it('UpdateTableType passes every field it is given', async () => {
    const sent = wire(TABLE_TYPE, true);
    const result: any = await handleUpdateTableType(context as any, {
      table_type_name: 'ztt',
      description: LONG,
      ...changes,
      activate: false,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
    assertWritten(sent.source);
  });
});

describe('Function group, package, message class: the description, as given', () => {
  it('UpdateFunctionGroup', async () => {
    const sent = wire(FUNCTION_GROUP, true);
    const result: any = await handleUpdateFunctionGroup(context as any, {
      function_group_name: 'ZMCP_SHR_FGRP',
      description: LONG,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
  });

  it('UpdatePackage (high)', async () => {
    const sent = wire(PACKAGE, true);
    const result: any = await handleUpdatePackage(context as any, {
      package_name: 'ZMCP_SHR_PKG',
      description: LONG,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
  });

  it('UpdatePackageLow', async () => {
    const sent = wire(PACKAGE, false);
    const result: any = await handleUpdatePackageLow(context as any, {
      package_name: 'ZMCP_SHR_PKG',
      updated_description: LONG,
      lock_handle: 'h',
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
  });

  it('UpdateMessageClass writes the class description, never a message one', async () => {
    const sent = wire(MESSAGE_CLASS, true);
    const result: any = await handleUpdateMessageClass(context as any, {
      message_class_name: 'zmy_msgs',
      description: LONG,
    });
    expect(result.isError).toBe(false);
    expect(rootDescription(sent.source)).toBe(LONG);
    expect(sent.source).toContain('adtcore:description="a message"');
  });

  it("UpdateMessageClass answers another type's document as the failure of the step patch, and takes no lock", async () => {
    const sent = wire(PACKAGE, true);
    const result: any = await handleUpdateMessageClass(context as any, {
      message_class_name: 'zmy_msgs',
      description: 'after',
    });
    const failure = failureOf(result);
    expect(failure.step).toBe('patch');
    expect(String(failure.message)).toContain('pak:package');
    expect(sent.updates).toBe(0);
    expect(sent.unlocks).toBe(0);
  });
});
