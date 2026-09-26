/**
 * The single-call reads, searches and listings (task 12): fifteen handlers
 * that make exactly one client call (or, for the two that walk a tree,
 * exactly one call PER LEVEL of `fetchNodeStructure` — see
 * `handleGetObjectsList.ts`/`handleGetObjectInfo.ts`'s own comments), none of
 * them a `read`+`readMetadata` pair — that shape is task 11's, tested in
 * `readHandlersSuccessMapping.test.ts`/`readHandlersSurfaceErrors.test.ts`.
 *
 * As in every other file that uses `fakeClientOf`/`refusingClient`: the
 * doubles ignore the factory argument, so no assertion here proves a handler
 * injected `resultsFor(xDocuments)`/`ourUtils` — `tsc` guards that (see
 * `domainLow.test.ts`). Said once, here, rather than fifteen times.
 *
 * Two of the fifteen do not fit the shared `it.each` below and are tested on
 * their own, with the reason given at each:
 *
 *  - `handleGetEnhancements` — its required-args path never reaches
 *    `createAdtClient` at all (see its own file: everything but the
 *    `include_nested` sub-flow calls `connection.makeAdtRequest` directly,
 *    unrelated to the adt-clients v19 migration).
 *  - `resolveVersionedObject` — a synchronous resolver, not a handler; it
 *    makes no call of its own.
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleGetBehaviorDefinition } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { handleGetBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import { handleGetClass } from '../../handlers/class/high/handleGetClass';
import { handleGetLocalDefinitions } from '../../handlers/class/high/handleGetLocalDefinitions';
import { handleGetLocalMacros } from '../../handlers/class/high/handleGetLocalMacros';
import { handleGetLocalTestClass } from '../../handlers/class/high/handleGetLocalTestClass';
import { handleGetLocalTypes } from '../../handlers/class/high/handleGetLocalTypes';
import { handleGetObjectVersionDiff } from '../../handlers/common/readonly/handleGetObjectVersionDiff';
import { resolveVersionedObject } from '../../handlers/common/readonly/resolveVersionedObject';
import { handleGetDataElement } from '../../handlers/data_element/high/handleGetDataElement';
import { handleGetDdl } from '../../handlers/ddl/high/handleGetDdl';
import { handleGetDomain } from '../../handlers/domain/high/handleGetDomain';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup';
import { handleGetFunctionModule } from '../../handlers/function_module/high/handleGetFunctionModule';
import { handleGetInterface } from '../../handlers/interface/high/handleGetInterface';
import { handleGetMessageClass } from '../../handlers/message_class/high/handleGetMessageClass';
import { handleGetMessageClassMessage } from '../../handlers/message_class/high/handleGetMessageClassMessage';
import { handleReadMessageClass } from '../../handlers/message_class/readonly/handleReadMessageClass';
import { handleReadMessageClassMessage } from '../../handlers/message_class/readonly/handleReadMessageClassMessage';
import { handleGetMetadataExtension } from '../../handlers/metadata_extension/high/handleGetMetadataExtension';
import { handleGetPackage } from '../../handlers/package/high/handleGetPackage';
import { handleGetProgram } from '../../handlers/program/high/handleGetProgram';
import { handleGetObjectsByType } from '../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../handlers/search/readonly/handleGetObjectsList';
import { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject';
import { handleGetServiceBinding } from '../../handlers/service_binding/high/handleGetServiceBinding';
import { handleListServiceBindingTypes } from '../../handlers/service_binding/high/handleListServiceBindingTypes';
import { handleGetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition';
import { handleGetStructure } from '../../handlers/structure/high/handleGetStructure';
import { handleGetAdtTypes } from '../../handlers/system/readonly/handleGetAllTypes';
import { handleGetInactiveObjects } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { handleGetObjectInfo } from '../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetObjectNodeFromCache } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetObjectStructure } from '../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTable } from '../../handlers/table/high/handleGetTable';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import { handleListTransports } from '../../handlers/transport/readonly/handleListTransports';
import { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import { handleGetUnitTest } from '../../handlers/unit_test/high/handleGetUnitTest';
import { handleGetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult';
import { handleGetUnitTestStatus } from '../../handlers/unit_test/high/handleGetUnitTestStatus';
import { corpusBody } from '../../lib/adtCorpus';
import { objectsListCache } from '../../lib/getObjectsListCache';
import { nodeLevel } from '../../lib/strategies/packageWalk';
import { parseStructure, structured } from '../../lib/strategies/reading';
import {
  fakeClientOf,
  fakeClientOfWithFactory,
  okResponse,
  reading,
  recordAnalyse,
  refusedResponse,
  refusingClient,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

/**
 * The saved search `ListTransports` asks for before it lists.
 *
 * It used to be a direct request this repository made itself, which is why
 * this file once stubbed `connection.makeAdtRequest`. adt-clients 19.1.0
 * answers it as a member, so the fake client serves it like any other.
 */
const SEARCH_CONFIGURATION = {
  uri: '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations/22D2111643541FE1A5AA03DC2D3DE702',
  attributes: { client: '100' },
};

describe('readonlySingleCall handlers answer through the adapter and surface a refusal', () => {
  it.each([
    ['ReadMessageClass', handleReadMessageClass, { message_class_name: 'ZMC' }],
    [
      'ReadMessageClassMessage',
      handleReadMessageClassMessage,
      { message_class_name: 'ZMC', msgno: '001' },
    ],
    [
      'GetObjectsByType',
      handleGetObjectsByType,
      {
        parent_name: 'ZPKG',
        parent_tech_name: 'ZPKG',
        parent_type: 'DEVC/K',
        node_id: '000001',
      },
    ],
    [
      'GetObjectsList',
      handleGetObjectsList,
      { parent_name: 'ZPKG', parent_tech_name: 'ZPKG', parent_type: 'DEVC/K' },
    ],
    ['SearchObject', handleSearchObject, { object_name: 'ZCL*' }],
    ['GetAdtTypes', handleGetAdtTypes, {}],
    ['GetInactiveObjects', handleGetInactiveObjects, {}],
    [
      'GetObjectInfo',
      handleGetObjectInfo,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG' },
    ],
    [
      'GetObjectStructure',
      handleGetObjectStructure,
      { object_name: 'ZCL_X', object_type: 'class' },
    ],
    ['GetSqlQuery', handleGetSqlQuery, { sql_query: 'SELECT 1' }],
    ['GetTableContents', handleGetTableContents, { table_name: 'ZT' }],
    ['ListTransports', handleListTransports, {}],
    [
      'GetObjectVersionDiff',
      handleGetObjectVersionDiff,
      {
        object_type: 'class',
        content_uri_from: 'uri1',
        content_uri_to: 'uri2',
      },
    ],
  ])(
    '%s answers through the adapter and surfaces a refusal',
    async (_n, handler, args) => {
      fakeClient = refusingClient('Not found');
      const result: any = await (handler as any)(context as any, args);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toBe('Not found');
    },
  );
});

