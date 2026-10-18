/**
 * A handler never rewrites the method's error; it adds the step where the
 * error arose. SAP's refusal reaches the consumer as the strategy made it —
 * message, origin, status, `adt_type`, raw body — with `step` beside it, and
 * is never turned into an empty result, a `null`, a warning or "not found".
 * A source or level that is not there (`404`) stays what it was.
 */

import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents';
import { handleGetStructuresList } from '../../handlers/structure/readonly/handleGetStructuresList';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapSystemSymbols } from '../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { createBatchAvailability } from '../../lib/batch/availability';
import { runSearchSource } from '../../lib/search-source/orchestrator';
import {
  createSourceReaderDeps,
  type ReadSourceUnitsDeps,
  readSourceUnits,
} from '../../lib/search-source/sourceReader';
import {
  type ActivationRunSource,
  awaitActivationRun,
} from '../../lib/strategies/activationRun';
import { carryingFailure, methodFailureOf } from '../../lib/strategies/step';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

const DOCUMENT =
  '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message>No authorization</message></exc:exception>';

/** A refusal SAP answered: a status and its document. */
const forbidden = (message = 'No authorization') =>
  refusedResponse(message, {
    adtType: 'ExceptionResourceNoAuthorization',
    response: { status: 403, data: DOCUMENT },
  } as Partial<IAdtError>);

const notThere = () =>
  refusedResponse('Resource does not exist', {
    adtType: 'ExceptionResourceNotFound',
    response: { status: 404, data: '' },
  } as Partial<IAdtError>);

/** The method's error as `answer()` renders it, with the step. */
const expectedPayload = (step: string, message = 'No authorization') => ({
  message,
  origin: 'refusal',
  step,
  status: 403,
  adt_type: 'ExceptionResourceNoAuthorization',
  raw_body: DOCUMENT,
});

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

/** An entry: the method's error as `answer()` renders it, with its step. */
const failureEntryOf = (step: string, message: string) => ({
  message,
  origin: 'refusal',
  step,
  status: 403,
  adt_type: 'ExceptionResourceNoAuthorization',
  raw_body: DOCUMENT,
});

describe('a multi-step handler adds the step that failed', () => {
  it('UpdateClass refused at the lock answers the lock error with step lock, and nothing is written', async () => {
    const update = jest.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({ lock: async () => forbidden(), update });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('lock'));
    expect(update).not.toHaveBeenCalled();
  });

  it('UpdateClass refused at the update answers the update error with step update, and unlocks', async () => {
    const unlock = jest.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('HANDLE'),
      update: async () => forbidden('Object is locked by another user'),
      unlock,
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(
      expectedPayload('update', 'Object is locked by another user'),
    );
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('a throw inside a step is the method failure with the step, not a SAP answer', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('HANDLE'),
      update: async () => {
        throw new Error('could not parse the answer');
      },
      unlock: async () => okResponse(reading('')),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    const payload = payloadOf(result);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toBe('could not parse the answer');
    expect(payload.step).toBe('update');
    expect(payload.origin).toBeUndefined();
    expect(payload.status).toBeUndefined();
  });
});

