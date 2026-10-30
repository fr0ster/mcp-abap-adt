/**
 * Read tools answer a failure in the one shape every compliant tool gives
 * (AUTHENTICATION.md, "A tool failure: the method's error as it is, plus the
 * step"): SAP's refusal as the method's error — origin, status, `adt_type`,
 * T100 `messages`, `raw_body`, the request — never its bare message as text,
 * never a sentence of ours, never content inside a success; a failure of our
 * own code is `client_threw`; a credential failure ends the call as it came,
 * and in a tool that reads several items no request follows it.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleGetClass } from '../../handlers/class/high/handleGetClass';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetInclude } from '../../handlers/include/readonly/handleGetInclude';
import { handleGetIncludesList } from '../../handlers/include/readonly/handleGetIncludesList';
import { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapAST } from '../../handlers/system/readonly/handleGetAbapAST';
import { handleGetAbapSemanticAnalysis } from '../../handlers/system/readonly/handleGetAbapSemanticAnalysis';
import { handleGetObjectInfo } from '../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetObjectNodeFromCache } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetTypeInfo } from '../../handlers/system/readonly/handleGetTypeInfo';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';
import { createBatchAvailability } from '../../lib/batch/availability';
import { objectsListCache } from '../../lib/getObjectsListCache';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({
  // The declared variant the boundary checks a type argument against.
  variantOf: () => 'onprem',
  createAdtClient: () => fakeClient,
}));

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

/** SAP's refusal document, as an on-premise system answers a read. */
const DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
  '<message lang="EN">No authorization to display the object</message>' +
  '<localizedMessage lang="EN">No authorization to display the object</localizedMessage>' +
  '<properties><entry key="T100KEY-ID">SEU_ADT</entry><entry key="T100KEY-NO">026</entry></properties>' +
  '</exc:exception>';

/** What the connection throws for a status it refused: SAP's answer on it. */
const httpError = (status: number, data = DOCUMENT) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, statusText: 'Forbidden', data, headers: {} },
  });

/** A connection whose direct requests SAP answers with `status`. */
const refusingWith = (status: number, sent: string[] = []) =>
  ({
    getBaseUrl: async () => 'https://example.invalid',
    getSessionId: () => null,
    makeAdtRequest: async (options: { url: string }) => {
      sent.push(options.url);
      throw httpError(status);
    },
  }) as any;

/** The method's error, as a direct request's 403 makes it. */
const sapRefusal = (url: string, step?: string) => ({
  message: 'Request failed with status code 403',
  status: 403,
  adt_type: 'ExceptionResourceNoAccess',
  namespace: 'com.sap.adt',
  request: { method: 'GET', url },
  messages: [
    {
      type: 'E',
      text: 'No authorization to display the object',
      code: 'ExceptionResourceNoAccess',
      t100: { id: 'SEU_ADT', no: '026' },
    },
  ],
  raw_body: DOCUMENT,
  ...(step === undefined ? {} : { step }),
});

/** A refusal SAP answered, as a member hands it back. */
const forbidden = () =>
  refusedResponse('No authorization to display the object', {
    adtType: 'ExceptionResourceNoAccess',
    response: { status: 403, data: DOCUMENT },
  } as Partial<IAdtError>);

/** A credential SAP refused (`401`), as a member hands it back. */
const unauthorized = () =>
  refusedResponse('Unauthorized', {
    response: { status: 401, data: '' },
  } as Partial<IAdtError>);

/** A credential refused before SAP was asked: the chain's failure. */
const credential = () =>
  new AuthProviderFailure(
    authError['credential-refused']({ credential: 'token' }),
  );