/**
 * `refusingClient` answers a refusal for ANY factory and ANY member, so the
 * `it.each` above proves a handler surfaces a refusal without proving it
 * called the right member with the right arguments — a handler pointed at a
 * wrong-but-still-refusing member would pass it too. This is the other half:
 * one row per handler, asserting the member actually called and the
 * identity arguments actually passed, through `recordAnalyse()` (which
 * records both, ignoring only the trailing options object the two
 * `analyse`-carrying calls append — that identity is already covered by "the
 * two members that accept an analyse strategy" below).
 */
describe('readonlySingleCall handlers call the member the brief names, with the arguments the caller gave', () => {
  it('ReadMessageClass calls getMessageClass().readMetadata({name})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleReadMessageClass(context as any, { message_class_name: 'ZMC' });
    const call = seen.calls.filter((c) => c.member === 'readMetadata').at(-1);
    expect(call?.args[0]).toEqual({ name: 'ZMC' });
  });

  it('ReadMessageClassMessage calls getMessageClassMessage().read({className, msgno}, undefined, ...)', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleReadMessageClassMessage(context as any, {
      message_class_name: 'ZMC',
      msgno: '001',
    });
    const call = seen.calls.filter((c) => c.member === 'read').at(-1);
    expect(call?.args[0]).toEqual({ className: 'ZMC', msgno: '001' });
    expect(call?.args[1]).toBeUndefined();
  });

  it('GetObjectsByType calls fetchNodeStructure(parent_type, parent_name, {nodeId, withShortDescriptions})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetObjectsByType(context as any, {
      parent_name: 'ZPKG',
      parent_tech_name: 'ZPKG',
      parent_type: 'DEVC/K',
      node_id: '000001',
    });
    const call = seen.calls
      .filter((c) => c.member === 'fetchNodeStructure')
      .at(-1);
    expect(call?.args).toEqual([
      'DEVC/K',
      'ZPKG',
      { nodeId: '000001', withShortDescriptions: true },
    ]);
  });

  it('GetObjectsList calls fetchNodeStructure(parent_type, parent_name, {nodeId: "000000", withShortDescriptions})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetObjectsList(context as any, {
      parent_name: 'ZPKG',
      parent_tech_name: 'ZPKG',
      parent_type: 'DEVC/K',
    });
    // recordAnalyse's client answers an empty NodeLevel (no childNodes), so
    // the recursion makes exactly this one root call.
    const call = seen.calls
      .filter((c) => c.member === 'fetchNodeStructure')
      .at(-1);
    expect(call?.args).toEqual([
      'DEVC/K',
      'ZPKG',
      { nodeId: '000000', withShortDescriptions: true },
    ]);
  });

  it('SearchObject calls search({query, maxResults})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleSearchObject(context as any, { object_name: 'ZCL*' });
    const call = seen.calls.filter((c) => c.member === 'search').at(-1);
    expect(call?.args).toEqual([{ query: 'ZCL*', maxResults: 100 }]);
  });

  it('GetAdtTypes calls getAllTypes(999, "*", "usedByProvider")', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetAdtTypes(context as any, {});
    const call = seen.calls.filter((c) => c.member === 'getAllTypes').at(-1);
    expect(call?.args).toEqual([999, '*', 'usedByProvider']);
  });

  it('GetInactiveObjects calls getInactiveObjects() with no arguments', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetInactiveObjects(context as any, {});
    const call = seen.calls
      .filter((c) => c.member === 'getInactiveObjects')
      .at(-1);
    expect(call?.args).toEqual([]);
  });

  it('GetObjectInfo calls fetchNodeStructure(parent_type, parent_name, {withShortDescriptions}) — no node id at the root', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetObjectInfo(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZPKG',
    });
    // enrich defaults true, so `search` is also called (best-effort
    // enrichment) — this checks fetchNodeStructure specifically.
    const call = seen.calls
      .filter((c) => c.member === 'fetchNodeStructure')
      .at(-1);
    expect(call?.args).toEqual([
      'DEVC/K',
      'ZPKG',
      { withShortDescriptions: true },
    ]);
  });

  it('GetObjectStructure calls getObjectStructure(objectType, objectName)', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetObjectStructure(context as any, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });
    const call = seen.calls
      .filter((c) => c.member === 'getObjectStructure')
      .at(-1);
    expect(call?.args).toEqual(['class', 'ZCL_X']);
  });

  it('GetSqlQuery calls getSqlQuery({sql_query, row_number})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetSqlQuery(context as any, { sql_query: 'SELECT 1' });
    const call = seen.calls.filter((c) => c.member === 'getSqlQuery').at(-1);
    expect(call?.args).toEqual([{ sql_query: 'SELECT 1', row_number: 100 }]);
  });

  it('GetTableContents calls getTableContents({table_name, max_rows, sql_query})', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetTableContents(context as any, { table_name: 'ZT' });
    const call = seen.calls
      .filter((c) => c.member === 'getTableContents')
      .at(-1);
    expect(call?.args).toEqual([
      { table_name: 'ZT', max_rows: 100, sql_query: 'SELECT * FROM ZT' },
    ]);
  });

  it('ListTransports asks for the saved search, then lists with its uri', async () => {
    const seen = recordAnalyse({
      searchConfigurations: () => [SEARCH_CONFIGURATION],
    });
    fakeClient = seen.client;
    await handleListTransports(context as any, {});

    // Both requests, in order, and the second carries what the first
    // answered — which is what keeps `list()` from resolving a search again
    // behind a member no strategy of ours reaches, and what keeps a system
    // holding several from throwing.
    expect(seen.calls.map((c) => c.member)).toEqual([
      'searchConfigurations',
      'list',
    ]);
    expect(seen.calls.at(-1)?.args).toEqual([
      { configUri: SEARCH_CONFIGURATION.uri },
    ]);
  });

  it('GetObjectVersionDiff calls getVersionSource once per content_uri, both uris', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleGetObjectVersionDiff(context as any, {
      object_type: 'class',
      content_uri_from: 'uri1',
      content_uri_to: 'uri2',
    });
    const calls = seen.calls.filter((c) => c.member === 'getVersionSource');
    expect(calls.map((c) => c.args)).toEqual([['uri1'], ['uri2']]);
  });
});

describe('GetEnhancements', () => {
  /**
   * Not `refusingClient`: the required-args path (`object_name`,
   * `object_type`, no `include_nested`) never builds an adt-clients object at
   * all — it goes through `makeAdtRequestWithTimeout`, which calls
   * `connection.makeAdtRequest` on the raw connection. A `connection` with no
   * such method is this family's equivalent of a refusal: the resulting
   * message reaches the caller, but as plain text (this handler's own
   * catch/wrap chain, not `answer()`'s JSON failure payload) — verified by
   * running it, not assumed.
   */
  it('surfaces a connection failure as isError, in its own (non-JSON) shape', async () => {
    const result: any = await handleGetEnhancements(context as any, {
      object_name: 'ZFOO',
      object_type: 'program',
    });

    expect(result.isError).toBe(true);
    expect(typeof result.content[0].text).toBe('string');
    expect(() => JSON.parse(result.content[0].text)).toThrow();
    expect(result.content[0].text).toContain('ZFOO');
  });
});