describe('a refusal is not swallowed', () => {
  it('GetPackageContents: a refused level is the method error with its step, not an empty list', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => forbidden() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(
      expectedPayload('read package node structure'),
    );
  });

  it('GetPackageContents: a level that is not there stays empty', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => notThere() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it('GetEnhancements: a refused includes walk is the method error with its step, not an empty list', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => forbidden() });
    const connection = {
      async makeAdtRequest() {
        return {
          status: 200,
          data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
        };
      },
    };
    const result: any = await handleGetEnhancements(
      { connection, logger: undefined } as any,
      { object_name: 'ZPROG', object_type: 'program', include_nested: true },
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.partial_result).toBe(true);
    expect(body.error).toEqual(expectedPayload('read node structure'));
  });

  it('SearchSource: a refused source read is the method error with its step, not a skipped source', async () => {
    fakeClient = fakeClientOf({ read: async () => forbidden() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(deps, {
      devclass: 'ZPKG',
      object_type: 'PROG',
      object_name: 'ZPROG',
    } as any);
    const thrown = await units.next().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(methodFailureOf(thrown)).toEqual({
      message: 'No authorization',
      origin: 'refusal',
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status: 403, data: DOCUMENT },
      step: 'read program',
    });
  });

  it('SearchSource: a source that is not there is skipped as before', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(deps, {
      devclass: 'ZPKG',
      object_type: 'PROG',
      object_name: 'ZPROG',
    } as any);
    expect((await units.next()).done).toBe(true);
  });

  it("DescribeByList: a refused search is that object's error with the step, and the others are described", async () => {
    fakeClient = fakeClientOf({
      search: async (criteria: any) =>
        criteria?.query === 'ZCL_X'
          ? forbidden()
          : okResponse(
              reading({
                'adtcore:objectReferences': {
                  'adtcore:objectReference': {
                    '@': { 'adtcore:name': 'ZCL_Y', 'adtcore:type': 'CLAS/OC' },
                  },
                },
              } as never),
            ),
    });
    const result: any = await handleDescribeByList(context as any, {
      objects: [
        { name: 'ZCL_X', type: 'CLAS/OC' },
        { name: 'ZCL_Y', type: 'CLAS/OC' },
      ],
    });
    expect(result.isError).toBe(false);
    const items = result.content.map((c: any) => JSON.parse(c.text));
    expect(items[0]).toEqual({
      name: 'ZCL_X',
      error: expectedPayload('search'),
    });
    expect(items).toHaveLength(2);
    expect(items[1].name).toBe('ZCL_Y');
    expect(items[1].error).toBeUndefined();
  });

  it('GetAbapSystemSymbols: a refused class read is that symbol\'s error with the step, not "not found", and the call goes on', async () => {
    const reads: string[] = [];
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        reads.push(config?.className ?? config?.interfaceName ?? '?');
        return forbidden();
      },
    });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.\nCLASS zcl_y DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(false);
    const symbols = result.content[0].json.symbols;
    const zclX = symbols.find((s: any) => s.name.toUpperCase() === 'ZCL_X');
    const zclY = symbols.find((s: any) => s.name.toUpperCase() === 'ZCL_Y');
    expect(zclX.error).toEqual(expectedPayload('read class'));
    expect(zclX.systemInfo).toBeUndefined();
    // Not the end of the call: the next symbol was read too.
    expect(zclY.error).toEqual(expectedPayload('read class'));
  });

  it('GetAbapSystemSymbols: a class that is not there stays "not found"', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(false);
    const symbols = result.content[0].json.symbols;
    const zcl = symbols.find((s: any) => s.name.toUpperCase() === 'ZCL_X');
    expect(zcl.systemInfo).toEqual({
      exists: false,
      error: 'Class not found in SAP system',
    });
  });
});

describe('GetStructuresList: both endpoints failed', () => {
  const tableRefused = () =>
    refusedResponse('No authorization for the table', {
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status: 403, data: DOCUMENT },
    } as Partial<IAdtError>);

  it("answers both endpoints' failures, each as it is with its step, in one array", async () => {
    let call = 0;
    fakeClient = fakeClientOf({
      read: async () => (call++ === 0 ? forbidden() : tableRefused()),
    });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual([
      failureEntryOf('read structure', 'No authorization'),
      failureEntryOf('read table', 'No authorization for the table'),
    ]);
  });

  it('a 404 from one endpoint and a refusal from the other: both, as they are', async () => {
    let call = 0;
    fakeClient = fakeClientOf({
      read: async () => (call++ === 0 ? notThere() : tableRefused()),
    });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(true);
    const [structure, table] = payloadOf(result);
    expect(structure).toMatchObject({
      step: 'read structure',
      status: 404,
      adt_type: 'ExceptionResourceNotFound',
    });
    expect(table).toEqual(
      failureEntryOf('read table', 'No authorization for the table'),
    );
  });

  it('a 404 from both stays absence, as today', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Could not read source for structure/table ZS',
    );
  });

  it("an embedded structure that could not be read names both endpoints' failures on its node", async () => {
    fakeClient = fakeClientOf({
      read: async (config: any) =>
        config?.structureName === 'ZS'
          ? okResponse('define structure zs {\n  include zinc;\n}')
          : config?.structureName === 'ZINC'
            ? forbidden()
            : tableRefused(),
    });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(false);
    const [child] = JSON.parse(result.content[0].text).tree.children;
    expect(child.structure).toBe('ZINC');
    expect(child.error).toEqual([
      failureEntryOf('read structure', 'No authorization'),
      failureEntryOf('read table', 'No authorization for the table'),
    ]);
  });
});