describe('GetInclude: through the adt-clients member, answered by answer()', () => {
  it("SAP's refusal is the method's error as it is, not its message as text", async () => {
    const analyses: unknown[] = [];
    fakeClient = fakeClientOf({
      getInclude: async (_name: unknown, options: any) => {
        analyses.push(options?.analyse);
        return forbidden();
      },
    });
    const result: any = await handleGetInclude(
      { connection: {} as any, logger: undefined } as any,
      { include_name: 'ZINC' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      message: 'No authorization to display the object',
      origin: 'refusal',
      status: 403,
      adt_type: 'ExceptionResourceNoAccess',
      raw_body: DOCUMENT,
    });
    expect(analyses).toEqual([analyseException]);
  });

  it('answers the source as it came', async () => {
    fakeClient = fakeClientOf({
      getInclude: async () => okResponse(reading('DATA a TYPE i.')),
    });
    const result: any = await handleGetInclude(
      { connection: {} as any, logger: undefined } as any,
      { include_name: 'ZINC' },
    );
    expect(result).toEqual({
      isError: false,
      content: [{ type: 'text', text: 'DATA a TYPE i.' }],
    });
  });
});

describe('GetPackageContents: a throw', () => {
  it('a thrown credential refusal is the credential failure, not its words', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        throw credential();
      },
    });
    const result: any = await handleGetPackageContents(
      { connection: {} as any, logger: undefined } as any,
      { package_name: 'ZPKG' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
  });

  it("a throw of our own is the method's own failure, client_threw", async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => {
        throw new TypeError('boom');
      },
    });
    const result: any = await handleGetPackageContents(
      { connection: {} as any, logger: undefined } as any,
      { package_name: 'ZPKG' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      error: 'client_threw',
      tool: 'GetPackageContents',
      message: 'boom',
    });
  });
});

