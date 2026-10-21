/**
 * GetTransaction: one `getObjectProperties` read of the transaction's
 * workbench uri, answered as the object and its facets. The document is the
 * shape measured on premise (BASIS 816, 2026-10-21), values sanitised.
 */
const getObjectProperties = jest.fn();

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getUtils: () => ({ getObjectProperties }),
  }),
}));

import { analyseObjectProperties } from '@mcp-abap-adt/adt-strategies';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import {
  handleGetTransaction,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetTransaction';
import { structured } from '../../lib/strategies/reading';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<opr:objectProperties xmlns:opr="http://www.sap.com/adt/objectproperties">' +
  '<opr:object text="Transaction text" name="ZTX_A" package="ZPKG_A" type="TRAN/T" expandable="true">' +
  '<atom:link href="/sap/bc/adt/x" rel="self" type="t" title="x" xmlns:atom="http://www.w3.org/2005/Atom"/></opr:object>' +
  '<opr:property facet="APPL" name="BC" displayName="Application Component" text="Basis" hasChildrenOfSameFacet="true"/>' +
  '<opr:property facet="APPL" name="BC-DWB" displayName="Application Component" text="Workbench"/>' +
  '<opr:property facet="PACKAGE" name="ZPKG_A" displayName="Package" text="Package text"/>' +
  '<opr:property facet="TYPE" name="TRAN/T" displayName="Type"/>' +
  '</opr:objectProperties>';

const ctx = { connection: {}, logger: undefined } as any;
const payload = (result: any) => JSON.parse(result.content[0].text);

describe('GetTransaction', () => {
  beforeEach(() => {
    getObjectProperties.mockReset();
    getObjectProperties.mockResolvedValue(
      okResponse(structured({ data: DOCUMENT, status: 200 } as any)),
    );
  });

  it('reads the workbench uri of the transaction, once, with analyseObjectProperties', async () => {
    await handleGetTransaction(ctx, { transaction_name: ' ztx_a ' });
    expect(getObjectProperties).toHaveBeenCalledTimes(1);
    expect(getObjectProperties).toHaveBeenCalledWith(
      '/sap/bc/adt/vit/wb/object_type/trant/object_name/ZTX_A',
      { analyse: analyseObjectProperties },
    );
  });

  it('answers the object and its facets in document order', async () => {
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
    });
    expect(result.isError).toBe(false);
    expect(payload(result)).toEqual({
      success: true,
      transaction_name: 'ZTX_A',
      object: {
        text: 'Transaction text',
        name: 'ZTX_A',
        package: 'ZPKG_A',
        type: 'TRAN/T',
        expandable: 'true',
      },
      properties: [
        {
          facet: 'APPL',
          name: 'BC',
          displayName: 'Application Component',
          text: 'Basis',
          hasChildrenOfSameFacet: 'true',
        },
        {
          facet: 'APPL',
          name: 'BC-DWB',
          displayName: 'Application Component',
          text: 'Workbench',
        },
        {
          facet: 'PACKAGE',
          name: 'ZPKG_A',
          displayName: 'Package',
          text: 'Package text',
        },
        { facet: 'TYPE', name: 'TRAN/T', displayName: 'Type' },
      ],
    });
  });

  it('answers one facet as a list too', async () => {
    const one = DOCUMENT.replace(
      /<opr:property facet="APPL"[^>]*\/>|<opr:property facet="PACKAGE"[^>]*\/>|<opr:property facet="TYPE"[^>]*\/>/g,
      '',
    ).replace(
      '</opr:object>',
      '</opr:object><opr:property facet="TYPE" name="TRAN/T" displayName="Type"/>',
    );
    getObjectProperties.mockResolvedValue(
      okResponse(structured({ data: one, status: 200 } as any)),
    );
    const answered = payload(
      await handleGetTransaction(ctx, { transaction_name: 'ZTX_A' }),
    );
    expect(answered.properties).toEqual([
      { facet: 'TYPE', name: 'TRAN/T', displayName: 'Type' },
    ]);
  });

  it('full adds the parse; raw answers the document as SAP sent it', async () => {
    const full = payload(
      await handleGetTransaction(ctx, {
        transaction_name: 'ZTX_A',
        detail: 'full',
      }),
    );
    expect(full.object.name).toBe('ZTX_A');
    expect(full.document['opr:objectProperties']).toBeDefined();
    const raw: any = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
      detail: 'raw',
    });
    expect(raw.content[0].text).toBe(DOCUMENT);
  });

  it("answers SAP's refusal as a failure", async () => {
    getObjectProperties.mockResolvedValue(
      refusedResponse('Request failed with status code 422', {
        origin: 'connection',
      } as any),
    );
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZZ_NONE',
    });
    expect(result.isError).toBe(true);
    expect(payload(result).message).toBe('Request failed with status code 422');
  });

  // The verdict is the strategy's (adt-strategies 0.15.0), run here for real
  // over each answer, and its verdict handed to the handler as the client
  // would: the handler decides nothing about the answer itself.
  const throughStrategy = (wire: { status: number; data: string }): unknown => {
    const verdict = analyseObjectProperties(ADT_NO_FAILURE, wire as any);
    return verdict === ADT_NO_FAILURE
      ? okResponse(structured(wire as any))
      : {
          ok: false,
          getResult: () => {
            throw new Error('no result');
          },
          getError: () => verdict,
        };
  };

  it.each([
    ['an empty body', ''],
    ['a sign-in page', '<html><body><form>Log on</form></body></html>'],
    [
      'a document without its object',
      '<opr:objectProperties xmlns:opr="http://www.sap.com/adt/objectproperties"/>',
    ],
  ])('a 200 with %s is refused ADT_OBJECT_NOT_FOUND', async (_what, data) => {
    getObjectProperties.mockResolvedValue(
      throughStrategy({ status: 200, data }),
    );
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
    });
    expect(result.isError).toBe(true);
    expect(payload(result).code).toBe('ADT_OBJECT_NOT_FOUND');
  });

  it('the transaction document passes the strategy and is answered', async () => {
    getObjectProperties.mockResolvedValue(
      throughStrategy({ status: 200, data: DOCUMENT }),
    );
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
    });
    expect(result.isError).toBe(false);
    expect(payload(result).object.name).toBe('ZTX_A');
  });

  it("SAP's 422 for an unknown name stays SAP's refusal, as it came", () => {
    const incoming = {
      origin: 'connection',
      message: 'Request failed with status code 422',
    };
    const body =
      '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionUnprocessableEntity"/></exc:exception>';
    const verdict: any = analyseObjectProperties(
      incoming as any,
      {
        status: 422,
        data: body,
      } as any,
    );
    expect(verdict.message).toBe('Request failed with status code 422');
    expect(verdict.code).not.toBe('ADT_OBJECT_NOT_FOUND');
  });

  it('refuses a call without a name, before any request', async () => {
    const result: any = await handleGetTransaction(ctx, {} as any);
    expect(result.isError).toBe(true);
    expect(getObjectProperties).not.toHaveBeenCalled();
  });

  it('declares detail', () => {
    expect(TOOL_DEFINITION.inputSchema.properties).toHaveProperty('detail');
  });
});