describe('GetEnhancements: a refused elements read is the method error as it is, with step read enhancements', () => {
  const run = () =>
    handleGetEnhancements({ connection: {}, logger: undefined } as any, {
      object_name: 'ZCL_X',
      object_type: 'class',
    }) as Promise<any>;

  it('a 403 SAP answered', async () => {
    fakeClient = fakeClientOf({
      readEnhancementElements: async () => forbidden(),
    });
    const result = await run();
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('read enhancements'));
  });

  it('a 401: the call ends as it came, with the step', async () => {
    fakeClient = fakeClientOf({
      readEnhancementElements: async () =>
        refusedResponse('Unauthorized', {
          response: { status: 401, data: '' },
        } as Partial<IAdtError>),
    });
    const body = payloadOf(await run());
    expect(body.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
    expect(body.step).toBe('read enhancements');
  });
});

describe('GetEnhancements include_nested lists an include SAP refused', () => {
  const EMPTY =
    '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>';
  /** The includes walk, and each include's elements by its name. */
  const walk = (refusedInclude?: { name: string; status: number }) =>
    fakeClientOf({
      fetchNodeStructure: async (...args: unknown[]) =>
        (args[2] as { nodeId: string }).nodeId === '000000'
          ? okResponse({ childNodes: [{ type: 'PROG/I', nodeId: 'N1' }] })
          : okResponse({ objects: [{ name: 'ZINC1' }, { name: 'ZINC2' }] }),
      readEnhancementElements: async (...args: unknown[]) =>
        refusedInclude !== undefined &&
        (args[0] as { includeName?: string }).includeName ===
          refusedInclude.name
          ? refusedResponse(
              `Request failed with status code ${refusedInclude.status}`,
              {
                response: { status: refusedInclude.status, data: DOCUMENT },
              } as Partial<IAdtError>,
            )
          : okResponse(EMPTY),
    });
  const run = () =>
    handleGetEnhancements({ connection: {}, logger: undefined } as any, {
      object_name: 'ZPROG',
      object_type: 'program',
      program: 'ZPROG',
      include_nested: true,
    }) as Promise<any>;

  it('the refused include is listed with its name, the method error and the step, beside the others', async () => {
    fakeClient = walk({ name: 'ZINC2', status: 403 });
    const body = payloadOf(await run());
    expect(body.objects.length).toBe(0); // the others answered (none holds an enhancement)
    expect(body.total_objects_analyzed).toBe(2); // the main object and ZINC1
    expect(body.includes_unread).toEqual([
      {
        include: 'ZINC2',
        step: 'read enhancements',
        failures: [
          expect.objectContaining({
            message: 'Request failed with status code 403',
            origin: 'refusal',
            step: 'read enhancements',
            status: 403,
            raw_body: DOCUMENT,
          }),
        ],
      },
    ]);
  });

  it('no include refused: no includes_unread', async () => {
    fakeClient = walk();
    const body = payloadOf(await run());
    expect(body.includes_unread).toBeUndefined();
    expect(body.total_objects_analyzed).toBe(3);
  });

  it('a 401 on an include ends the call as it came', async () => {
    fakeClient = walk({ name: 'ZINC1', status: 401 });
    const result = await run();
    expect(result.isError).toBe(true);
    const body = payloadOf(result);
    expect(body.status).toBe(401);
    expect(body.includes_unread).toBeUndefined();
    expect(body.partial_result).toBeUndefined();
  });
});