describe('GetTypeInfo: a direct lookup SAP refused', () => {
  // adt-clients' own members (#235) over the connection double, so the
  // requests on the wire are the members'.
  const realClientOver = (connection: unknown) => {
    fakeClient = jest
      .requireActual('../../lib/clients')
      .createAdtClient(connection);
  };

  it("is the lookup's error as SAP answered it, with the lookup as the step", async () => {
    const sent: string[] = [];
    const connection = refusingWith(403, sent);
    realClientOver(connection);
    const result: any = await handleGetTypeInfo(
      { connection, logger: undefined } as any,
      { type_name: 'ZT' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual({
      origin: 'connection',
      // The first lookup is the data element (`getDataElement().readMetadata`).
      ...sapRefusal('/sap/bc/adt/ddic/dataelements/zt', 'read data element'),
    });
    // The refusal is the answer: no further lookup is sent.
    expect(sent).toHaveLength(1);
  });

  it('a 404 stays absence: the next lookup is asked', async () => {
    const sent: string[] = [];
    const connection = {
      makeAdtRequest: async (options: { url: string }) => {
        sent.push(options.url);
        if (sent.length === 1) throw httpError(404, '');
        throw httpError(403);
      },
    };
    realClientOver(connection);
    const result: any = await handleGetTypeInfo(
      { connection, logger: undefined } as any,
      { type_name: 'ZT' },
    );
    expect(payloadOf(result)).toMatchObject({
      status: 403,
      step: 'read domain',
    });
    expect(sent).toEqual([
      '/sap/bc/adt/ddic/dataelements/zt',
      '/sap/bc/adt/ddic/domains/zt',
    ]);
  });
});

describe('GetTransport: the request SAP refused', () => {
  it("is the request's error as SAP answered it, not SAP's body as text", async () => {
    // adt-clients' own `readObjects` (#235) over the refusing connection, so
    // the request on the wire is the member's.
    const connection = refusingWith(403);
    fakeClient = jest
      .requireActual('../../lib/clients')
      .createAdtClient(connection);
    const result: any = await handleGetTransport(
      { connection, logger: undefined } as any,
      { transport_number: 'TRLK900001' } as any,
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject(
      sapRefusal(
        '/sap/bc/adt/cts/transportrequests/TRLK900001',
        'read transport request',
      ),
    );
  });
});

describe('GetObjectNodeFromCache: the OBJECT_URI read SAP refused', () => {
  it('is the call\'s failure as SAP answered it, not "ERROR: …" inside a success', async () => {
    objectsListCache.setCache({
      objects: [
        {
          OBJECT_TYPE: 'PROG/P',
          OBJECT_NAME: 'ZPROG',
          TECH_NAME: 'ZPROG',
          OBJECT_URI: '/sap/bc/adt/programs/programs/zprog',
        },
      ],
    });
    const result: any = await handleGetObjectNodeFromCache(
      { connection: refusingWith(403), logger: undefined } as any,
      { object_type: 'PROG/P', object_name: 'ZPROG', tech_name: 'ZPROG' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject(
      sapRefusal('/sap/bc/adt/programs/programs/zprog', 'read OBJECT_URI'),
    );
    // Nothing of the failure was cached as the node's content.
    expect(
      (objectsListCache.getCache().objects as any[])[0].object_uri_response,
    ).toBeUndefined();
  });
});

describe('GetAbapAST / GetAbapSemanticAnalysis: a local parser that threw', () => {
  it("GetAbapAST: the parser's own failure, client_threw at the parse step", async () => {
    const result: any = await handleGetAbapAST(
      { connection: {} as any, logger: undefined } as any,
      { code: 42 },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      error: 'client_threw',
      tool: 'GetAbapAST',
      step: 'parse',
    });
    expect(payloadOf(result).message).toContain('Failed to parse ABAP code');
  });

  it("GetAbapSemanticAnalysis: the analysis' own failure, client_threw at the analysis step", async () => {
    const logger = {
      debug: () => {
        throw new Error('logger down');
      },
      error: () => undefined,
    };
    const result: any = await handleGetAbapSemanticAnalysis(
      { connection: {} as any, logger } as any,
      { code: 'DATA a TYPE i.' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      error: 'client_threw',
      tool: 'GetAbapSemanticAnalysis',
      message: 'logger down',
      step: 'analyse',
    });
  });
});

describe('GetEnhancements include_nested: the nested walk threw', () => {
  it('the partial answer carries the throw as client_threw with its step, not a bare message', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse({ childNodes: [] }),
    });
    const connection = {
      async makeAdtRequest() {
        return {
          status: 200,
          data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
        };
      },
    };
    const logger = {
      info: (line: unknown) => {
        if (typeof line === 'string' && line.startsWith('Found '))
          throw new Error('logger down');
      },
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    };
    // The sequential version: a destination known to have no communication
    // batch. (The batched version: `unit/batch/includeTrees.test.ts`.)
    const notServed = createBatchAvailability();
    notServed.noteOuterStatus(404);
    const result: any = await handleGetEnhancements(
      { connection, logger, batchAvailability: notServed } as any,
      { object_name: 'ZPROG', object_type: 'program', include_nested: true },
    );
    const body = payloadOf(result);
    expect(body.partial_result).toBe(true);
    expect(body.error).toEqual({
      error: 'client_threw',
      message: 'logger down',
      step: 'list includes',
    });
  });
});

describe('GetIncludesList: SAP answered 401 to an include', () => {
  it('ends the call with that answer; no further include is read', async () => {
    const read: string[] = [];
    fakeClient = fakeClientOf({
      readObjectSource: async () =>
        okResponse(reading('REPORT z.\nINCLUDE zone.\nINCLUDE ztwo.\n')),
      getInclude: async (name: unknown) => {
        read.push(String(name));
        return unauthorized();
      },
    });
    // The sequential version, one include after another: a destination
    // known to have no communication batch. (The batched version reads a
    // level in one envelope: `unit/batch/includeTrees.test.ts`.)
    const notServed = createBatchAvailability();
    notServed.noteOuterStatus(404);
    const result: any = await handleGetIncludesList(
      {
        connection: {} as any,
        logger: undefined,
        batchAvailability: notServed,
      } as any,
      { object_name: 'ZPROG', object_type: 'PROG/P' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      status: 401,
      step: 'read source',
    });
    expect(payloadOf(result).tree).toBeUndefined();
    expect(read).toEqual(['ZONE']);
  });
});

describe('DescribeByList: a credential failure on the typed search', () => {
  it('a thrown credential refusal: the call ends, no untyped search follows', async () => {
    const searched: string[] = [];
    fakeClient = fakeClientOf({
      search: async (criteria: any) => {
        searched.push(criteria?.query);
        throw credential();
      },
    });
    const result: any = await handleDescribeByList(
      { connection: {} as any, logger: undefined } as any,
      { objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }] },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(searched).toEqual(['ZCL_X']);
  });

  it('a 401 SAP answered: the call ends with it, no untyped search follows', async () => {
    let searches = 0;
    fakeClient = fakeClientOf({
      search: async () => {
        searches++;
        return unauthorized();
      },
    });
    const result: any = await handleDescribeByList(
      { connection: {} as any, logger: undefined } as any,
      { objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }] },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({ status: 401 });
    expect(searches).toBe(1);
  });
});

