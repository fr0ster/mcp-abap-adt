/**
 * GetTransaction: one `getObjectProperties` read of the transaction's
 * workbench uri, answered as the object and its facets. The document is the
 * shape measured on premise (BASIS 816, 2026-10-21), values sanitised.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { analyseObjectProperties } from '@mcp-abap-adt/adt-strategies';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import {
  handleGetTransaction,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetTransaction';
import * as clients from '../../lib/clients';
import { structured } from '../../lib/strategies/reading';
import { okResponse, refusedResponse } from '../helpers/fakeClient';
import { listedJson } from '../helpers/listedJson';

const getObjectProperties = mock.fn<(...args: any[]) => any>();

mock.method(clients, 'createAdtClient', () => ({
  getUtils: () => ({ getObjectProperties }),
}));

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
    getObjectProperties.mock.resetCalls();
    getObjectProperties.mock.mockImplementation(() => undefined);
    getObjectProperties.mock.mockImplementation(async () =>
      okResponse(structured({ data: DOCUMENT, status: 200 } as any)),
    );
  });

  it('reads the workbench uri of the transaction, once, with analyseObjectProperties', async () => {
    await handleGetTransaction(ctx, { transaction_name: ' ztx_a ' });
    assert.equal(getObjectProperties.mock.callCount(), 1);
    assert.ok(
      getObjectProperties.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          '/sap/bc/adt/vit/wb/object_type/trant/object_name/ZTX_A',
          { analyse: analyseObjectProperties },
        ]),
      ),
    );
  });

  it('answers the object and its facets in document order', async () => {
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
      detail: 'medium',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(payload(result), {
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

  it('terse, by default: the facets as TSV under the transaction', async () => {
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
    });
    assert.equal(
      (result.content[0] as { text: string }).text,
      [
        '# transaction ZTX_A',
        '# text Transaction text',
        '# package ZPKG_A',
        'facet\tname\ttext',
        'APPL\tBC\tBasis',
        'APPL\tBC-DWB\tWorkbench',
        'PACKAGE\tZPKG_A\tPackage text',
        'TYPE\tTRAN/T\t',
      ].join('\n'),
    );
  });

  it('answers one facet as a list too', async () => {
    const one = DOCUMENT.replace(
      /<opr:property facet="APPL"[^>]*\/>|<opr:property facet="PACKAGE"[^>]*\/>|<opr:property facet="TYPE"[^>]*\/>/g,
      '',
    ).replace(
      '</opr:object>',
      '</opr:object><opr:property facet="TYPE" name="TRAN/T" displayName="Type"/>',
    );
    getObjectProperties.mock.mockImplementation(async () =>
      okResponse(structured({ data: one, status: 200 } as any)),
    );
    const answered = payload(
      await handleGetTransaction(ctx, {
        transaction_name: 'ZTX_A',
        detail: 'medium',
      }),
    );
    assert.deepStrictEqual(answered.properties, [
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
    assert.equal(full.object.name, 'ZTX_A');
    assert.notEqual(full.document['opr:objectProperties'], undefined);
    const raw: any = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
      detail: 'raw',
    });
    assert.equal(raw.content[0].text, DOCUMENT);
  });

  it("answers SAP's refusal as a failure", async () => {
    getObjectProperties.mock.mockImplementation(async () =>
      refusedResponse('Request failed with status code 422', {
        origin: 'connection',
      } as any),
    );
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZZ_NONE',
    });
    assert.equal(result.isError, true);
    assert.equal(
      payload(result).message,
      'Request failed with status code 422',
    );
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

  for (const [_what, data] of [
    ['an empty body', ''],
    ['a sign-in page', '<html><body><form>Log on</form></body></html>'],
    [
      'a document without its object',
      '<opr:objectProperties xmlns:opr="http://www.sap.com/adt/objectproperties"/>',
    ],
  ]) {
    it(
      format('a 200 with %s is refused ADT_OBJECT_NOT_FOUND', _what),
      async () => {
        getObjectProperties.mock.mockImplementation(async () =>
          throughStrategy({ status: 200, data }),
        );
        const result = await handleGetTransaction(ctx, {
          transaction_name: 'ZTX_A',
        });
        assert.equal(result.isError, true);
        assert.equal(payload(result).code, 'ADT_OBJECT_NOT_FOUND');
      },
    );
  }

  it('the transaction document passes the strategy and is answered', async () => {
    getObjectProperties.mock.mockImplementation(async () =>
      throughStrategy({ status: 200, data: DOCUMENT }),
    );
    const result = await handleGetTransaction(ctx, {
      transaction_name: 'ZTX_A',
      detail: 'medium',
    });
    assert.equal(result.isError, false);
    assert.equal(payload(result).object.name, 'ZTX_A');
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
    assert.equal(verdict.message, 'Request failed with status code 422');
    assert.notEqual(verdict.code, 'ADT_OBJECT_NOT_FOUND');
  });

  for (const [_what, data] of [
    [
      'another prefix',
      '<p:objectProperties xmlns:p="http://www.sap.com/adt/objectproperties"><p:object text="T" name="ZTX_A" package="ZPKG_A" type="TRAN/T"/><p:property facet="TYPE" name="TRAN/T" displayName="Type"/></p:objectProperties>',
    ],
    [
      'a default namespace',
      '<objectProperties xmlns="http://www.sap.com/adt/objectproperties"><object text="T" name="ZTX_A" package="ZPKG_A" type="TRAN/T"/><property facet="TYPE" name="TRAN/T" displayName="Type"/></objectProperties>',
    ],
  ]) {
    it(format('reads the document by local names: %s', _what), async () => {
      getObjectProperties.mock.mockImplementation(async () =>
        throughStrategy({ status: 200, data }),
      );
      const answered = payload(
        await handleGetTransaction(ctx, {
          transaction_name: 'ZTX_A',
          detail: 'medium',
        }),
      );
      assert.deepStrictEqual(answered.object, {
        text: 'T',
        name: 'ZTX_A',
        package: 'ZPKG_A',
        type: 'TRAN/T',
      });
      assert.deepStrictEqual(answered.properties, [
        { facet: 'TYPE', name: 'TRAN/T', displayName: 'Type' },
      ]);
    });
  }

  it('refuses a call without a name, before any request', async () => {
    const result: any = await handleGetTransaction(ctx, {} as any);
    assert.equal(result.isError, true);
    assert.equal(getObjectProperties.mock.callCount(), 0);
  });

  it('declares detail', () => {
    assert.ok(
      'detail' in Object(listedJson(TOOL_DEFINITION.inputSchema).properties),
    );
  });
});