describe('a credential failure inside a batch tool ends the whole call, as it came', () => {
  const credential = () =>
    new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
  const target = (name: string) => ({
    name,
    type: 'PROG/P',
    packageName: 'ZPKG',
    isPackage: false,
  });

  it('SearchSource: the failure is thrown, no further object is read', async () => {
    const read: string[] = [];
    const failure = credential();
    const run = runSearchSource(
      {
        fetchPackageContents: async () =>
          [target('ZA'), target('ZB'), target('ZC')] as never,
        sourceReader: {
          async readProgram(name) {
            read.push(name);
            if (name === 'ZB') throw failure;
            return 'marker';
          },
          readInclude: async () => null,
          readClassMain: async () => null,
          fetchFugrStructure: async () => [],
          readFugrFm: async () => null,
        },
        resolvePackages: async (entries) => entries,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        concurrency: 1,
      },
    );
    await expect(run).rejects.toBe(failure);
    expect(read).toEqual(['ZA', 'ZB']);
  });

  it('SearchSource: a 401 SAP answered ends it too', async () => {
    const unauthorized = carryingFailure(
      new Error('Unauthorized'),
      {
        message: 'Unauthorized',
        origin: 'refusal',
        response: { status: 401, data: '' },
      } as IAdtError,
      'read program',
    );
    const run = runSearchSource(
      {
        fetchPackageContents: async () => [target('ZA')] as never,
        sourceReader: {
          readProgram: async () => {
            throw unauthorized;
          },
          readInclude: async () => null,
          readClassMain: async () => null,
          fetchFugrStructure: async () => [],
          readFugrFm: async () => null,
        },
        resolvePackages: async (entries) => entries,
      },
      { query: 'marker', packages: ['ZPKG'], object_types: ['PROG'] },
    );
    await expect(run).rejects.toBe(unauthorized);
  });

  it('DescribeByList: the answer is the failure as it came, no object after it is searched', async () => {
    const searched: string[] = [];
    fakeClient = fakeClientOf({
      search: async (criteria: any) => {
        searched.push(criteria?.query);
        throw credential();
      },
    });
    const result: any = await handleDescribeByList(context as any, {
      objects: [
        { name: 'ZCL_X', type: 'CLAS/OC' },
        { name: 'ZCL_Y', type: 'CLAS/OC' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({ error: 'authentication_failed' });
    expect(payloadOf(result).step).toBeUndefined();
    expect(new Set(searched)).toEqual(new Set(['ZCL_X']));
  });

  it('GetAbapSystemSymbols: the answer is the failure as it came, no symbol after it is read', async () => {
    const reads: string[] = [];
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        reads.push(config?.className);
        throw credential();
      },
    });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.\nCLASS zcl_y DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({ error: 'authentication_failed' });
    expect(payloadOf(result).step).toBeUndefined();
    expect(reads).toHaveLength(1);
  });

  it("a 403 in the same batch stays that item's answer", async () => {
    fakeClient = fakeClientOf({ read: async () => forbidden() });
    const result: any = await handleGetAbapSystemSymbols(context as any, {
      code: 'CLASS zcl_x DEFINITION.\nENDCLASS.\nCLASS zcl_y DEFINITION.\nENDCLASS.',
    });
    expect(result.isError).toBe(false);
  });
});

describe('GetStructuresList: an append candidate SAP refused to read is listed', () => {
  const whereUsedNaming = (...names: string[]) =>
    okResponse(
      reading({
        'usagereferences:usageReferenceResult': {
          'usagereferences:referencedObjects': {
            'usagereferences:referencedObject': names.map((name) => ({
              'usagereferences:adtObject': {
                '@': { 'adtcore:name': name, 'adtcore:type': 'TABL/DS' },
              },
            })),
          },
        },
      }),
    );

  const clientWith = (candidates: Record<string, () => unknown>) =>
    fakeClientOf({
      read: async (config: any) => {
        const name = config?.structureName ?? config?.tableName;
        return name === 'ZS'
          ? okResponse('define structure zs {\n}')
          : (candidates[name] ?? (() => notThere()))();
      },
      getWhereUsedScope: async () => okResponse(reading({ raw: '<scope/>' })),
      modifyWhereUsedScope: () => '<scope/>',
      getWhereUsed: async (params: any) =>
        params?.object_name === 'ZS'
          ? whereUsedNaming('ZREFUSED', 'ZABSENT', 'ZAPP')
          : whereUsedNaming(),
    });

  it('lists the refused candidate: its refusals as they are, the step and its name; absent ones stay skipped', async () => {
    fakeClient = clientWith({
      ZREFUSED: () => forbidden(),
      ZAPP: () => okResponse('extend type zs with zapp { }'),
    });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
    });
    expect(result.isError).toBe(false);
    const answer = JSON.parse(result.content[0].text);
    expect(answer.append_candidates_unread).toEqual([
      {
        candidate: 'ZREFUSED',
        step: 'read append candidate',
        failures: [
          failureEntryOf('read structure', 'No authorization'),
          failureEntryOf('read table', 'No authorization'),
        ],
      },
    ]);
    expect(answer.tree.children.map((c: any) => c.structure)).toEqual(['ZAPP']);
  });

  it('lists nothing when every candidate is absent', async () => {
    fakeClient = clientWith({});
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
    });
    expect(
      JSON.parse(result.content[0].text).append_candidates_unread,
    ).toBeUndefined();
  });
});

