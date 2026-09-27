/**
 * Task 25, fix round 1 — coverage for the runtime/profiler/feed/package-tree
 * handlers whose behaviour actually changed and had no test at all before
 * this round. Each `it` here is written to fail against the specific defect
 * fix round 1 named, and was verified to do so by reintroducing that defect
 * one at a time and confirming the matching test (and only that test) turns
 * red — see the task's fix-round-1 report for the reintroduction log.
 */
import { AdtExecutor, AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleGetPackageTree } from '../../handlers/system/high/handleGetPackageTree';
import { handleRuntimeAnalyzeProfilerTrace } from '../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeCreateProfilerTraceParameters } from '../../handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters';
import { handleRuntimeGetDumpById } from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetGatewayErrorLog } from '../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import { handleRuntimeGetProfilerTraceData } from '../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListFeeds } from '../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListProfilerTraceFiles } from '../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import { handleRuntimeListSystemMessages } from '../../handlers/system/readonly/handleRuntimeListSystemMessages';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const context = { connection: {} as any, logger: undefined };

let profiler: Record<string, unknown>;
let feeds: Record<string, unknown>;
let dumps: Record<string, unknown>;
let classExecutor: Record<string, unknown>;
let packageClient: Record<string, unknown>;

jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtRuntimeClient: jest.fn(() => ({
    getProfiler: () => profiler,
    getFeeds: () => feeds,
    getDumps: () => dumps,
  })),
  AdtExecutor: jest.fn(() => ({ getClassExecutor: () => classExecutor })),
  // RuntimeListFeeds reads the variants with a FeedRepository of its own
  // reading: the fake answers the feed list and applies that reading to it.
  FeedRepository: jest.fn(
    (_connection: unknown, _logger: unknown, results: any) => ({
      list: async () => ({
        ok: true,
        getResult: () => ({ value: results.feeds({ data: feedListXml }) }),
      }),
    }),
  ),
}));

// `handleGetPackageTree` is the only handler in this file that reaches
// `createAdtClient` (`../../lib/clients`) rather than `AdtRuntimeClient`/
// `AdtExecutor` — mocked at module scope, same as the two above, so the
// factory can close over a `let` the individual test assigns.
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => packageClient,
}));

/**
 * A cut of E19's `GET /sap/bc/adt/feeds` (2026-09-26): the dumps feed with its
 * two query variants, and a feed with none.
 */
const feedListXml =
  '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">' +
  '<atom:entry><atom:id>/sap/bc/adt/runtime/dumps</atom:id><atom:title>ABAP Runtime Errors</atom:title>' +
  '<feed:extendedData xmlns:feed="http://www.sap.com/adt/feeds"><feed:queryVariants>' +
  '<feed:queryVariant queryString="and ( equals ( user , OKYSLYTSIA ) )" title="Runtime Errors caused by me (OKYSLYTSIA)" isDefault="true"/>' +
  '<feed:queryVariant queryString="and ( equals ( responsible , OKYSLYTSIA ) )" title="Runtime Errors for objects I am responsible for (OKYSLYTSIA)" isDefault="false"/>' +
  '</feed:queryVariants></feed:extendedData></atom:entry>' +
  '<atom:entry><atom:id>/sap/bc/adt/runtime/systemmessages</atom:id><atom:title>ABAP System Messages</atom:title>' +
  '<feed:extendedData xmlns:feed="http://www.sap.com/adt/feeds"/></atom:entry>' +
  '</atom:feed>';

// ---------------------------------------------------------------------------