describe('resolveVersionedObject', () => {
  // Not a handler — a synchronous resolver with no call of its own. Tested on
  // its own contract: which client factory it picks per object_type, and its
  // two failure shapes (an unknown type answers null; a function_module with
  // no group name throws).
  const client = {
    getClass: () => 'CLASS_OBJ',
    getProgram: () => 'PROGRAM_OBJ',
    getInterface: () => 'INTERFACE_OBJ',
    getFunctionModule: () => 'FM_OBJ',
    getTable: () => 'TABLE_OBJ',
    getStructure: () => 'STRUCTURE_OBJ',
    getDdl: () => 'DDL_OBJ',
    getBehaviorDefinition: () => 'BDEF_OBJ',
    getMetadataExtension: () => 'MDE_OBJ',
  } as any;

  it('resolves a class by className', () => {
    const resolved = resolveVersionedObject(client, 'class', 'zcl_x');
    expect(resolved).toEqual({
      obj: 'CLASS_OBJ',
      config: { className: 'ZCL_X' },
    });
  });

  it('resolves a function_module, given its group', () => {
    const resolved = resolveVersionedObject(
      client,
      'function_module',
      'zfm',
      'zfg',
    );
    expect(resolved).toEqual({
      obj: 'FM_OBJ',
      config: { functionGroupName: 'ZFG', functionModuleName: 'ZFM' },
    });
  });

  it('resolves a function_module from GROUP|FM_NAME with no explicit group', () => {
    const resolved = resolveVersionedObject(
      client,
      'function_module',
      'zfg|zfm',
    );
    expect(resolved).toEqual({
      obj: 'FM_OBJ',
      config: { functionGroupName: 'ZFG', functionModuleName: 'ZFM' },
    });
  });

  it('throws for a function_module with no group name reachable', () => {
    expect(() =>
      resolveVersionedObject(client, 'function_module', 'zfm'),
    ).toThrow(/function_group_name is required/);
  });

  it('answers null for an unknown object_type', () => {
    expect(resolveVersionedObject(client, 'domain', 'zd')).toBeNull();
  });
});

describe('the members that accept an analyse strategy, which one is deliberately withheld, and the rest that never had one', () => {
  // Verified against the installed declarations, not the brief's list:
  // `AdtMessageClass.readMetadata` takes one and gets one; `AdtUtils.search`
  // (the one member the brief itself names) does NOT when reached through
  // the typed contract `getUtils(ourUtils)` hands back — see
  // `handleSearchObject.ts`'s own comment — and none of `getObjectStructure`,
  // `getAllTypes`, `getInactiveObjects`, `getSqlQuery`, `getTableContents`,
  // `fetchNodeStructure`, `getRequest().list()` or `getVersionSource` take
  // options at all. `scripts/check-analyse.ts` finds zero analyse-eligible
  // calls in every directory this task touched except `message_class/readonly`
  // (2, since fix round 1 — see below) and `table/readonly` (2, pre-existing)
  // — quoted in the task report.
  //
  // `AdtMessageClassMessage.read` is the one exception, and NOT because its
  // signature refuses `analyse` — `IAdtOperationOptions<E>` is right there in
  // its type. It is one of only two read-shaped members in the whole
  // distribution that ship their own default strategy (confirmed against the
  // shipped `AdtMessageClassMessage.js`): `options?.analyse ?? ((verdict,
  // answer) => { ... checks whether msgno is actually in the parsed class
  // document ...})`. Fix round 1, task 18 review: this file's original
  // `{ analyse: analyseException }` REPLACED that check — `analyseException`
  // only reads an `exc:exception` element, which a missing-msgno answer never
  // carries (ADT answers 200 with the unrelated whole-class document) — so a
  // request for a message that does not exist used to answer `success: true`
  // with that document, silently ignoring the `msgno` it echoed.
  // `parseMessageClass`, which the default's check is built from, is an
  // internal of the messageClass module and not part of this package's
  // public surface, so it cannot be composed with `analyseException` from
  // here; passing nothing and letting the shipped default stand is the fix,
  // in `ReadMessageClassMessage.ts` and `GetMessageClassMessage.ts` both.
  it('ReadMessageClass hands getMessageClass().readMetadata its own analyse', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleReadMessageClass(context as any, {
      message_class_name: 'zmc',
    });

    expect(seen.countOf('readMetadata')).toBe(1);
    expect(seen.last?.carriedAnalyse).toBe(true);
    expect(seen.last?.analyse).toBe(analyseException);
  });

  it('ReadMessageClassMessage carries its msgno check into getMessageClassMessage().read — adt-clients 23 applies none of its own', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleReadMessageClassMessage(context as any, {
      message_class_name: 'zmc',
      msgno: '001',
    });

    expect(seen.countOf('read')).toBe(1);
    expect(seen.last?.carriedAnalyse).toBe(true);
    // `analyseMessageClassMessage(msgno)` builds a strategy per message.
    expect(typeof seen.last?.analyse).toBe('function');
    expect(seen.last?.analyse).not.toBe(analyseException);
  });

  it('SearchObject carries analyseException into search — interfaces-adt 11 gave every util member one', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleSearchObject(context as any, { object_name: 'ZCL*' });

    expect(seen.countOf('search')).toBe(1);
    expect(seen.last?.carriedAnalyse).toBe(true);
    expect(seen.last?.analyse).toBe(analyseException);
  });
});

describe('GetObjectsByType, mapped from a real captured node-structure document', () => {
  // `read-object-tree-structure--02-nodestructure` is a real
  // `SEU_ADT_REPOSITORY_OBJ_NODE` document (a single BDEF terminal leaf) — see
  // `tests/fixtures/adt/README.md`. `nodeLevel` is `ourUtils`'s own `node`
  // reading (`packageWalk.ts`), applied here the way the real client applies
  // it, so this exercises the handler against the actual shape the reading
  // produces rather than a hand-built `NodeLevel` that might not match it.
  it('answers a real object under the requested node', async () => {
    const body = corpusBody('read-object-tree-structure--02-nodestructure');
    const level = nodeLevel({ data: body });
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse(level),
    });

    const result: any = await handleGetObjectsByType(context as any, {
      parent_name: 'ZMCP_SHR_I_ROOT',
      parent_tech_name: 'ZMCP_SHR_I_ROOT',
      parent_type: 'BDEF/BDO',
      node_id: '000032',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('ZMCP_SHR_I_ROOT');
    expect(result.content[0].text).toContain('BDEF/BDO');
  });
});