describe('SearchSource: a refused object is its own answer, the scan goes on', () => {
  const target = (name: string) => ({
    name,
    type: 'PROG/P',
    packageName: 'ZPKG',
    isPackage: false,
  });
  const refusedRead = (step: string) =>
    carryingFailure(
      new Error('No authorization'),
      {
        message: 'No authorization',
        origin: 'refusal',
        adtType: 'ExceptionResourceNoAuthorization',
        response: { status: 403, data: DOCUMENT },
      } as IAdtError,
      step,
    );

  it('collects the refusal with its object beside the others, and the pool keeps going', async () => {
    const read: string[] = [];
    const sourceReader: ReadSourceUnitsDeps = {
      async readProgram(name) {
        read.push(name);
        if (name === 'ZB') throw refusedRead('read program');
        return 'REPORT x.\n* marker';
      },
      async readInclude() {
        return null;
      },
      async readClassMain() {
        return null;
      },
      async fetchFugrStructure() {
        return [];
      },
      async readFugrFm() {
        return null;
      },
    };
    const result = await runSearchSource(
      {
        fetchPackageContents: async () =>
          [target('ZA'), target('ZB'), target('ZC')] as never,
        sourceReader,
        resolvePackages: async (entries) => entries,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        concurrency: 1,
      },
    );
    // One pump: ZC was read after ZB's refusal.
    expect(read).toEqual(['ZA', 'ZB', 'ZC']);
    expect(result.results.map((h) => h.object_name)).toEqual(['ZA', 'ZC']);
    expect(result.failures).toEqual([
      {
        devclass: 'ZPKG',
        object_type: 'PROG',
        object_name: 'ZB',
        error: expectedPayload('read program'),
      },
    ]);
  });

  it('answers no failures field when nothing failed', async () => {
    const result = await runSearchSource(
      {
        fetchPackageContents: async () => [target('ZA')] as never,
        sourceReader: {
          readProgram: async () => 'marker',
          readInclude: async () => null,
          readClassMain: async () => null,
          fetchFugrStructure: async () => [],
          readFugrFm: async () => null,
        },
        resolvePackages: async (entries) => entries,
      },
      { query: 'marker', packages: ['ZPKG'], object_types: ['PROG'] },
    );
    expect(result.failures).toBeUndefined();
  });

  it('a function group include and module are read through adt-clients, a refusal carried with its step', async () => {
    const calls: Array<{ config: unknown; version: unknown }> = [];
    fakeClient = fakeClientOf({
      read: async (config: unknown, version: unknown) => {
        calls.push({ config, version });
        return forbidden();
      },
    });
    const deps = createSourceReaderDeps(context as any);
    const include = await deps.readInclude('LZFGU01').then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(methodFailureOf(include)).toMatchObject({
      message: 'No authorization',
      step: 'read include',
    });
    const module = await deps.readFugrFm('ZFG', 'Z_FM').then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(methodFailureOf(module)).toMatchObject({
      message: 'No authorization',
      step: 'read function module',
    });
    expect(calls).toEqual([
      { config: { includeName: 'LZFGU01' }, version: undefined },
      {
        config: { functionGroupName: 'ZFG', functionModuleName: 'Z_FM' },
        version: undefined,
      },
    ]);
  });

  it('a function module that is not there is skipped, as before', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const deps = createSourceReaderDeps(context as any);
    await expect(deps.readFugrFm('ZFG', 'Z_FM')).resolves.toBeNull();
  });
});