describe('RuntimeListProfilerTraceFiles', () => {
  it('answers the parsed entries and their count — not a reader that returns nothing', async () => {
    const entry = { id: 'trace-1', recordedAt: '2026-01-01T00:00:00Z' };
    profiler = { list: jest.fn(async () => okResponse([entry])) };

    const result: any = await handleRuntimeListProfilerTraceFiles(
      context as any,
    );
    const body = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(false);
    expect(body.count).toBe(1);
    expect(body.entries).toEqual([entry]);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetDumpById', () => {
  it('passes dump_id and view through to getById — a dropped view argument would silently read the default view', async () => {
    const getById = jest.fn(async () => okResponse('<dump>content</dump>'));
    dumps = { getById };

    await handleRuntimeGetDumpById(
      context as any,
      {
        dump_id: 'DUMP-1',
        view: 'formatted',
        response_mode: 'payload',
      } as any,
    );

    expect(getById).toHaveBeenCalledWith('DUMP-1', {
      view: 'formatted',
      analyse: analyseException,
    });
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetProfilerTraceData', () => {
  it('hitlist view: reads the hitlist view and passes with_system_events — an ignored view would call the wrong key', async () => {
    const read = jest.fn(async () => okResponse({ entries: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'hitlist',
      with_system_events: true,
    });

    expect(read).toHaveBeenCalledWith('trace-1', 'hitlist', {
      withSystemEvents: true,
      analyse: analyseException,
    });
  });

  it('statements view: reads the statements view with id/withDetails/autoDrillDownThreshold — a dropped argument would omit one', async () => {
    const read = jest.fn(async () => okResponse({ statements: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'statements',
      id: 42,
      with_details: true,
      auto_drill_down_threshold: 5,
    });

    expect(read).toHaveBeenCalledWith('trace-1', 'statements', {
      id: 42,
      withDetails: true,
      autoDrillDownThreshold: 5,
      withSystemEvents: undefined,
      analyse: analyseException,
    });
  });

  it('db_accesses view: reads the dbAccesses view — a wrong member name would silently call a different one', async () => {
    const read = jest.fn(async () => okResponse({ accesses: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'db_accesses',
    });

    expect(read).toHaveBeenCalledWith('trace-1', 'dbAccesses', {
      withSystemEvents: undefined,
      analyse: analyseException,
    });
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeAnalyzeProfilerTrace', () => {
  /**
   * The exact bug the reviewer measured: a hit-list entry's own `grossTime`
   * sub-object (`{time, percentage}`) has numeric fields, so the old
   * `collectObjects`/`pickTopEntries` counted it as a second, spurious row —
   * and none of `resolveRankValue`'s guessed key names (`'runtime'`,
   * `'calls'`, `'hits'`, …) exist on `IAbapTraceHitListEntry`, so ranking
   * fell back to document order. Three real entries, deliberately given out
   * of time order, so a ranking bug shows as the wrong `top_records` order.
   */
  it('hitlist: ranks by grossTime.time and total_records counts real entries, not timing sub-objects', async () => {
    const hitList = {
      entries: [
        {
          index: 1,
          description: 'slow',
          hitCount: 3,
          grossTime: { time: 900, percentage: 90 },
        },
        {
          index: 2,
          description: 'fast',
          hitCount: 1,
          grossTime: { time: 10, percentage: 1 },
        },
        {
          index: 3,
          description: 'medium',
          hitCount: 2,
          grossTime: { time: 300, percentage: 30 },
        },
      ],
    };
    profiler = { read: jest.fn(async () => okResponse(hitList)) };

    const result: any = await handleRuntimeAnalyzeProfilerTrace(
      context as any,
      { trace_id_or_uri: 'trace-1', view: 'hitlist', top: 2 },
    );
    const body = JSON.parse(result.content[0].text);

    expect(body.summary.total_records).toBe(3);
    expect(body.summary.top_records).toHaveLength(2);
    expect(body.summary.top_records[0].description).toBe('slow');
    expect(body.summary.top_records[1].description).toBe('medium');
    // The ranking field survives into the compact row, flattened — the
    // second half of the bug (a nested object was dropped as "not a
    // primitive", so even a correct ranking would have shown `{}` rows).
    expect(body.summary.top_records[0].grossTime_time).toBe(900);
  });

  it('db_accesses: ranks by accessTime.total, a different field from hitlist/statements', async () => {
    const dbAccesses = {
      accesses: [
        {
          index: 1,
          tableName: 'T1',
          accessTime: { total: 5, ratioOfTraceTotal: 0.05 },
        },
        {
          index: 2,
          tableName: 'T2',
          accessTime: { total: 95, ratioOfTraceTotal: 0.95 },
        },
      ],
    };
    profiler = { read: jest.fn(async () => okResponse(dbAccesses)) };

    const result: any = await handleRuntimeAnalyzeProfilerTrace(
      context as any,
      { trace_id_or_uri: 'trace-1', view: 'db_accesses', top: 5 },
    );
    const body = JSON.parse(result.content[0].text);

    expect(body.summary.total_records).toBe(2);
    expect(body.summary.top_records[0].tableName).toBe('T2');
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeCreateProfilerTraceParameters', () => {
  it('schedules a trace with every parameter mapped — a dropped argument would silently omit one', async () => {
    const scheduleTrace = jest.fn(async () => okResponse('request-uri-1'));
    classExecutor = { scheduleTrace };

    const result: any = await handleRuntimeCreateProfilerTraceParameters(
      context as any,
      {
        description: 'my trace',
        all_misc_abap_statements: true,
        all_procedural_units: true,
        all_internal_table_events: false,
        all_dynpro_events: false,
        aggregate: true,
        explicit_on_off: false,
        with_rfc_tracing: true,
        all_system_kernel_events: false,
        sql_trace: true,
        all_db_events: false,
        max_size_for_trace_file: 1000,
        amdp_trace: false,
        max_time_for_tracing: 60,
      },
    );
    const body = JSON.parse(result.content[0].text);

    expect(scheduleTrace).toHaveBeenCalledWith({
      description: 'my trace',
      allMiscAbapStatements: true,
      allProceduralUnits: true,
      allInternalTableEvents: false,
      allDynproEvents: false,
      aggregate: true,
      explicitOnOff: false,
      withRfcTracing: true,
      allSystemKernelEvents: false,
      sqlTrace: true,
      allDbEvents: false,
      maxSizeForTraceFile: 1000,
      amdpTrace: false,
      maxTimeForTracing: 60,
      analyse: analyseException,
    });
    expect(body.profiler_id).toBe('request-uri-1');
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListSystemMessages', () => {
  it('unwraps the IAdtResponse envelope and does not mask a refusal as success', async () => {
    feeds = {
      systemMessages: jest.fn(async () => refusedResponse('no authorization')),
    };

    const result: any = await handleRuntimeListSystemMessages(
      context as any,
      {},
    );

    expect(result.isError).toBe(true);
  });

  it('answers count/messages on success', async () => {
    const msg = { id: '1', title: 't', text: 'x', severity: 'I' };
    feeds = { systemMessages: jest.fn(async () => okResponse([msg])) };

    const result: any = await handleRuntimeListSystemMessages(
      context as any,
      {},
    );
    const body = JSON.parse(result.content[0].text);

    expect(body.count).toBe(1);
    expect(body.messages).toEqual([msg]);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetGatewayErrorLog', () => {
  it('error_url branch answers the actual detail document — the fixed masking bug (used to serialise the raw envelope)', async () => {
    const detail = { type: 'E', shortText: 'boom' };
    feeds = { gatewayErrorDetail: jest.fn(async () => okResponse(detail)) };

    const result: any = await handleRuntimeGetGatewayErrorLog(context as any, {
      error_url: 'https://example/feed/1',
    });
    const body = JSON.parse(result.content[0].text);

    expect(body.mode).toBe('detail');
    expect(body.error).toEqual(detail);
    expect(body.error.ok).toBeUndefined();
  });

  it('list branch answers count/errors', async () => {
    const err = { type: 'E', shortText: 'x' };
    feeds = { gatewayErrors: jest.fn(async () => okResponse([err])) };

    const result: any = await handleRuntimeGetGatewayErrorLog(
      context as any,
      {},
    );
    const body = JSON.parse(result.content[0].text);

    expect(body.mode).toBe('list');
    expect(body.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListFeeds', () => {
  it.each([
    ['descriptors', 'list', {}],
    [
      'dumps',
      'dumps',
      {
        user: undefined,
        maxResults: undefined,
        from: undefined,
        to: undefined,
      },
    ],
    [
      'system_messages',
      'systemMessages',
      {
        user: undefined,
        maxResults: undefined,
        from: undefined,
        to: undefined,
      },
    ],
    [
      'gateway_errors',
      'gatewayErrors',
      {
        user: undefined,
        maxResults: undefined,
        from: undefined,
        to: undefined,
      },
    ],
  ] as const)(
    'feed_type %s calls feeds.%s',
    async (feedType, member, _options) => {
      const spy = jest.fn(async () => okResponse([{ id: '1' }]));
      feeds = { [member]: spy };

      const result: any = await handleRuntimeListFeeds(
        context as any,
        {
          feed_type: feedType,
        } as any,
      );
      const body = JSON.parse(result.content[0].text);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(body.count).toBe(1);
    },
  );

  it("feed_type variants reads each feed's query variants out of the feed list", async () => {
    const result: any = await handleRuntimeListFeeds(
      context as any,
      {
        feed_type: 'variants',
      } as any,
    );

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.content[0].text);
    expect(body.feed_type).toBe('variants');
    // The feed with no variant is left out.
    expect(body.count).toBe(1);
    expect(body.entries[0]).toEqual({
      feed: '/sap/bc/adt/runtime/dumps',
      title: 'ABAP Runtime Errors',
      variants: [
        {
          title: 'Runtime Errors caused by me (OKYSLYTSIA)',
          query: 'and ( equals ( user , OKYSLYTSIA ) )',
          is_default: true,
        },
        {
          title: 'Runtime Errors for objects I am responsible for (OKYSLYTSIA)',
          query: 'and ( equals ( responsible , OKYSLYTSIA ) )',
          is_default: false,
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------

describe('GetPackageTree', () => {
  it('a refused existence check short-circuits before any walk, and is worded as a read failure, not a false "not found" — a disabled check would proceed to walk regardless', async () => {
    const readMetadata = jest.fn(async () =>
      refusedResponse('object not found'),
    );
    packageClient = {
      getUtils: () => ({}),
      getPackage: () => ({ readMetadata }),
    };

    const result: any = await handleGetPackageTree(
      context as any,
      {
        package_name: 'ZP',
      } as any,
    );

    expect(readMetadata).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('could not be read');
  });

  it('an existing package walks the tree', async () => {
    const readMetadata = jest.fn(async () => okResponse('<pak:package/>'));
    const fetchNodeStructure = jest.fn(async () =>
      okResponse({ objects: [], childNodes: [] }),
    );
    packageClient = {
      getUtils: () => ({ fetchNodeStructure }),
      getPackage: () => ({ readMetadata }),
    };

    const result: any = await handleGetPackageTree(
      context as any,
      {
        package_name: 'ZP',
      } as any,
    );

    // `walkPackage`/`assembleTree` are exercised for real here (not
    // mocked), against a root node with no objects and no children — this
    // test is about the existence check letting a good package through to
    // the walk, not about the walk's own recursion.
    expect(readMetadata).toHaveBeenCalledTimes(1);
    expect(fetchNodeStructure).toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });
});