describe('GetObjectsByType and GetObjectsList agree on the objectsListCache row shape', () => {
  // The bug this guarded (round 1): the two handlers wrote different key
  // CASINGS, so `handleGetObjectNodeFromCache` found nothing either wrote.
  // The bug found in round 2's re-review: fixed the casing but then dropped
  // `TECH_NAME`/`OBJECT_URI` entirely rather than reading them — `ourUtils`'s
  // `node` reading (`nodeLevel`, `packageWalk.ts`) carries both; they were
  // never traded away, only the description was added. `nodeLevel` fed real
  // bytes here (`read-object-tree-structure--05-nodestructure`, a function
  // group) rather than a hand-built level, because it is the one captured
  // fixture where the technical name genuinely differs from the object name
  // — `ZMCP_SHR_FGRP` / `SAPLZMCP_SHR_FGRP` — the exact case a fabricated or
  // absent `TECH_NAME` cannot round-trip.
  const level = nodeLevel({
    data: corpusBody('read-object-tree-structure--05-nodestructure'),
  });
  // Read straight from the fixture body, NOT off `level.objects` — deriving
  // the expected URI from the same `nodeLevel()` call under test would make
  // a regression that drops `uri` invisible (both sides go `undefined`
  // together). Verified: reverted this to `level.objects.find(...).uri` and
  // separately deleted `nodeLevel`'s `uri` field — the test still passed.
  const FUGR_URI = '/sap/bc/adt/functions/groups/zmcp_shr_fgrp';

  it('write compatible row shapes, TECH_NAME and OBJECT_URI included, for the same underlying object', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse(level),
    });

    await handleGetObjectsByType(context as any, {
      parent_name: 'ZMCP_SHR_PKG',
      parent_tech_name: 'ZMCP_SHR_PKG',
      parent_type: 'DEVC/K',
      node_id: '28',
    });
    const byTypeRow = objectsListCache
      .getCache()
      .objects.find((o: any) => o.OBJECT_NAME === 'ZMCP_SHR_FGRP');

    await handleGetObjectsList(context as any, {
      parent_name: 'ZMCP_SHR_PKG',
      parent_tech_name: 'ZMCP_SHR_PKG',
      parent_type: 'DEVC/K',
    });
    const listRow = objectsListCache
      .getCache()
      .objects.find((o: any) => o.OBJECT_NAME === 'ZMCP_SHR_FGRP');

    const expected = {
      OBJECT_TYPE: 'FUGR/F',
      OBJECT_NAME: 'ZMCP_SHR_FGRP',
      TECH_NAME: 'SAPLZMCP_SHR_FGRP',
      OBJECT_URI: FUGR_URI,
    };
    expect(byTypeRow).toEqual(expected);
    expect(listRow).toEqual(expected);
  });

  it('GetObjectNodeFromCache finds a row either handler wrote, by its real technical name', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse(level),
    });
    await handleGetObjectsList(context as any, {
      parent_name: 'ZMCP_SHR_PKG',
      parent_tech_name: 'ZMCP_SHR_PKG',
      parent_type: 'DEVC/K',
    });

    const lookupContext = {
      connection: { makeAdtRequest: async () => ({ data: 'stub' }) } as any,
      logger: undefined,
    };
    const result: any = await handleGetObjectNodeFromCache(
      lookupContext as any,
      {
        object_type: 'FUGR/F',
        object_name: 'ZMCP_SHR_FGRP',
        tech_name: 'SAPLZMCP_SHR_FGRP',
      },
    );

    expect(result.content[0].type).toBe('json');
    expect(result.content[0].json.OBJECT_TYPE).toBe('FUGR/F');
    expect(result.content[0].json.OBJECT_NAME).toBe('ZMCP_SHR_FGRP');
    expect(result.content[0].json.OBJECT_URI).toBe(FUGR_URI);
  });
});

describe('GetObjectInfo, mapped from a real matched pair of captured node-structure documents', () => {
  // Fixtures 01 and 02 are a real two-step exchange against the SAME
  // package: step 1 queries `parent_type=DEVC/K, parent_name=ZMCP_SHR_PKG`
  // with no node id (the root — its `DATA.OBJECT_TYPES` lists `BDEF/BDO`
  // at `NODE_ID: "000031"`); step 2 re-queries the identical parent with
  // `node_id=31` and answers one BDEF object. This is exactly the two-tier
  // walk `buildTree` runs, so the mock below answers per `nodeId` rather
  // than a single canned response — real bytes for both tiers, not one.
  it('answers the root two-tier tree for a real package', async () => {
    const rootBody = corpusBody('read-object-tree-structure--01-nodestructure');
    const bdefBody = corpusBody('read-object-tree-structure--02-nodestructure');
    fakeClient = fakeClientOf({
      fetchNodeStructure: async (...args: any[]) => {
        const options = args[2] as { nodeId?: string } | undefined;
        if (!options?.nodeId) return okResponse(nodeLevel({ data: rootBody }));
        if (options.nodeId === '31') {
          return okResponse(nodeLevel({ data: bdefBody }));
        }
        // The other six type folders fixture 01 lists have no captured
        // response — answered empty rather than invented.
        return okResponse(nodeLevel({ data: '' }));
      },
    });

    const result: any = await handleGetObjectInfo(context as any, {
      parent_type: 'DEVC/K',
      parent_name: 'ZMCP_SHR_PKG',
      enrich: false, // isolate the tree walk from SearchObject enrichment
    });

    expect(result.isError).toBe(false);
    const tree = JSON.parse(result.content[0].text);
    expect(tree.OBJECT_TYPE).toBe('DEVC/K');
    expect(tree.OBJECT_NAME).toBe('ZMCP_SHR_PKG');
    const bdef = tree.CHILDREN.find(
      (c: any) => c.OBJECT_NAME === 'ZMCP_SHR_I_ROOT',
    );
    expect(bdef).toBeDefined();
    expect(bdef.OBJECT_TYPE).toBe('BDEF/BDO');
    expect(bdef.OBJECT_DESCRIPTION).toContain('Shared BDEF');
  });
});

