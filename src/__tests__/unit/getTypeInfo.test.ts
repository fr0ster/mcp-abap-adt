/**
 * `GetTypeInfo` reads a type name as every DDIC kind (#321) — data element,
 * domain, structure, table type, in that alphabetical order — each through its
 * adt-clients member, and answers every kind the name is. The real client over
 * a connection double that answers by URL: the requests on the wire are the
 * members', a `404` is the kind's absence, any other refusal is the call's.
 *
 * The documents are E19's own (2026-10-24, SAP-delivered objects), trimmed to
 * the fields read and without their author attributes.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetTypeInfo } from '../../handlers/system/readonly/handleGetTypeInfo';

const ADTCORE = 'xmlns:adtcore="http://www.sap.com/adt/core"';

const MANDT_DATA_ELEMENT = `<?xml version="1.0" encoding="utf-8"?>
<blue:wbobj adtcore:name="MANDT" adtcore:type="DTEL/DE" adtcore:description="Mandant" xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" ${ADTCORE}>
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/szs" adtcore:type="DEVC/K" adtcore:name="SZS"/>
  <dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements">
    <dtel:typeKind>domain</dtel:typeKind>
    <dtel:typeName>MANDT</dtel:typeName>
    <dtel:dataType>CLNT</dtel:dataType>
    <dtel:dataTypeLength>000003</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>Mandant</dtel:shortFieldLabel>
    <dtel:mediumFieldLabel>Mandant</dtel:mediumFieldLabel>
    <dtel:longFieldLabel>Mandant</dtel:longFieldLabel>
    <dtel:headingFieldLabel>Mdt</dtel:headingFieldLabel>
  </dtel:dataElement>
</blue:wbobj>`;

const MANDT_DOMAIN = `<?xml version="1.0" encoding="utf-8"?>
<doma:domain adtcore:name="MANDT" adtcore:type="DOMA/DD" adtcore:description="Mandant (Schluesselfeld in mandantenabh. Tabellen)" xmlns:doma="http://www.sap.com/dictionary/domain" ${ADTCORE}>
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/sabp_legacy" adtcore:type="DEVC/K" adtcore:name="SABP_LEGACY"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>CLNT</doma:datatype>
      <doma:length>000003</doma:length>
      <doma:decimals>000000</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>000003</doma:length>
      <doma:style>00</doma:style>
      <doma:conversionExit/>
      <doma:signExists>false</doma:signExists>
      <doma:lowercase>false</doma:lowercase>
    </doma:outputInformation>
    <doma:valueInformation>
      <doma:valueTableRef adtcore:uri="/sap/bc/adt/ddic/tables/t000" adtcore:type="TABL/DT" adtcore:name="T000"/>
      <doma:appendExists>false</doma:appendExists>
      <doma:fixValues/>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;

const XFELD_DOMAIN = `<?xml version="1.0" encoding="utf-8"?>
<doma:domain adtcore:name="XFELD" adtcore:type="DOMA/DD" xmlns:doma="http://www.sap.com/dictionary/domain" ${ADTCORE}>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>CHAR</doma:datatype>
      <doma:length>000001</doma:length>
      <doma:decimals>000000</doma:decimals>
    </doma:typeInformation>
    <doma:valueInformation>
      <doma:valueTableRef/>
      <doma:fixValues>
        <doma:fixValue><doma:position>0001</doma:position><doma:low>X</doma:low><doma:high/><doma:text>Ja</doma:text></doma:fixValue>
        <doma:fixValue><doma:position>0002</doma:position><doma:low/><doma:high/><doma:text>Nein</doma:text></doma:fixValue>
      </doma:fixValues>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;

const SYST_STRUCTURE = `<?xml version="1.0" encoding="utf-8"?>
<blue:blueSource abapsource:sourceUri="./syst/source/main" adtcore:name="SYST" adtcore:type="TABL/DS" adtcore:description="ABAP-Systemfelder" xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:abapsource="http://www.sap.com/adt/abapsource" ${ADTCORE}>
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/sabp_types" adtcore:type="DEVC/K" adtcore:name="SABP_TYPES"/>
</blue:blueSource>`;

const STRING_TABLE = `<?xml version="1.0" encoding="utf-8"?>
<ttyp:tableType adtcore:name="STRING_TABLE" adtcore:type="TTYP/DA" xmlns:ttyp="http://www.sap.com/dictionary/tabletype" ${ADTCORE}>
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

const failedWith = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, statusText: 'Refused', headers: {}, data: '' },
  });

type Sent = { url: string; headers?: Record<string, string> };

/** Answers each URL from `documents`, a number as that status, else `404`. */
function systemWith(documents: Record<string, string | number>) {
  const sent: Sent[] = [];
  const connection = {
    makeAdtRequest: jest.fn(async (request: Sent) => {
      sent.push(request);
      const answer = documents[request.url];
      if (answer === undefined) throw failedWith(404);
      if (typeof answer === 'number') throw failedWith(answer);
      return { status: 200, statusText: 'OK', headers: {}, data: answer };
    }),
  } as unknown as IAbapConnection;
  return { connection, sent };
}

