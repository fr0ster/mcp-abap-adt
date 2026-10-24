/**
 * `GetTypeInfo` tries a type name as a data element, a table type, the
 * repository's object properties of a domain and a structure, in that order, each through its adt-clients member (#235). The real client over a
 * connection double: the requests on the wire are the members', a `404` or an
 * empty answer moves on, and the first usable answer is the call's.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetTypeInfo } from '../../handlers/system/readonly/handleGetTypeInfo';

const DATA_ELEMENT = `<?xml version="1.0" encoding="utf-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" adtcore:name="ZDE_AMOUNT" adtcore:description="An amount">
  <adtcore:packageRef adtcore:name="ZPKG"/>
  <dtel:dataElement>
    <dtel:typeName>ZDO_AMOUNT</dtel:typeName>
    <dtel:dataType>CURR</dtel:dataType>
    <dtel:dataTypeLength>15</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>2</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>Amount</dtel:shortFieldLabel>
  </dtel:dataElement>
</blue:wbobj>`;

const OBJECT_PROPERTIES = `<?xml version="1.0" encoding="utf-8"?>
<opr:objectProperties xmlns:opr="http://www.sap.com/adt/objectproperties">
  <opr:object name="ZDO_AMOUNT" text="An amount domain" package="ZPKG" type="DOMA/DD"/>
</opr:objectProperties>`;

const notFound = () =>
  Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404, statusText: 'Not Found', headers: {}, data: '' },
  });

type Sent = { url: string; headers?: Record<string, string> };

/** Answers `found` for a URL that `answers` picks, `404` for every other. */
function connectionWhere(answers: (url: string) => string | undefined) {
  const sent: Sent[] = [];
  const connection = {
    makeAdtRequest: jest.fn(async (request: Sent) => {
      sent.push(request);
      const data = answers(request.url);
      if (data === undefined) throw notFound();
      return { status: 200, statusText: 'OK', headers: {}, data };
    }),
  } as unknown as IAbapConnection;
  return { connection, sent };
}

describe('GetTypeInfo', () => {
  it('answers the first usable lookup, here the data element', async () => {
    const { connection, sent } = connectionWhere((url) =>
      url === '/sap/bc/adt/ddic/dataelements/zde_amount'
        ? DATA_ELEMENT
        : undefined,
    );

    const result: any = await handleGetTypeInfo(
      { connection, logger: undefined } as any,
      { type_name: 'ZDE_AMOUNT' },
    );

    expect(result.isError).toBe(false);
    expect(sent.map((r) => r.url)).toEqual([
      '/sap/bc/adt/ddic/dataelements/zde_amount',
    ]);
    expect(result.content[0].json).toMatchObject({
      name: 'ZDE_AMOUNT',
      objectType: 'data_element',
      dataType: 'CURR',
      length: 15,
      decimals: 2,
      domain: 'ZDO_AMOUNT',
      package: 'ZPKG',
    });
  });

  it('asks every lookup in order, and the structure last, before saying the name is unknown', async () => {
    const { connection, sent } = connectionWhere(() => undefined);

    const result: any = await handleGetTypeInfo(
      { connection, logger: undefined } as any,
      { type_name: 'ZT' },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ZT was not found');
    expect(sent.map((r) => r.url)).toEqual([
      '/sap/bc/adt/ddic/dataelements/zt',
      '/sap/bc/adt/ddic/tabletypes/zt',
      `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${encodeURIComponent('/sap/bc/adt/ddic/domains/zt')}`,
      '/sap/bc/adt/ddic/structures/zt',
    ]);
  });

  it('leaves the structure out when include_structure_fallback is false', async () => {
    const { connection, sent } = connectionWhere(() => undefined);

    await handleGetTypeInfo({ connection, logger: undefined } as any, {
      type_name: 'ZT',
      include_structure_fallback: false,
    });

    expect(sent.map((r) => r.url)).not.toContain(
      '/sap/bc/adt/ddic/structures/zt',
    );
    expect(sent).toHaveLength(3);
  });

  it('an empty answer moves on, like a 404', async () => {
    const { connection, sent } = connectionWhere((url) =>
      url === '/sap/bc/adt/ddic/dataelements/zde_amount'
        ? ''
        : url ===
            `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${encodeURIComponent('/sap/bc/adt/ddic/domains/zde_amount')}`
          ? OBJECT_PROPERTIES
          : undefined,
    );

    const result: any = await handleGetTypeInfo(
      { connection, logger: undefined } as any,
      { type_name: 'ZDE_AMOUNT' },
    );

    expect(result.isError).toBe(false);
    expect(sent).toHaveLength(3);
    expect(result.content[0].json).toMatchObject({
      name: 'ZDO_AMOUNT',
      objectType: 'domain',
    });
  });

  it("does not read a domain's metadata: MANDT, a domain and a data element, answers as the data element", async () => {
    const { connection, sent } = connectionWhere((url) =>
      url === '/sap/bc/adt/ddic/dataelements/mandt' ? DATA_ELEMENT : undefined,
    );

    await handleGetTypeInfo({ connection, logger: undefined } as any, {
      type_name: 'MANDT',
    });

    expect(sent.map((r) => r.url)).not.toContain(
      '/sap/bc/adt/ddic/domains/mandt',
    );
  });
});