describe('an activation run whose reading was refused', () => {
  const source = (
    run: () => Promise<unknown>,
    results: () => Promise<unknown> = async () => okResponse(reading('')),
  ) =>
    ({
      getActivationRun: run,
      getActivationResults: results,
    }) as unknown as ActivationRunSource;

  it("is the method's error as it is, with its step — not a message folded into the run's", async () => {
    const outcome = await awaitActivationRun(
      source(async () => forbidden()),
      'RUN-1',
      undefined,
      6,
      0,
    );
    expect(outcome.messages).toEqual([]);
    expect(outcome.settled).toBe(false);
    expect(outcome.failure).toEqual({
      message: 'No authorization',
      origin: 'refusal',
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status: 403, data: DOCUMENT },
      step: 'read activation run',
    });
  });

  it("ActivateObjectLow's group path answers it as the method's error with its step", async () => {
    fakeClient = fakeClientOf({
      activateObjectsGroup: async () => okResponse('RUN-1'),
      getActivationRun: async () => forbidden(),
    });
    const result: any = await handleActivateObject(
      context as any,
      {
        objects: [
          { name: 'ZA', type: 'PROG/P' },
          { name: 'ZB', type: 'PROG/P' },
        ],
      } as any,
    );
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual(expectedPayload('read activation run'));
  });

  it('a refused results read names its own step', async () => {
    const outcome = await awaitActivationRun(
      source(
        async () =>
          okResponse(
            reading(
              '<runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
            ),
          ),
        async () => forbidden(),
      ),
      'RUN-1',
      undefined,
      6,
      0,
    );
    expect(outcome.messages).toEqual([]);
    expect((outcome.failure as { step?: string }).step).toBe(
      'read activation results',
    );
  });
});