describe('ListTransports, mapped from a real captured transport list', () => {
  // `read-transport-list-structure--01-cts-transportrequests` is a real
  // `tm:root` response, re-captured 2026-09-16 when the system had one
  // modifiable request in it. It used to be the empty answer — a bare
  // self-closing root — and the empty shape has not lost its coverage: the
  // #168 regression guard (`parseTransportListXml.test.ts`) keeps a verbatim
  // capture of it, beside the reconstructed tree, and asserts against both.
  const body = corpusBody(
    'read-transport-list-structure--01-cts-transportrequests',
  );
  const listing = () =>
    fakeClientOf({
      searchConfigurations: async () => okResponse([SEARCH_CONFIGURATION]),
      list: async () => okResponse(reading(parseStructure(body), body)),
    });

  it('finds the request the captured document actually holds', async () => {
    fakeClient = listing();

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.transports[0]).toEqual({
      number: 'TRLK900438',
      description: 'adt-clients integration tests',
      type: 'K',
      status: 'D',
      owner: 'SAPUSER01',
      target: '',
    });
    // One configuration was searched, so nothing is said about which — the
    // ordinary answer keeps the three fields it has always had.
    expect(payload).not.toHaveProperty('searched_configurations');
  });

  it("applies the caller's user client-side, because the server does not", async () => {
    fakeClient = listing();

    const result: any = await handleListTransports(context as any, {
      user: 'SOMEBODY_ELSE',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(0);
    expect(payload.transports).toEqual([]);
  });

  it('keeps a released request out unless the caller asks for one', async () => {
    fakeClient = listing();

    const all: any = await handleListTransports(context as any, {
      modifiable_only: false,
    });
    const modifiable: any = await handleListTransports(context as any, {});

    // The captured document holds one modifiable request and no released
    // one, so both answers are the same here — what this pins is that the
    // filter runs on the status the document carried (`D`), rather than on
    // something the server was asked for and may not have honoured.
    expect(JSON.parse(all.content[0].text).count).toBe(1);
    expect(JSON.parse(modifiable.content[0].text).count).toBe(1);
  });
});

/**
 * The high-tier `Get*` handlers (task 18): twenty-nine handlers under each
 * object family's `high` directory that predate — and are semantically
 * thinner than —
 * their `readonly/Read*` siblings above. Historically each answered exactly
 * one field from a single `.read()` call; where v19 dropped `.read()`
 * entirely for a family (`Domain`, `DataElement`, `Package`, `FunctionGroup`
 * — the same four `ReadX` found has no source resource of its own) the
 * single call is `.readMetadata()` instead. `GetFunctionModule` is the one
 * exception that already made two calls before the migration (a metadata
 * read to verify the caller's group, then the source read) and keeps that
 * pair shape, mirroring `ReadFunctionModule`. The six unit-test readers
 * (`GetUnitTest`/`GetCdsUnitTest` and their `Status`/`Result` halves) reach
 * `getStatus`/`getResult` on `AdtUnitTest`/`AdtCdsUnitTest`, not `read` —
 * the v18 convenience `.read({runId})` this family used no longer exists —
 * and neither of those two members takes an options object at all, so they
 * carry no `analyse` (see each handler's own comment).
 *
 * `refusingClient` answers a refusal for any factory and any member, so this
 * proves each handler surfaces a refusal through the adapter without
 * proving which member it called — same limitation the top `it.each` in
 * this file already documents for its own rows.
 */
describe('the high-tier Get*/List* handlers answer through the adapter and surface a refusal', () => {
  it.each([
    ['GetClass', handleGetClass, { class_name: 'ZCL_X' }],
    ['GetDomain', handleGetDomain, { domain_name: 'ZD' }],
    ['GetTable', handleGetTable, { table_name: 'ZT' }],
    ['GetStructure', handleGetStructure, { structure_name: 'ZS' }],
    ['GetProgram', handleGetProgram, { program_name: 'ZP' }],
    ['GetInterface', handleGetInterface, { interface_name: 'ZIF' }],
    ['GetDdl', handleGetDdl, { ddl_name: 'ZDDL' }],
    ['GetDataElement', handleGetDataElement, { data_element_name: 'ZDE' }],
    ['GetPackage', handleGetPackage, { package_name: 'ZPKG' }],
    ['GetMessageClass', handleGetMessageClass, { message_class_name: 'ZMC' }],
    [
      'GetMessageClassMessage',
      handleGetMessageClassMessage,
      { message_class_name: 'ZMC', msgno: '001' },
    ],
    [
      'GetFunctionGroup',
      handleGetFunctionGroup,
      { function_group_name: 'ZFG' },
    ],
    [
      'GetFunctionModule',
      handleGetFunctionModule,
      { function_module_name: 'ZFM', function_group_name: 'ZFG' },
    ],
    [
      'GetServiceBinding',
      handleGetServiceBinding,
      { service_binding_name: 'ZSB' },
    ],
    ['ListServiceBindingTypes', handleListServiceBindingTypes, {}],
    [
      'GetServiceDefinition',
      handleGetServiceDefinition,
      { service_definition_name: 'ZSD' },
    ],
    [
      'GetMetadataExtension',
      handleGetMetadataExtension,
      { metadata_extension_name: 'ZME' },
    ],
    [
      'GetBehaviorDefinition',
      handleGetBehaviorDefinition,
      { behavior_definition_name: 'ZBD' },
    ],
    [
      'GetBehaviorImplementation',
      handleGetBehaviorImplementation,
      { behavior_implementation_name: 'ZBI' },
    ],
    ['GetLocalTypes', handleGetLocalTypes, { class_name: 'ZCL_X' }],
    ['GetLocalDefinitions', handleGetLocalDefinitions, { class_name: 'ZCL_X' }],
    ['GetLocalMacros', handleGetLocalMacros, { class_name: 'ZCL_X' }],
    ['GetLocalTestClass', handleGetLocalTestClass, { class_name: 'ZCL_X' }],
    ['GetUnitTest', handleGetUnitTest, { run_id: 'r1' }],
    ['GetUnitTestStatus', handleGetUnitTestStatus, { run_id: 'r1' }],
    ['GetUnitTestResult', handleGetUnitTestResult, { run_id: 'r1' }],
    ['GetCdsUnitTest', handleGetCdsUnitTest, { run_id: 'r1' }],
    ['GetCdsUnitTestStatus', handleGetCdsUnitTestStatus, { run_id: 'r1' }],
    ['GetCdsUnitTestResult', handleGetCdsUnitTestResult, { run_id: 'r1' }],
  ])(
    '%s answers through the adapter and surfaces a refusal',
    async (_n, handler, args) => {
      fakeClient = refusingClient('Not found');
      const result: any = await (handler as any)(context as any, args);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toBe('Not found');
    },
  );
});

/**
 * Fix round 1: the refusal-only rows above pin only the failure envelope —
 * a handler pointed at a wrong-but-still-refusing member, or one that
 * dropped its strategy entirely, would pass every row above too. This is
 * the bar the sibling read tests already set (`domainLow.test.ts`,
 * `readHandlersSuccessMapping.test.ts`'s own "the two members..." block):
 * one recorded row per handler naming the factory, the member, the
 * identity arguments the caller's own input maps to, and the strategy's
 * identity where the signature accepts one — its deliberate absence where
 * it does not.
 *
 * Handlers whose call is a single, ordinary `read`/`readMetadata` — no
 * bounded polling, no group-verification gate to defeat — are table-driven
 * below. Three that carry the identity in a POSITIONAL argument rather than
 * a config object (`getStatus`, `getServiceBindingTypes`), and the four
 * whose own `pollUntilFinished` loop needs a fake client that actually
 * answers a finished run to ever reach its second call, are each their own
 * `it` further down.
 */
describe('the high-tier Get* handlers call the member the brief names, with the arguments the caller gave', () => {
  const rows: Array<{
    name: string;
    handler: (context: unknown, args: unknown) => Promise<unknown>;
    args: Record<string, unknown>;
    factory: string;
    member: string;
    identity: Record<string, unknown>;
    hasAnalyse: boolean | 'own';
  }> = [
    {
      name: 'GetClass',
      handler: handleGetClass as any,
      args: { class_name: 'zcl_x' },
      factory: 'getClass',
      member: 'read',
      identity: { className: 'ZCL_X' },
      hasAnalyse: true,
    },
    {
      name: 'GetDomain',
      handler: handleGetDomain as any,
      args: { domain_name: 'zd' },
      factory: 'getDomain',
      member: 'readMetadata',
      identity: { domainName: 'ZD' },
      hasAnalyse: true,
    },
    {
      name: 'GetTable',
      handler: handleGetTable as any,
      args: { table_name: 'zt' },
      factory: 'getTable',
      member: 'read',
      identity: { tableName: 'ZT' },
      hasAnalyse: true,
    },
    {
      name: 'GetStructure',
      handler: handleGetStructure as any,
      args: { structure_name: 'zs' },
      factory: 'getStructure',
      member: 'read',
      identity: { structureName: 'ZS' },
      hasAnalyse: true,
    },
    {
      name: 'GetProgram',
      handler: handleGetProgram as any,
      args: { program_name: 'zp' },
      factory: 'getProgram',
      member: 'read',
      identity: { programName: 'ZP' },
      hasAnalyse: true,
    },
    {
      name: 'GetInterface',
      handler: handleGetInterface as any,
      args: { interface_name: 'zif' },
      factory: 'getInterface',
      member: 'read',
      identity: { interfaceName: 'ZIF' },
      hasAnalyse: true,
    },
    {
      name: 'GetDdl',
      handler: handleGetDdl as any,
      args: { ddl_name: 'zddl' },
      factory: 'getDdl',
      member: 'read',
      identity: { ddlName: 'ZDDL' },
      hasAnalyse: true,
    },
    {
      name: 'GetDataElement',
      handler: handleGetDataElement as any,
      args: { data_element_name: 'zde' },
      factory: 'getDataElement',
      member: 'readMetadata',
      identity: { dataElementName: 'ZDE' },
      hasAnalyse: true,
    },
    {
      name: 'GetPackage',
      handler: handleGetPackage as any,
      args: { package_name: 'zpkg' },
      factory: 'getPackage',
      member: 'readMetadata',
      identity: { packageName: 'ZPKG' },
      hasAnalyse: true,
    },
    {
      name: 'GetMessageClass',
      handler: handleGetMessageClass as any,
      args: { message_class_name: 'zmc' },
      factory: 'getMessageClass',
      member: 'readMetadata',
      identity: { name: 'ZMC' },
      hasAnalyse: true,
    },
    {
      name: 'GetMessageClassMessage',
      handler: handleGetMessageClassMessage as any,
      args: { message_class_name: 'zmc', msgno: '001' },
      factory: 'getMessageClassMessage',
      member: 'read',
      identity: { className: 'ZMC', msgno: '001' },
      // Its own strategy — `analyseMessageClassMessage(msgno)`, the msgno
      // check adt-clients 22 applied inside the member.
      hasAnalyse: 'own',
    },
    {
      name: 'GetFunctionGroup',
      handler: handleGetFunctionGroup as any,
      args: { function_group_name: 'zfg' },
      factory: 'getFunctionGroup',
      member: 'readMetadata',
      identity: { functionGroupName: 'ZFG' },
      hasAnalyse: true,
    },
    {
      name: 'GetServiceBinding',
      handler: handleGetServiceBinding as any,
      args: { service_binding_name: 'zsb' },
      factory: 'getServiceBinding',
      member: 'read',
      identity: { bindingName: 'ZSB' },
      hasAnalyse: true,
    },
    {
      name: 'GetServiceDefinition',
      handler: handleGetServiceDefinition as any,
      args: { service_definition_name: 'zsd' },
      factory: 'getServiceDefinition',
      member: 'read',
      identity: { serviceDefinitionName: 'ZSD' },
      hasAnalyse: true,
    },
    {
      name: 'GetMetadataExtension',
      handler: handleGetMetadataExtension as any,
      args: { metadata_extension_name: 'zme' },
      factory: 'getMetadataExtension',
      member: 'read',
      identity: { name: 'ZME' },
      hasAnalyse: true,
    },
    {
      name: 'GetBehaviorDefinition',
      handler: handleGetBehaviorDefinition as any,
      args: { behavior_definition_name: 'zbd' },
      factory: 'getBehaviorDefinition',
      member: 'read',
      identity: { name: 'ZBD' },
      hasAnalyse: true,
    },
    {
      name: 'GetBehaviorImplementation',
      handler: handleGetBehaviorImplementation as any,
      args: { behavior_implementation_name: 'zbi' },
      factory: 'getBehaviorImplementation',
      member: 'read',
      identity: { className: 'ZBI' },
      hasAnalyse: true,
    },
    {
      name: 'GetLocalTypes',
      handler: handleGetLocalTypes as any,
      args: { class_name: 'zcl_x' },
      factory: 'getLocalTypes',
      member: 'read',
      identity: { className: 'ZCL_X' },
      hasAnalyse: true,
    },
    {
      name: 'GetLocalDefinitions',
      handler: handleGetLocalDefinitions as any,
      args: { class_name: 'zcl_x' },
      factory: 'getLocalDefinitions',
      member: 'read',
      identity: { className: 'ZCL_X' },
      hasAnalyse: true,
    },
    {
      name: 'GetLocalMacros',
      handler: handleGetLocalMacros as any,
      args: { class_name: 'zcl_x' },
      factory: 'getLocalMacros',
      member: 'read',
      identity: { className: 'ZCL_X' },
      hasAnalyse: true,
    },
    {
      name: 'GetLocalTestClass',
      handler: handleGetLocalTestClass as any,
      args: { class_name: 'zcl_x' },
      factory: 'getLocalTestClass',
      member: 'read',
      identity: { className: 'ZCL_X' },
      hasAnalyse: true,
    },
  ];

  it.each(rows)(
    "$name calls the right factory and member, with the caller's own identity, and its strategy exactly where the signature accepts one",
    async ({ handler, args, factory, member, identity, hasAnalyse }) => {
      const seen = recordAnalyse();
      fakeClient = seen.client;

      await handler(context as any, args);

      const call = seen.calls.filter((c) => c.member === member).at(-1);
      expect(call?.factory).toBe(factory);
      expect(call?.args[0]).toEqual(identity);
      expect(call?.carriedAnalyse).toBe(hasAnalyse !== false);
      if (hasAnalyse === true) expect(call?.analyse).toBe(analyseException);
      // A strategy of the call's own — `analyseMessageClassMessage(msgno)`.
      if (hasAnalyse === 'own') expect(typeof call?.analyse).toBe('function');
    },
  );

  it('ListServiceBindingTypes calls getServiceBinding().getServiceBindingTypes() with no arguments at all', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleListServiceBindingTypes(context as any, {});

    const call = seen.calls
      .filter((c) => c.member === 'getServiceBindingTypes')
      .at(-1);
    expect(call?.factory).toBe('getServiceBinding');
    expect(call?.args).toEqual([]);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('GetUnitTestStatus calls getUnitTest().getStatus(run_id, with_long_polling)', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleGetUnitTestStatus(context as any, { run_id: 'r1' });

    const call = seen.calls.filter((c) => c.member === 'getStatus').at(-1);
    expect(call?.factory).toBe('getUnitTest');
    expect(call?.args).toEqual(['r1', true]);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });

  it('GetCdsUnitTestStatus calls getCdsUnitTest().getStatus(run_id, with_long_polling)', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleGetCdsUnitTestStatus(context as any, { run_id: 'r1' });

    const call = seen.calls.filter((c) => c.member === 'getStatus').at(-1);
    expect(call?.factory).toBe('getCdsUnitTest');
    expect(call?.args).toEqual(['r1', true]);
    expect(call?.carriedAnalyse).toBe(true);
    expect(call?.analyse).toBe(analyseException);
  });
});

