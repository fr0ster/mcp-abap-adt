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
import { handleGetObjectVersionDiff } from '../../handlers/common/readonly/handleGetObjectVersionDiff';
import { resolveVersionedObject } from '../../handlers/common/readonly/resolveVersionedObject';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleReadMessageClass } from '../../handlers/message_class/readonly/handleReadMessageClass';
import { handleReadMessageClassMessage } from '../../handlers/message_class/readonly/handleReadMessageClassMessage';
import { handleGetObjectsByType } from '../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../handlers/search/readonly/handleGetObjectsList';
import { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject';
import { handleGetAdtTypes } from '../../handlers/system/readonly/handleGetAllTypes';
import { handleGetInactiveObjects } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { handleGetObjectInfo } from '../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetObjectNodeFromCache } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetObjectStructure } from '../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import { handleListTransports } from '../../handlers/transport/readonly/handleListTransports';
import { corpusBody } from '../../lib/adtCorpus';
import { objectsListCache } from '../../lib/getObjectsListCache';
import { nodeLevel } from '../../lib/strategies/packageWalk';
import { parseStructure } from '../../lib/strategies/reading';
import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
  refusingClient,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

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
  ])('%s answers through the adapter and surfaces a refusal', async (_n, handler, args) => {
    fakeClient = refusingClient('Not found');
    const result: any = await (handler as any)(context as any, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe('Not found');
  });
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

  it('ListTransports calls list() with no arguments', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    await handleListTransports(context as any, {});
    const call = seen.calls.filter((c) => c.member === 'list').at(-1);
    expect(call?.args).toEqual([]);
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

describe('the two members that accept an analyse strategy, and only those two', () => {
  // Verified against the installed declarations, not the brief's list:
  // `AdtMessageClass.readMetadata` and `AdtMessageClassMessage.read` both
  // take one; `AdtUtils.search` (the one member the brief itself names) does
  // NOT when reached through the typed contract `getUtils(ourUtils)` hands
  // back — see `handleSearchObject.ts`'s own comment — and none of
  // `getObjectStructure`, `getAllTypes`, `getInactiveObjects`, `getSqlQuery`,
  // `getTableContents`, `fetchNodeStructure`, `getRequest().list()` or
  // `getVersionSource` take options at all. `scripts/check-analyse.ts` finds
  // zero analyse-eligible calls in every directory this task touched except
  // `message_class/readonly` (2) and `table/readonly` (2, the second
  // pre-existing) — quoted in the task report.
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

  it('ReadMessageClassMessage hands getMessageClassMessage().read its own analyse', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleReadMessageClassMessage(context as any, {
      message_class_name: 'zmc',
      msgno: '001',
    });

    expect(seen.countOf('read')).toBe(1);
    expect(seen.last?.carriedAnalyse).toBe(true);
    expect(seen.last?.analyse).toBe(analyseException);
  });

  it('SearchObject does NOT carry an analyse into search — none was given, matching the signature', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleSearchObject(context as any, { object_name: 'ZCL*' });

    expect(seen.countOf('search')).toBe(1);
    expect(seen.last?.carriedAnalyse).toBe(false);
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
  // The bug this guards: `handleGetObjectsList` wrote `{name, type,
  // tech_name}` while its sibling `handleGetObjectsByType` wrote
  // `{OBJECT_TYPE, OBJECT_NAME, TECH_NAME, OBJECT_URI}` — after either
  // handler populated the cache, `handleGetObjectNodeFromCache` (which
  // matches on the uppercase keys) found nothing, for every input. Populates
  // the SAME shared cache through one handler, then the other, and checks
  // both write the identical row shape — no fabricated `TECH_NAME`.
  const level = {
    objects: [{ name: 'ZINCL1', type: 'PROG/I' }],
    childNodes: [],
  };

  it('write compatible row shapes for the same underlying object', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse(level),
    });

    await handleGetObjectsByType(context as any, {
      parent_name: 'ZPROG',
      parent_tech_name: 'ZPROG',
      parent_type: 'PROG/P',
      node_id: '31',
    });
    const byTypeRow = objectsListCache.getCache().objects[0];

    await handleGetObjectsList(context as any, {
      parent_name: 'ZPROG',
      parent_tech_name: 'ZPROG',
      parent_type: 'PROG/P',
    });
    const listRow = objectsListCache.getCache().objects[0];

    expect(Object.keys(byTypeRow).sort()).toEqual([
      'OBJECT_NAME',
      'OBJECT_TYPE',
    ]);
    expect(Object.keys(listRow).sort()).toEqual(['OBJECT_NAME', 'OBJECT_TYPE']);
    expect(byTypeRow).toEqual({ OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINCL1' });
    expect(listRow).toEqual({ OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINCL1' });
  });

  it('GetObjectNodeFromCache reads a row either handler wrote, and fails honestly rather than matching a wrong TECH_NAME', async () => {
    fakeClient = fakeClientOf({
      fetchNodeStructure: async () => okResponse(level),
    });
    await handleGetObjectsByType(context as any, {
      parent_name: 'ZPROG',
      parent_tech_name: 'ZPROG',
      parent_type: 'PROG/P',
      node_id: '31',
    });

    // No TECH_NAME reaches the cache (the shared node reading never carries
    // one — see the note in `handleGetObjectsByType.ts`), so a lookup that
    // requires one — `handleGetObjectNodeFromCache`'s own contract, unchanged
    // by this task — cannot match. Honest absence, not a wrong match: this
    // is the OBJECT_URI-style gap recorded for a later task, not silently
    // worked around here with a fabricated value.
    const result: any = await handleGetObjectNodeFromCache(context as any, {
      object_type: 'PROG/I',
      object_name: 'ZINCL1',
      tech_name: 'ZINCL1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Node not found in cache');
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

describe('ListTransports, mapped from a real captured (empty) transport list', () => {
  // `read-transport-list-structure--01-cts-transportrequests` is a real
  // `tm:root` response with no requests at all (see
  // `parseTransportListXml.test.ts`'s own note on it) — the honest-empty
  // case, not a synthetic tree.
  it('answers count: 0 for a real empty transport list', async () => {
    const body = corpusBody(
      'read-transport-list-structure--01-cts-transportrequests',
    );
    fakeClient = fakeClientOf({
      list: async () => okResponse(reading(parseStructure(body), body)),
    });

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(0);
    expect(payload.transports).toEqual([]);
  });
});
