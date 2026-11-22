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

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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
import * as clients from '../../lib/clients';
import { corpusBody } from '../helpers/adtCorpus';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

mock.method(clients, 'createAdtClient', () => fakeClient);

let fakeClient: unknown;

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
      return okResponse(reading(undefined, '', 200));
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
  assert.equal(result.isError, true);
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), 'ZD');
    assert.equal(textOf(sent.source, 'doma:datatype'), 'CHAR');
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes(
          '<doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000100</doma:length><doma:decimals>000000</doma:decimals>',
        ),
    );
    assert.equal(textOf(sent.source, 'doma:signExists'), 'false');
    assert.equal(textOf(sent.source, 'doma:lowercase'), 'false');
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
    assert.equal(result.isError, false);
    // Passed as given: SAP's answer to a long one is SAP's.
    assert.equal(rootDescription(sent.source), LONG);
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes(
          '<doma:datatype>NUMC</doma:datatype><doma:length>000012</doma:length><doma:decimals>000002</doma:decimals>',
        ),
    );
    assert.equal(textOf(sent.source, 'doma:conversionExit'), 'ALPHA');
    assert.equal(textOf(sent.source, 'doma:signExists'), 'true');
    assert.equal(textOf(sent.source, 'doma:lowercase'), 'true');
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('<doma:valueTableRef adtcore:name="ZTAB"'),
    );
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('<doma:low>A</doma:low>'),
    );
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('<doma:text>Alpha</doma:text>'),
    );
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), 'after');
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes(
          '<doma:datatype>CHAR</doma:datatype><doma:length>000008</doma:length><doma:decimals>000000</doma:decimals>',
        ),
    );
    assert.equal(textOf(sent.source, 'doma:conversionExit'), '');
    assert.equal(textOf(sent.source, 'doma:signExists'), 'true');
    assert.equal(textOf(sent.source, 'doma:lowercase'), 'false');
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('<doma:valueTableRef adtcore:name="ZTAB2"'),
    );
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('<doma:low>X</doma:low>'),
    );
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
    assert.equal(failure.step, 'patch');
    assert.equal(failure.code, 'DOCUMENT_NOT_PATCHED');
    assert.ok(String(failure.message).includes('domain ZD'));
    assert.equal(sent.updates, 0);
    assert.equal(sent.unlocks, 1);
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), 'ZDE');
    assert.equal(textOf(sent.source, 'dtel:typeKind'), 'domain');
    assert.equal(textOf(sent.source, 'dtel:typeName'), 'ZDOM');
    assert.equal(textOf(sent.source, 'dtel:dataType'), 'CHAR');
    assert.equal(textOf(sent.source, 'dtel:dataTypeLength'), '000100');
    assert.equal(textOf(sent.source, 'dtel:dataTypeDecimals'), '000000');
    assert.equal(textOf(sent.source, 'dtel:shortFieldLabel'), 'Short');
    assert.equal(textOf(sent.source, 'dtel:shortFieldLength'), '05');
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
    assert.equal(textOf(sent.source, 'dtel:typeKind'), 'predefinedAbapType');
    assert.equal(textOf(sent.source, 'dtel:typeName'), 'IGNORED_CASE');
    assert.equal(textOf(sent.source, 'dtel:dataType'), 'NUMC');
    assert.equal(textOf(sent.source, 'dtel:dataTypeLength'), '000007');
    assert.equal(textOf(sent.source, 'dtel:dataTypeDecimals'), '000001');
    // An empty label: its length is the default for its kind.
    assert.equal(textOf(sent.source, 'dtel:shortFieldLabel'), '');
    assert.equal(textOf(sent.source, 'dtel:shortFieldLength'), '10');
    assert.equal(textOf(sent.source, 'dtel:mediumFieldLabel'), 'Medium');
    assert.equal(textOf(sent.source, 'dtel:mediumFieldLength'), '06');
    assert.equal(textOf(sent.source, 'dtel:longFieldLabel'), 'Long label');
    assert.equal(textOf(sent.source, 'dtel:longFieldLength'), '10');
    assert.equal(textOf(sent.source, 'dtel:headingFieldLabel'), 'Heading');
    assert.equal(textOf(sent.source, 'dtel:headingFieldLength'), '07');
    assert.equal(textOf(sent.source, 'dtel:searchHelp'), 'ZSH');
    assert.equal(textOf(sent.source, 'dtel:searchHelpParameter'), 'P1');
    assert.equal(textOf(sent.source, 'dtel:setGetParameter'), 'ZPID');
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), 'after');
    assert.equal(textOf(sent.source, 'dtel:typeKind'), 'domain');
    assert.equal(textOf(sent.source, 'dtel:typeName'), 'ZDOM2');
    assert.equal(textOf(sent.source, 'dtel:dataType'), 'zdom2');
    assert.equal(textOf(sent.source, 'dtel:dataTypeLength'), '000004');
    assert.equal(textOf(sent.source, 'dtel:longFieldLabel'), 'Long');
    assert.equal(textOf(sent.source, 'dtel:longFieldLength'), '04');
  });

  it('UpdateDataElementLow refuses a type kind SAP does not know, before anything is sent', async () => {
    const sent = wire(DATA_ELEMENT, false);
    const result: any = await handleUpdateDataElementLow(context as any, {
      data_element_name: 'zde',
      properties: { type_kind: 'table' },
      lock_handle: 'h',
    });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('type_kind'));
    assert.equal(sent.updates, 0);
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
    assert.equal(failure.step, 'patch');
    assert.equal(failure.code, 'DOCUMENT_NOT_PATCHED');
    assert.ok(String(failure.message).includes('searchHelp'));
    assert.ok(String(failure.message).includes('data element ZDE'));
    assert.equal(sent.updates, 0);
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
    assert.equal(textOf(source, 'ttyp:typeKind'), 'predefinedAbapType');
    assert.equal(textOf(source, 'ttyp:typeName'), 'ZROW');
    assert.equal(textOf(source, 'ttyp:dataType'), 'CHAR');
    assert.equal(textOf(source, 'ttyp:length'), '000020');
    assert.equal(textOf(source, 'ttyp:decimals'), '000000');
    assert.equal(textOf(source, 'ttyp:accessType'), 'sorted');
    assert.equal(textOf(source, 'ttyp:definition'), 'rowType');
    assert.equal(textOf(source, 'ttyp:kind'), 'unique');
  };

  it('CreateTableType writes the name as the description by default, and every field', async () => {
    const sent = wire(TABLE_TYPE, true);
    const result: any = await handleCreateTableType(context as any, {
      table_type_name: 'ztt',
      package_name: '$TMP',
      ...changes,
      activate: false,
    });
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), 'ZTT');
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
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
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
  });

  it('UpdatePackage (high)', async () => {
    const sent = wire(PACKAGE, true);
    const result: any = await handleUpdatePackage(context as any, {
      package_name: 'ZMCP_SHR_PKG',
      description: LONG,
    });
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
  });

  it('UpdatePackageLow', async () => {
    const sent = wire(PACKAGE, false);
    const result: any = await handleUpdatePackageLow(context as any, {
      package_name: 'ZMCP_SHR_PKG',
      updated_description: LONG,
      lock_handle: 'h',
    });
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
  });

  it('UpdateMessageClass writes the class description, never a message one', async () => {
    const sent = wire(MESSAGE_CLASS, true);
    const result: any = await handleUpdateMessageClass(context as any, {
      message_class_name: 'zmy_msgs',
      description: LONG,
    });
    assert.equal(result.isError, false);
    assert.equal(rootDescription(sent.source), LONG);
    assert.ok(
      sent.source !== undefined &&
        sent.source.includes('adtcore:description="a message"'),
    );
  });

  it("UpdateMessageClass answers another type's document as the failure of the step patch, and takes no lock", async () => {
    const sent = wire(PACKAGE, true);
    const result: any = await handleUpdateMessageClass(context as any, {
      message_class_name: 'zmy_msgs',
      description: 'after',
    });
    const failure = failureOf(result);
    assert.equal(failure.step, 'patch');
    assert.ok(String(failure.message).includes('pak:package'));
    assert.equal(sent.updates, 0);
    assert.equal(sent.unlocks, 0);
  });
});