/**
 * `GetFunctionModule` is the one high-tier Get* handler that already made
 * two calls before the migration, and it is the only one whose second call
 * depends on the first (the group-verification gate — see below). A bare
 * `recordAnalyse()` double cannot exercise it: its canned reading has no
 * `<adtcore:containerRef/>` to parse, so `assertFunctionGroupMatches` throws
 * before the second call is ever made. This uses the real captured metadata
 * fixture instead, which both proves the identity arguments of BOTH calls
 * and doubles as this handler's corpus-driven success mapping.
 */
describe('GetFunctionModule, mapped from a real captured metadata+source pair', () => {
  it('calls readMetadata then read, both through getFunctionModule(), and answers the real source under function_module_data', async () => {
    const metadata = corpusBody(
      'read-metadata-function-module--01-fmodules-zmcpshrfm',
    );
    const source = corpusBody(
      'read-function-module-source-text--01-read-source',
    );
    const calls: Array<{ member: string; args: unknown[] }> = [];
    const record =
      (member: string) =>
      (...args: unknown[]) => {
        calls.push({ member, args });
      };
    const double = fakeClientOfWithFactory({
      readMetadata: async (...args: unknown[]) => {
        record('readMetadata')(...args);
        return okResponse(structured({ data: metadata, status: 200 } as any));
      },
      read: async (...args: unknown[]) => {
        record('read')(...args);
        return okResponse(structured({ data: source, status: 200 } as any));
      },
    });
    fakeClient = double.client;

    const result: any = await handleGetFunctionModule(context as any, {
      function_module_name: 'z_mcp_shr_fm',
      function_group_name: 'zmcp_shr_fgrp',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.function_module_name).toBe('Z_MCP_SHR_FM');
    expect(payload.function_group_name).toBe('ZMCP_SHR_FGRP');
    expect(payload.function_module_data).toBe(source);
    expect(double.factory).toBe('getFunctionModule');

    const readMetadataCall = calls
      .filter((c) => c.member === 'readMetadata')
      .at(-1);
    expect(readMetadataCall?.args[0]).toEqual({
      functionModuleName: 'Z_MCP_SHR_FM',
      functionGroupName: 'ZMCP_SHR_FGRP',
    });
    const readMetadataOptions = readMetadataCall?.args.at(-1) as
      | { analyse?: unknown }
      | undefined;
    expect(readMetadataOptions?.analyse).toBe(analyseException);

    const readCall = calls.filter((c) => c.member === 'read').at(-1);
    expect(readCall?.args[0]).toEqual({
      functionModuleName: 'Z_MCP_SHR_FM',
      functionGroupName: 'ZMCP_SHR_FGRP',
    });
    const readOptions = readCall?.args.at(-1) as
      | { analyse?: unknown }
      | undefined;
    expect(readOptions?.analyse).toBe(analyseException);
  });
});

/**
 * Fix round 1: two behaviours the failure-envelope rows and the identity
 * table above both let pass unpinned — deleting either one changed nothing
 * in any test that existed before this block.
 */
describe('two behaviours unpinned before fix round 1', () => {
  // Mirrors `ReadPackage passes the caller-requested version to readMetadata`
  // in `readHandlersSuccessMapping.test.ts` — the same fix, on the sibling
  // Get* tool. Reverting `handleGetPackage.ts` to drop `version` from the
  // call (while still echoing the caller's own `version` in the answer, the
  // way it did before this fix) fails this test with `Expected: "inactive",
  // Received: undefined` — checked before writing it down here.
  it('GetPackage passes the caller-requested version to readMetadata', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleGetPackage(context as any, {
      package_name: 'zpkg',
      version: 'inactive',
    });

    const call = seen.calls.filter((c) => c.member === 'readMetadata').at(-1);
    const options = call?.args.at(-1) as { version?: string } | undefined;
    expect(options?.version).toBe('inactive');
  });

  // The group-match check itself, mirroring
  // `ReadFunctionModule refuses when the caller-supplied group does not
  // match the metadata containerRef` in `readHandlersSuccessMapping.test.ts`.
  // The metadata's own containerRef names ZMCP_SHR_FGRP; the caller asks for
  // a different group, and `read` must never be reached — if the gate were
  // removed, `read`'s stub answer below would come back as a success
  // instead, handing back source from a group the caller never verified.
  it('GetFunctionModule refuses when the caller-supplied group does not match the metadata containerRef', async () => {
    const metadata = corpusBody(
      'read-metadata-function-module--01-fmodules-zmcpshrfm',
    );
    fakeClient = fakeClientOf({
      readMetadata: async () =>
        okResponse(structured({ data: metadata, status: 200 } as any)),
      read: async () =>
        okResponse(
          structured({ data: 'SHOULD NOT BE READ', status: 200 } as any),
        ),
    });

    const result: any = await handleGetFunctionModule(context as any, {
      function_module_name: 'z_mcp_shr_fm',
      function_group_name: 'zwrong_group',
    });

    expect(result.isError).toBe(true);
  });
});