describe('GetEnhancements: a probe that SAP refused is not replaced by words', () => {
  const run = (args: Record<string, unknown>) =>
    handleGetEnhancements(
      {
        connection: {
          makeAdtRequest: async () => {
            throw new Error('no request expected');
          },
        },
        logger: undefined,
      } as any,
      args,
    ) as Promise<any>;
  const refused = (status: number, message: string) =>
    refusedResponse(message, {
      adtType: 'ExceptionResourceNoAuthorization',
      response: { status, data: DOCUMENT },
    } as Partial<IAdtError>);

  it('an include SAP refused (403): the method error as it is, with its step', async () => {
    fakeClient = fakeClientOf({
      readMetadata: async () => refused(403, 'No authorization'),
    });
    const result = await run({ object_name: 'ZINC', object_type: 'include' });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual({
      failures: [expectedPayload('read include metadata')],
    });
    expect(result.content[0].text).not.toContain('could not be read');
  });

  it('an include SAP refused (401): the call ends as it came', async () => {
    fakeClient = fakeClientOf({
      readMetadata: async () => refused(401, 'Unauthorized'),
    });
    const result = await run({ object_name: 'ZINC', object_type: 'include' });
    expect(result.isError).toBe(true);
    const body = payloadOf(result);
    expect(body.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
    expect(body.step).toBe('read include metadata');
    expect(body.failures).toBeUndefined();
  });

  it('an unknown type: every refused probe is listed, each with its step', async () => {
    fakeClient = fakeClientOf({
      readMetadata: async () => forbidden(),
    });
    const result = await run({ object_name: 'ZX', object_type: 'unknown' });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toEqual({
      failures: [
        expectedPayload('read class metadata'),
        expectedPayload('read program metadata'),
        expectedPayload('read include metadata'),
      ],
    });
    expect(result.content[0].text).not.toContain('Could not determine');
  });

  it('an unknown type: a credential failure at the first probe ends the call, no further probe', async () => {
    const probed: unknown[] = [];
    const failure = new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
    fakeClient = fakeClientOf({
      readMetadata: async (config: unknown) => {
        probed.push(config);
        throw failure;
      },
    });
    const result = await run({ object_name: 'ZX', object_type: 'unknown' });
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(probed.length).toBe(1);
  });

  it('an unknown type that is absent (404 on every probe) keeps its words', async () => {
    fakeClient = fakeClientOf({ readMetadata: async () => notThere() });
    const result = await run({ object_name: 'ZX', object_type: 'unknown' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Could not determine object type for: ZX',
    );
  });

  it('an include that is absent (404) keeps its words', async () => {
    fakeClient = fakeClientOf({ readMetadata: async () => notThere() });
    const result = await run({ object_name: 'ZINC', object_type: 'include' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Include ZINC could not be read.');
  });
});

describe('GetStructuresList: a credential failure ends the whole call', () => {
  // The sequential version, one request after another: a destination
  // known to have no communication batch. (The batched version reads a
  // level in one envelope: `unit/batch/includeTrees.test.ts`.)
  const notServed = createBatchAvailability();
  notServed.noteOuterStatus(404);
  const sequential = { ...context, batchAvailability: notServed };
  const unauthorized = () =>
    refusedResponse('Unauthorized', {
      response: { status: 401, data: '' },
    } as Partial<IAdtError>);
  const root = okResponse(
    'define structure zs {\n  include zinc1;\n  include zinc2;\n}',
  );

  it('a 401 on the first embedded structure: one call ends as it came, nothing further is read', async () => {
    const read: string[] = [];
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        read.push(config?.structureName ?? config?.tableName);
        return config?.structureName === 'ZS' ? root : unauthorized();
      },
    });
    const result: any = await handleGetStructuresList(sequential as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
      status: 401,
      message: 'Unauthorized',
      step: 'read structure',
    });
    expect(read).toEqual(['ZS', 'ZINC1']);
  });

  it('a thrown credential failure on an embedded structure ends it too', async () => {
    const read: string[] = [];
    const failure = new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        read.push(config?.structureName ?? config?.tableName);
        if (config?.structureName === 'ZS') return root;
        throw failure;
      },
    });
    const result: any = await handleGetStructuresList(sequential as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(read).toEqual(['ZS', 'ZINC1']);
  });

  it('a 403 on an embedded structure stays that node, the walk goes on', async () => {
    const read: string[] = [];
    fakeClient = fakeClientOf({
      read: async (config: any) => {
        read.push(config?.structureName ?? config?.tableName);
        return config?.structureName === 'ZS' ? root : forbidden();
      },
    });
    const result: any = await handleGetStructuresList(sequential as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    expect(result.isError).toBe(false);
    expect(read).toEqual(['ZS', 'ZINC1', 'ZINC1', 'ZINC2', 'ZINC2']);
  });
});