const url = {
  dataElement: (n: string) => `/sap/bc/adt/ddic/dataelements/${n}`,
  domain: (n: string) => `/sap/bc/adt/ddic/domains/${n}`,
  structure: (n: string) => `/sap/bc/adt/ddic/structures/${n}`,
  tableType: (n: string) => `/sap/bc/adt/ddic/tabletypes/${n}`,
};

const run = (connection: IAbapConnection, args: Record<string, unknown>) =>
  handleGetTypeInfo({ connection, logger: undefined } as any, args) as any;

describe('GetTypeInfo', () => {
  it('reads the name as every kind, in alphabetical order, and answers every kind it is', async () => {
    const { connection, sent } = systemWith({
      [url.dataElement('mandt')]: MANDT_DATA_ELEMENT,
      [url.domain('mandt')]: MANDT_DOMAIN,
    });

    const result = await run(connection, { type_name: 'MANDT' });

    expect(sent.map((r) => r.url)).toEqual([
      url.dataElement('mandt'),
      url.domain('mandt'),
      url.structure('mandt'),
      url.tableType('mandt'),
    ]);
    expect(result.isError).toBe(false);
    const answer = result.content[0].json;
    expect(answer.name).toBe('MANDT');
    expect(answer.types.map((t: any) => t.objectType)).toEqual([
      'data_element',
      'domain',
    ]);
    expect(answer.types[0]).toEqual({
      objectType: 'data_element',
      name: 'MANDT',
      description: 'Mandant',
      package: 'SZS',
      typeKind: 'domain',
      domain: 'MANDT',
      dataType: 'CLNT',
      length: 3,
      decimals: 0,
      labels: {
        short: 'Mandant',
        medium: 'Mandant',
        long: 'Mandant',
        heading: 'Mdt',
      },
    });
    expect(answer.types[1]).toEqual({
      objectType: 'domain',
      name: 'MANDT',
      description: 'Mandant (Schluesselfeld in mandantenabh. Tabellen)',
      package: 'SABP_LEGACY',
      dataType: 'CLNT',
      length: 3,
      decimals: 0,
      output: {
        length: 3,
        conversionExit: undefined,
        lowercase: false,
        signExists: false,
      },
      valueTable: 'T000',
      fixedValues: [],
    });
  });

  it("keeps a domain's blank fixed value: XFELD's 'Nein' is the empty low, and it survives serialisation", async () => {
    const { connection } = systemWith({ [url.domain('xfeld')]: XFELD_DOMAIN });
    const answer = (await run(connection, { type_name: 'XFELD' })).content[0]
      .json;
    expect(answer.types).toHaveLength(1);
    expect(answer.types[0].fixedValues).toEqual([
      { low: 'X', high: '', text: 'Ja' },
      { low: '', high: '', text: 'Nein' },
    ]);
    // What the client receives: the blank value is there, not dropped.
    expect(JSON.parse(JSON.stringify(answer)).types[0].fixedValues[1]).toEqual({
      low: '',
      high: '',
      text: 'Nein',
    });
    expect(answer.types[0].valueTable).toBeUndefined();
  });

  it("keeps the spaces of a fixed value's bounds, which are the value", async () => {
    const SPACED = XFELD_DOMAIN.replace(
      '<doma:low>X</doma:low><doma:high/>',
      '<doma:low> </doma:low><doma:high>  B </doma:high>',
    );
    const { connection } = systemWith({ [url.domain('xfeld')]: SPACED });
    const answer = (await run(connection, { type_name: 'XFELD' })).content[0]
      .json;
    expect(answer.types[0].fixedValues[0]).toEqual({
      low: ' ',
      high: '  B ',
      text: 'Ja',
    });
  });

  it("a successful answer that is not the kind's document ends the call naming the read, instead of reading as absent", async () => {
    const { connection, sent } = systemWith({
      [url.dataElement('mandt')]: MANDT_DATA_ELEMENT,
      [url.domain('mandt')]:
        '<?xml version="1.0"?><other:thing xmlns:other="urn:x"/>',
    });
    const result = await run(connection, { type_name: 'MANDT' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: 'client_threw',
      message:
        'read domain: the system answered a document that is not a doma:domain document',
    });
    expect(sent).toHaveLength(2);
  });

  it('answers a structure from its blue:blueSource document', async () => {
    const { connection } = systemWith({
      [url.structure('syst')]: SYST_STRUCTURE,
    });
    const answer = (await run(connection, { type_name: 'SYST' })).content[0]
      .json;
    expect(answer.types).toEqual([
      {
        objectType: 'structure',
        name: 'SYST',
        description: 'ABAP-Systemfelder',
        package: 'SABP_TYPES',
      },
    ]);
  });

  it('answers a table type with its row type and key', async () => {
    const { connection } = systemWith({
      [url.tableType('string_table')]: STRING_TABLE,
    });
    const answer = (await run(connection, { type_name: 'STRING_TABLE' }))
      .content[0].json;
    expect(answer.types).toEqual([
      {
        objectType: 'table_type',
        name: 'STRING_TABLE',
        description: undefined,
        package: 'SOOL',
        rowType: {
          typeKind: 'predefinedAbapType',
          typeName: undefined,
          dataType: 'STRING',
          length: 0,
          decimals: 0,
        },
        accessType: 'standard',
        primaryKey: { definition: 'standard', kind: 'nonUnique' },
      },
    ]);
  });

  it("a name no read finds is the call's error, after every read", async () => {
    const { connection, sent } = systemWith({});
    const result = await run(connection, { type_name: 'ZZ_NOPE' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'Type ZZ_NOPE was not found as data element, domain, structure or table type.',
    );
    expect(sent).toHaveLength(4);
  });

  it('include_structure_fallback false leaves the structure read out', async () => {
    const { connection, sent } = systemWith({});
    const result = await run(connection, {
      type_name: 'ZT',
      include_structure_fallback: false,
    });
    expect(sent.map((r) => r.url)).toEqual([
      url.dataElement('zt'),
      url.domain('zt'),
      url.tableType('zt'),
    ]);
    expect(result.content[0].text).toBe(
      'Type ZT was not found as data element, domain or table type.',
    );
  });

  it('an empty answer is the kind absent, like a 404', async () => {
    const { connection } = systemWith({
      [url.dataElement('mandt')]: '',
      [url.domain('mandt')]: MANDT_DOMAIN,
    });
    const answer = (await run(connection, { type_name: 'MANDT' })).content[0]
      .json;
    expect(answer.types.map((t: any) => t.objectType)).toEqual(['domain']);
  });

  it("a refusal that is not 404 is the call's answer, with the read as its step; nothing after it is read", async () => {
    const { connection, sent } = systemWith({
      [url.dataElement('mandt')]: MANDT_DATA_ELEMENT,
      [url.domain('mandt')]: 403,
    });
    const result = await run(connection, { type_name: 'MANDT' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      status: 403,
      step: 'read domain',
    });
    expect(sent).toHaveLength(2);
  });
});