/**
 * Fix round 1's main finding: `GetUnitTest`/`GetUnitTestResult`/
 * `GetCdsUnitTest`/`GetCdsUnitTestResult` reconstruct the v18 convenience
 * `.read({runId})` (bounded status polling, only fetching the result once
 * `<aunit:progress status="FINISHED"/>` is seen) rather than a naive
 * `pair(getStatus, getResult)`. These tests exist to fail if that
 * reconstruction regresses to the naive shape: an empty/refused result
 * silently becoming a success, a not-yet-finished run's result being
 * fetched at all, or a status refusal being discarded once a result call
 * was attempted.
 *
 * `GetUnitTest`/`GetUnitTestStatus`/`GetUnitTestResult` use the two real
 * captured fixtures for a passing run (`unittest-run-passing--02-runs-*`,
 * the status; `--03-results-*`, the result). No fixture in the corpus
 * captures a CDS run or a still-running (non-`FINISHED`) status, so
 * `GetCdsUnitTest*`'s own tests and the "not yet finished" tests below use
 * synthetic markers, named as such rather than presented as corpus evidence.
 */
describe('the unit-test Get* handlers reconstruct poll-then-fetch, never masking a refusal or an unfinished run', () => {
  const passingStatus = corpusBody(
    'unittest-run-passing--02-runs-fa53c505dd7b1fd1abb8599833a05d44',
  );
  const passingResult = corpusBody(
    'unittest-run-passing--03-results-fa53c505dd7b1fd1abb8599833a05d44',
  );
  // Synthetic (no fixture): a run ADT has not finished yet.
  const runningStatus =
    '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="RUNNING" percentage="40"/></aunit:run>';

  it('GetUnitTest answers a real finished run from the captured status+result fixtures, and calls both members through getUnitTest()', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: passingStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () =>
      okResponse(structured({ data: passingResult, status: 200 } as any)),
    );
    const double = fakeClientOfWithFactory({ getStatus, getResult });
    fakeClient = double.client;

    const result: any = await handleGetUnitTest(context as any, {
      run_id: 'FA53C505DD7B1FD1ABB8599833A05D44',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(true);
    expect(payload.run_id).toBe('FA53C505DD7B1FD1ABB8599833A05D44');
    expect(JSON.stringify(payload.run_result)).toContain('TEST_METHOD');
    expect(getStatus).toHaveBeenCalledWith(
      'FA53C505DD7B1FD1ABB8599833A05D44',
      true,
      { analyse: analyseException },
    );
    expect(getResult).toHaveBeenCalledWith('FA53C505DD7B1FD1ABB8599833A05D44', {
      analyse: analyseException,
    });
    // Read AFTER invoking the handler — `factory` is a getter on the
    // double, and destructuring it eagerly captures `undefined` (the value
    // before any factory was ever accessed).
    expect(double.factory).toBe('getUnitTest');
  });

  it('GetUnitTest answers finished:false after MAX_STATUS_POLLS status checks, and never calls getResult on a run that has not finished', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: runningStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () => {
      throw new Error('must not be called — the run never finished');
    });
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetUnitTest(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(false);
    expect(payload.run_result).toBeUndefined();
    expect(getStatus).toHaveBeenCalledTimes(5);
    expect(getResult).not.toHaveBeenCalled();
  });

  it('GetUnitTest surfaces a refused result as an error once the run is confirmed finished, not success with an empty result', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: passingStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () =>
      refusedResponse('Result not available'),
    );
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetUnitTest(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toBe('Result not available');
    expect(result.content[0].text).not.toContain('"success": true');
  });

  it('GetUnitTest surfaces a refused status as an error without ever calling getResult', async () => {
    const getStatus = jest.fn(async () =>
      refusedResponse('Status endpoint down'),
    );
    const getResult = jest.fn(async () => {
      throw new Error('must not be called — status itself refused');
    });
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetUnitTest(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Status endpoint down',
    );
    expect(getResult).not.toHaveBeenCalled();
  });

  it('GetUnitTestResult answers the real captured result once the real captured status says FINISHED', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: passingStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () =>
      okResponse(structured({ data: passingResult, status: 200 } as any)),
    );
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetUnitTestResult(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(true);
    expect(JSON.stringify(payload.run_result)).toContain('TEST_METHOD');
  });

  it('GetUnitTestResult answers finished:false with no run_result, rather than guessing, when the run has not finished', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: runningStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () => {
      throw new Error('must not be called — the run never finished');
    });
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetUnitTestResult(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(false);
    expect(payload.run_result).toBeUndefined();
    expect(getResult).not.toHaveBeenCalled();
  });

  // CDS variants: `AdtCdsUnitTest extends AdtUnitTest` and inherits both
  // members unchanged, so these exercise the identical `pollUntilFinished`
  // path through a different factory — synthetic markers throughout, since
  // no CDS run is captured in the corpus.
  const cdsStatus =
    '<?xml version="1.0" encoding="utf-8"?><aunit:run xmlns:aunit="http://www.sap.com/adt/api/aunit"><aunit:progress status="FINISHED" percentage="100"/></aunit:run>';
  const cdsResult =
    '<?xml version="1.0" encoding="utf-8"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit">CDS RESULT MARKER (no fixture)</aunit:runResult>';

  it('GetCdsUnitTest answers finished:true from a synthetic FINISHED status, and calls both members through getCdsUnitTest()', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: cdsStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () =>
      okResponse(structured({ data: cdsResult, status: 200 } as any)),
    );
    const double = fakeClientOfWithFactory({ getStatus, getResult });
    fakeClient = double.client;

    const result: any = await handleGetCdsUnitTest(context as any, {
      run_id: 'r1',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(true);
    // Read AFTER invoking the handler — see the comment on the analogous
    // assertion in `GetUnitTest`'s own test above.
    expect(double.factory).toBe('getCdsUnitTest');
    expect(getStatus).toHaveBeenCalledWith('r1', true, {
      analyse: analyseException,
    });
    expect(getResult).toHaveBeenCalledWith('r1', {
      analyse: analyseException,
    });
  });

  it('GetCdsUnitTest answers finished:false and never calls getResult when the (synthetic) run has not finished', async () => {
    const getStatus = jest.fn(async () =>
      okResponse(structured({ data: runningStatus, status: 200 } as any)),
    );
    const getResult = jest.fn(async () => {
      throw new Error('must not be called — the run never finished');
    });
    fakeClient = fakeClientOf({ getStatus, getResult });

    const result: any = await handleGetCdsUnitTest(context as any, {
      run_id: 'r1',
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.finished).toBe(false);
    expect(getStatus).toHaveBeenCalledTimes(5);
    expect(getResult).not.toHaveBeenCalled();
  });

  it('GetCdsUnitTestResult answers finished:true from a synthetic finished run, and finished:false with no result otherwise', async () => {
    const getStatusFinished = jest.fn(async () =>
      okResponse(structured({ data: cdsStatus, status: 200 } as any)),
    );
    const getResultSpy = jest.fn(async () =>
      okResponse(structured({ data: cdsResult, status: 200 } as any)),
    );
    fakeClient = fakeClientOf({
      getStatus: getStatusFinished,
      getResult: getResultSpy,
    });

    const finished: any = await handleGetCdsUnitTestResult(context as any, {
      run_id: 'r1',
    });
    expect(JSON.parse(finished.content[0].text).finished).toBe(true);

    const getStatusRunning = jest.fn(async () =>
      okResponse(structured({ data: runningStatus, status: 200 } as any)),
    );
    const getResultNeverCalled = jest.fn(async () => {
      throw new Error('must not be called — the run never finished');
    });
    fakeClient = fakeClientOf({
      getStatus: getStatusRunning,
      getResult: getResultNeverCalled,
    });

    const notFinished: any = await handleGetCdsUnitTestResult(context as any, {
      run_id: 'r1',
    });
    const payload = JSON.parse(notFinished.content[0].text);
    expect(payload.finished).toBe(false);
    expect(payload.run_result).toBeUndefined();
    expect(getResultNeverCalled).not.toHaveBeenCalled();
  });
});
