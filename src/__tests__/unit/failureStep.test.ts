/**
 * A handler never rewrites the method's error; it adds the step where the
 * error arose. SAP's refusal reaches the consumer as the strategy made it —
 * message, origin, status, `adt_type`, raw body — with `step` beside it, and
 * is never turned into an empty result, a `null`, a warning or "not found".
 * A source or level that is not there (`404`) stays what it was.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { handleGetEnhancements as handleGetEnhancementsOf } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetPackageContents as handleGetPackageContentsOf } from '../../handlers/package/readonly/handleGetPackageContents';
import { handleGetStructuresList as handleGetStructuresListOf } from '../../handlers/structure/readonly/handleGetStructuresList';
import { handleDescribeByList as handleDescribeByListOf } from '../../handlers/system/readonly/handleDescribeByList';
import { createBatchAvailability } from '../../lib/batch/availability';
import * as clients from '../../lib/clients';
import { substringLineMatch } from '../../lib/search-source/lineScanner';
import { runSearchSource } from '../../lib/search-source/orchestrator';
import { skipSapAnswers } from '../../lib/search-source/readFailure';
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
import { assertMatchObject, rejectionOf } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
  whereUsedAnswer,
} from '../helpers/fakeClient';
import { levelOf } from '../helpers/nodeLevels';
import { exactPackages, listing } from '../helpers/sourceReaderFake';
import { stateSystemKind } from '../helpers/systemKind';

/** handleGetEnhancements at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleGetEnhancements = (
  context: Parameters<typeof handleGetEnhancementsOf>[0],
  args: Parameters<typeof handleGetEnhancementsOf>[1],
) => handleGetEnhancementsOf(context, { detail: 'full', ...args });

/** handleDescribeByList at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleDescribeByList = (
  context: Parameters<typeof handleDescribeByListOf>[0],
  args: Parameters<typeof handleDescribeByListOf>[1],
) => handleDescribeByListOf(context, { detail: 'full', ...args });

/** handleGetStructuresList at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetStructuresList = (
  context: Parameters<typeof handleGetStructuresListOf>[0],
  args: Parameters<typeof handleGetStructuresListOf>[1],
) => handleGetStructuresListOf(context, { detail: 'full', ...args });

/** handleGetPackageContents at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleGetPackageContents = (
  context: Parameters<typeof handleGetPackageContentsOf>[0],
  args: Parameters<typeof handleGetPackageContentsOf>[1],
) => handleGetPackageContentsOf(context, { detail: 'full', ...args });

// The declared variant the boundary checks a type argument against.
stateSystemKind('onprem');
mock.method(clients, 'createAdtClient', () => fakeClient);
// The declared variant's client, tagged with it (SearchObject's filter is
// that variant's search names).
mock.method(clients, 'adtClientOf', () => ({
  variant: 'onprem',
  client: fakeClient,
}));
// An on-premise group activation is the on-premise client's.
mock.method(clients, 'createOnPremAdtClient', () => fakeClient);

let fakeClient: any;

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
    const update = mock.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({ lock: async () => forbidden(), update });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    assert.equal(result.isError, true);
    assert.deepStrictEqual(payloadOf(result), expectedPayload('lock'));
    assert.equal(update.mock.callCount(), 0);
  });

  it('UpdateClass refused at the update answers the update error with step update, and unlocks', async () => {
    const unlock = mock.fn(async () => okResponse(reading('')));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('HANDLE'),
      update: async () => forbidden('Object is locked by another user'),
      unlock,
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'CLASS zcl_x DEFINITION. ENDCLASS.',
    });
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      payloadOf(result),
      expectedPayload('update', 'Object is locked by another user'),
    );
    assert.equal(unlock.mock.callCount(), 1);
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
    assert.equal(payload.error, 'client_threw');
    assert.equal(payload.message, 'could not parse the answer');
    assert.equal(payload.step, 'update');
    assert.equal(payload.origin, undefined);
    assert.equal(payload.status, undefined);
  });
});

describe('a refusal is not swallowed', () => {
  it('GetPackageContents: a refused level is the method error with its step, not an empty list', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => forbidden() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      payloadOf(result),
      expectedPayload('read package node structure'),
    );
  });

  it('GetPackageContents: a level that is not there stays empty', async () => {
    fakeClient = fakeClientOf({ fetchNodeStructure: async () => notThere() });
    const result: any = await handleGetPackageContents(context as any, {
      package_name: 'ZPKG',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), []);
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
    assert.equal(body.partial_result, true);
    assert.deepStrictEqual(body.error, expectedPayload('read node structure'));
  });

  it('SearchSource: a refused source read is skipped by owner decision (DO17): nothing is yielded', async () => {
    fakeClient = fakeClientOf({ read: async () => forbidden() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(
      deps,
      {
        devclass: 'ZPKG',
        object_type: 'PROG',
        object_name: 'ZPROG',
        code: 'PROG/P',
      },
      'active',
      skipSapAnswers,
    );
    assert.equal((await units.next()).done, true);
  });

  it('SearchSource: a listed source that is not there is skipped (DO17): nothing is yielded', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const deps = createSourceReaderDeps(context as any);
    const units = readSourceUnits(
      deps,
      {
        devclass: 'ZPKG',
        object_type: 'PROG',
        object_name: 'ZPROG',
        code: 'PROG/P',
      },
      'active',
      skipSapAnswers,
    );
    assert.equal((await units.next()).done, true);
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
    assert.equal(result.isError, false);
    const items = result.content.map((c: any) => JSON.parse(c.text));
    assert.deepStrictEqual(items[0], {
      name: 'ZCL_X',
      error: expectedPayload('search'),
    });
    assert.equal(items.length, 2);
    assert.equal(items[1].name, 'ZCL_Y');
    assert.equal(items[1].error, undefined);
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
    assert.equal(result.isError, true);
    assert.deepStrictEqual(payloadOf(result), [
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
    assert.equal(result.isError, true);
    const [structure, table] = payloadOf(result);
    assertMatchObject(structure, {
      step: 'read structure',
      status: 404,
      adt_type: 'ExceptionResourceNotFound',
    });
    assert.deepStrictEqual(
      table,
      failureEntryOf('read table', 'No authorization for the table'),
    );
  });

  it('a 404 from both stays absence, as today', async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
      include_extensions: false,
    });
    assert.equal(result.isError, true);
    assert.ok(
      result.content[0].text.includes(
        'Could not read source for structure/table ZS',
      ),
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
    assert.equal(result.isError, false);
    const [child] = JSON.parse(result.content[0].text).tree.children;
    assert.equal(child.structure, 'ZINC');
    assert.deepStrictEqual(child.error, [
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
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      payloadOf(result),
      expectedPayload('read enhancements'),
    );
  });

  it('a 401: the call ends as it came, with the step', async () => {
    fakeClient = fakeClientOf({
      readEnhancementElements: async () =>
        refusedResponse('Unauthorized', {
          response: { status: 401, data: '' },
        } as Partial<IAdtError>),
    });
    const body = payloadOf(await run());
    assert.equal(body.status, 401);
    assert.equal(body.message, 'Unauthorized');
    assert.equal(body.step, 'read enhancements');
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
          ? okResponse(levelOf([], [{ type: 'PROG/I', nodeId: '10' }]))
          : okResponse(
              levelOf([
                { name: 'ZINC1', type: 'PROG/I' },
                { name: 'ZINC2', type: 'PROG/I' },
              ]),
            ),
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
    // Every object read is listed (Codex round 10), the two that answered.
    assert.equal(body.objects.length, 2);
    assert.equal(body.total_objects_with_enhancements, 0);
    assert.equal(body.total_objects_analyzed, 2); // the main object and ZINC1
    // One unread include, its one failure checked for the fields named.
    const [unread, ...more] = body.includes_unread;
    assert.deepStrictEqual(more, []);
    const { failures, ...rest } = unread;
    assert.deepStrictEqual(rest, {
      include: 'ZINC2',
      step: 'read enhancements',
    });
    assert.equal(failures.length, 1);
    assertMatchObject(failures[0], {
      message: 'Request failed with status code 403',
      origin: 'refusal',
      step: 'read enhancements',
      status: 403,
      raw_body: DOCUMENT,
    });
  });

  it('no include refused: no includes_unread', async () => {
    fakeClient = walk();
    const body = payloadOf(await run());
    assert.equal(body.includes_unread, undefined);
    assert.equal(body.total_objects_analyzed, 3);
  });

  it('a 401 on an include ends the call as it came', async () => {
    fakeClient = walk({ name: 'ZINC1', status: 401 });
    const result = await run();
    assert.equal(result.isError, true);
    const body = payloadOf(result);
    assert.equal(body.status, 401);
    assert.equal(body.includes_unread, undefined);
    assert.equal(body.partial_result, undefined);
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
        fetchPackageContents: async (name) =>
          listing(name, [target('ZA'), target('ZB'), target('ZC')]),
        sourceReader: {
          async readSource(read_) {
            read.push(read_.name);
            if (read_.name === 'ZB') throw failure;
            return { ok: true, value: 'marker' };
          },
          readStructure: async () => ({ ok: true, value: [] }),
        },
        lineMatch: substringLineMatch,
        sapAnswers: skipSapAnswers,
        resolvePackages: exactPackages,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        concurrency: 1,
      },
    );
    assert.equal(await rejectionOf(run), failure);
    assert.deepStrictEqual(read, ['ZA', 'ZB']);
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
        fetchPackageContents: async (name) => listing(name, [target('ZA')]),
        sourceReader: {
          readSource: async () => {
            throw unauthorized;
          },
          readStructure: async () => ({ ok: true, value: [] }),
        },
        lineMatch: substringLineMatch,
        sapAnswers: skipSapAnswers,
        resolvePackages: exactPackages,
      },
      { query: 'marker', packages: ['ZPKG'], object_types: ['PROG'] },
    );
    assert.equal(await rejectionOf(run), unauthorized);
  });

  // The sequential versions, one request after another: a destination known
  // to have no communication batch. (The batched versions send every object's
  // read in one envelope: `unit/batch/objectLists.test.ts`.)
  const oneByOne = () => {
    const notServed = createBatchAvailability();
    notServed.noteOuterStatus(404);
    return { ...context, batchAvailability: notServed };
  };

  it('DescribeByList: the answer is the failure as it came, no object after it is searched', async () => {
    const searched: string[] = [];
    fakeClient = fakeClientOf({
      search: async (criteria: any) => {
        searched.push(criteria?.query);
        throw credential();
      },
    });
    const result: any = await handleDescribeByList(oneByOne() as any, {
      objects: [
        { name: 'ZCL_X', type: 'CLAS/OC' },
        { name: 'ZCL_Y', type: 'CLAS/OC' },
      ],
    });
    assert.equal(result.isError, true);
    assertMatchObject(payloadOf(result), { error: 'authentication_failed' });
    assert.equal(payloadOf(result).step, undefined);
    assert.deepStrictEqual(new Set(searched), new Set(['ZCL_X']));
  });
});

describe('GetStructuresList: an append candidate SAP refused to read is listed', () => {
  const whereUsedNaming = (...names: string[]) =>
    whereUsedAnswer(
      ...names.map((name): [string, string] => [name, 'TABL/DS']),
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
    assert.equal(result.isError, false);
    const answer = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(answer.append_candidates_unread, [
      {
        candidate: 'ZREFUSED',
        step: 'read append candidate',
        failures: [
          failureEntryOf('read structure', 'No authorization'),
          failureEntryOf('read table', 'No authorization'),
        ],
      },
    ]);
    assert.deepStrictEqual(
      answer.tree.children.map((c: any) => c.structure),
      ['ZAPP'],
    );
  });

  it('terse names each candidate SAP refused to read', async () => {
    fakeClient = clientWith({
      ZREFUSED: () => forbidden(),
      ZAPP: () => okResponse('extend type zs with zapp { }'),
    });
    const result: any = await handleGetStructuresListOf(context as any, {
      structure_name: 'ZS',
    });
    const lines = result.content[0].text.split('\n');
    assert.ok(
      lines.includes('# append_candidate_unread\tZREFUSED'),
      lines.join('\n'),
    );
  });

  it('lists nothing when every candidate is absent', async () => {
    fakeClient = clientWith({});
    const result: any = await handleGetStructuresList(context as any, {
      structure_name: 'ZS',
    });
    assert.equal(
      JSON.parse(result.content[0].text).append_candidates_unread,
      undefined,
    );
  });
});

describe('SearchSource: a refused object is skipped, the scan goes on (DO17)', () => {
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

  it('skips the refused object with no entry, and the pool keeps going', async () => {
    const read: string[] = [];
    const sourceReader: ReadSourceUnitsDeps = {
      async readSource(read_) {
        read.push(read_.name);
        if (read_.name === 'ZB') throw refusedRead('read program');
        return { ok: true, value: 'REPORT x.\n* marker' };
      },
      async readStructure() {
        return { ok: true, value: [] };
      },
    };
    const result = await runSearchSource(
      {
        fetchPackageContents: async (name) =>
          listing(name, [target('ZA'), target('ZB'), target('ZC')]),
        sourceReader,
        lineMatch: substringLineMatch,
        sapAnswers: skipSapAnswers,
        resolvePackages: exactPackages,
      },
      {
        query: 'marker',
        packages: ['ZPKG'],
        object_types: ['PROG'],
        concurrency: 1,
      },
    );
    // One pump: ZC was read after ZB's refusal.
    assert.deepStrictEqual(read, ['ZA', 'ZB', 'ZC']);
    assert.deepStrictEqual(
      result.results.map((h) => h.object_name),
      ['ZA', 'ZC'],
    );
    assert.ok(!Object.keys(result).includes('failures'));
    assert.equal(result.scanned.objects, 2);
  });

  it("a function group include and module are read through adt-clients at the call's version, a refusal answered with SAP's error", async () => {
    const calls: Array<{ config: unknown; version: unknown }> = [];
    fakeClient = fakeClientOf({
      read: async (config: unknown, version: unknown) => {
        calls.push({ config, version });
        return forbidden();
      },
    });
    const deps = createSourceReaderDeps(context as any);
    const include = await deps.readSource({
      reader: 'include',
      name: 'LZFGU01',
      version: 'inactive',
    });
    assert.equal(include.ok, false);
    if (!include.ok) {
      assertMatchObject(include.error, { message: 'No authorization' });
    }
    const module = await deps.readSource({
      reader: 'functionModule',
      group: 'ZFG',
      name: 'Z_FM',
      version: 'inactive',
    });
    assert.equal(module.ok, false);
    assert.deepStrictEqual(calls, [
      { config: { includeName: 'LZFGU01' }, version: 'inactive' },
      {
        config: { functionGroupName: 'ZFG', functionModuleName: 'Z_FM' },
        version: 'inactive',
      },
    ]);
  });

  it("a function module that is not there answers SAP's 404, for the scan to judge", async () => {
    fakeClient = fakeClientOf({ read: async () => notThere() });
    const deps = createSourceReaderDeps(context as any);
    const answer = await deps.readSource({
      reader: 'functionModule',
      group: 'ZFG',
      name: 'Z_FM',
      version: 'active',
    });
    assert.equal(answer.ok, false);
    if (!answer.ok) assert.equal(answer.error.response?.status, 404);
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
      analyseException,
      [],
    );
    assert.deepStrictEqual(outcome.messages, []);
    assert.equal(outcome.status, '');
    assert.deepStrictEqual(outcome.failure, {
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
    assert.equal(result.isError, true);
    assert.deepStrictEqual(
      payloadOf(result),
      expectedPayload('read activation run'),
    );
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
      analyseException,
      [],
    );
    assert.deepStrictEqual(outcome.messages, []);
    assert.equal(
      (outcome.failure as { step?: string }).step,
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
    assert.equal(result.isError, true);
    assert.deepStrictEqual(payloadOf(result), {
      failures: [expectedPayload('read include metadata')],
    });
    assert.ok(!result.content[0].text.includes('could not be read'));
  });

  it('an include SAP refused (401): the call ends as it came', async () => {
    fakeClient = fakeClientOf({
      readMetadata: async () => refused(401, 'Unauthorized'),
    });
    const result = await run({ object_name: 'ZINC', object_type: 'include' });
    assert.equal(result.isError, true);
    const body = payloadOf(result);
    assert.equal(body.status, 401);
    assert.equal(body.message, 'Unauthorized');
    assert.equal(body.step, 'read include metadata');
    assert.equal(body.failures, undefined);
  });

  it('an unknown type: every refused probe is listed, each with its step', async () => {
    fakeClient = fakeClientOf({
      readMetadata: async () => forbidden(),
    });
    const result = await run({ object_name: 'ZX', object_type: 'unknown' });
    assert.equal(result.isError, true);
    assert.deepStrictEqual(payloadOf(result), {
      failures: [
        expectedPayload('read class metadata'),
        expectedPayload('read program metadata'),
        expectedPayload('read include metadata'),
      ],
    });
    assert.ok(!result.content[0].text.includes('Could not determine'));
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
    assert.equal(result.isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.equal(probed.length, 1);
  });

  it('an unknown type that is absent (404 on every probe) keeps its words', async () => {
    fakeClient = fakeClientOf({ readMetadata: async () => notThere() });
    const result = await run({ object_name: 'ZX', object_type: 'unknown' });
    assert.equal(result.isError, true);
    assert.ok(
      result.content[0].text.includes(
        'Could not determine object type for: ZX',
      ),
    );
  });

  it('an include that is absent (404) keeps its words', async () => {
    fakeClient = fakeClientOf({ readMetadata: async () => notThere() });
    const result = await run({ object_name: 'ZINC', object_type: 'include' });
    assert.equal(result.isError, true);
    assert.ok(
      result.content[0].text.includes('Include ZINC could not be read.'),
    );
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
    assert.equal(result.isError, true);
    assertMatchObject(payloadOf(result), {
      status: 401,
      message: 'Unauthorized',
      step: 'read structure',
    });
    assert.deepStrictEqual(read, ['ZS', 'ZINC1']);
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
    assert.equal(result.isError, true);
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.deepStrictEqual(read, ['ZS', 'ZINC1']);
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
    assert.equal(result.isError, false);
    assert.deepStrictEqual(read, ['ZS', 'ZINC1', 'ZINC1', 'ZINC2', 'ZINC2']);
  });
});