describe('GetObjectInfo: the enrichment search was a credential failure', () => {
  // The searches are the tree's last phase (spec §11): the tree is read
  // first, and nothing is read after the search that met the failure.
  it('ends the call with it; nothing is read after it', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      search: async () => {
        calls.push('search');
        throw credential();
      },
      fetchNodeStructure: async () => {
        calls.push('tree');
        return okResponse({ objects: [], childNodes: [] });
      },
    });
    const result: any = await handleGetObjectInfo(
      { connection: {} as any, logger: undefined } as any,
      { parent_type: 'PROG/P', parent_name: 'ZPROG', maxDepth: 1 },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(calls).toEqual(['tree', 'search']);
  });

  it('a 401 SAP answered to the search ends the call the same way', async () => {
    const calls: string[] = [];
    fakeClient = fakeClientOf({
      search: async () => {
        calls.push('search');
        return unauthorized();
      },
      fetchNodeStructure: async () => {
        calls.push('tree');
        return okResponse({ objects: [], childNodes: [] });
      },
    });
    const result: any = await handleGetObjectInfo(
      { connection: {} as any, logger: undefined } as any,
      { parent_type: 'PROG/P', parent_name: 'ZPROG', maxDepth: 1 },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({ status: 401 });
    expect(calls).toEqual(['tree', 'search']);
  });

  it('any other search refusal stays best effort: the tree answers', async () => {
    fakeClient = fakeClientOf({
      search: async () => forbidden(),
      fetchNodeStructure: async () =>
        okResponse({ objects: [], childNodes: [] }),
    });
    const result: any = await handleGetObjectInfo(
      { connection: {} as any, logger: undefined } as any,
      { parent_type: 'PROG/P', parent_name: 'ZPROG', maxDepth: 1 },
    );
    expect(result.isError).toBe(false);
  });
});

describe('GetTransport / GetIncludesList: a missing argument', () => {
  /** How a compliant read answers its missing argument. */
  const compliant = () =>
    handleGetClass(
      { connection: {} as any, logger: undefined } as any,
      {
        class_name: '',
      } as any,
    );

  it('is answered in the shape a compliant read answers its own, before any request', async () => {
    const shape = (result: any) => ({
      isError: result.isError,
      types: result.content.map((c: any) => c.type),
    });
    const sent: string[] = [];
    const transport: any = await handleGetTransport(
      { connection: refusingWith(403, sent), logger: undefined } as any,
      {} as any,
    );
    fakeClient = fakeClientOf({});
    const includes: any = await handleGetIncludesList(
      { connection: {} as any, logger: undefined } as any,
      { object_type: 'PROG/P' },
    );
    const reference = shape(await compliant());
    expect(reference).toEqual({ isError: true, types: ['text'] });
    expect(shape(transport)).toEqual(reference);
    expect(shape(includes)).toEqual(reference);
    expect(transport.content[0].text).toBe('Transport number is required');
    expect(includes.content[0].text).toBe(
      'Parameter "object_name" (string) is required and cannot be empty.',
    );
    expect(sent).toEqual([]);
  });
});

describe('GetIncludesList: a throw that carries nothing', () => {
  it("is the method's own failure, client_threw, not the bare message", async () => {
    fakeClient = fakeClientOf({
      readObjectSource: async () => {
        throw new TypeError('boom');
      },
    });
    const result: any = await handleGetIncludesList(
      { connection: {} as any, logger: undefined } as any,
      { object_name: 'ZPROG', object_type: 'PROG/P' },
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      error: 'client_threw',
      tool: 'GetIncludesList',
      message: 'boom',
    });
  });
});
