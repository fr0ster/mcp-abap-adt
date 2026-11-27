/**
 * Task 25, fix round 1 — coverage for the runtime/profiler/feed/package-tree
 * handlers whose behaviour actually changed and had no test at all before
 * this round. Each `it` here is written to fail against the specific defect
 * fix round 1 named, and was verified to do so by reintroducing that defect
 * one at a time and confirming the matching test (and only that test) turns
 * red — see the task's fix-round-1 report for the reintroduction log.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads: the
// handlers and src/lib/clients bind it when they load (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones).
const AdtRuntimeClientMock = mock.fn<(...args: any[]) => any>(
  function AdtRuntimeClient() {
    return {
      getProfiler: (results?: any) => {
        // The set the handler passes, kept: a trace list is read through the
        // handler's own reading.
        lastProfilerResults = results;
        return profiler;
      },
      getFeeds: (results?: any) => {
        // The set the handler passes, kept: a gateway case reads its document
        // through the handler's own reading.
        lastFeedResults = results;
        return results?.feeds === feedVariantsOf
          ? {
              list: async () => ({
                ok: true,
                getResult: () => ({
                  value: results.feeds({ data: feedListXml }),
                }),
              }),
            }
          : feeds;
      },
      getDumps: () => dumps,
    };
  },
);
const AdtExecutorMock = mock.fn<(...args: any[]) => any>(
  function AdtExecutor() {
    return {
      getClassExecutor: () => classExecutor,
    };
  },
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtRuntimeClient: AdtRuntimeClientMock,
  AdtExecutor: AdtExecutorMock,
});

import { AdtExecutor, AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleGetPackageTree } from '../../handlers/system/high/handleGetPackageTree';
import { handleRuntimeCreateProfilerTraceParameters } from '../../handlers/system/high/handleRuntimeCreateProfilerTraceParameters';
import { handleRuntimeAnalyzeProfilerTrace } from '../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeGetDumpById } from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import { handleRuntimeGetGatewayErrorLog } from '../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import { handleRuntimeGetProfilerTraceData } from '../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import { handleRuntimeListFeeds as handleRuntimeListFeedsOf } from '../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListProfilerTraceFiles } from '../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import { handleRuntimeListSystemMessages } from '../../handlers/system/readonly/handleRuntimeListSystemMessages';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import * as clients from '../../lib/clients';
import { feedVariantsOf } from '../../lib/strategies/feedVariants';
import { okResponse, refusedResponse } from '../helpers/fakeClient';
import { levelOf } from '../helpers/nodeLevels';

/** handleRuntimeListFeeds at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleRuntimeListFeeds = (
  context: Parameters<typeof handleRuntimeListFeedsOf>[0],
  args: Parameters<typeof handleRuntimeListFeedsOf>[1],
) => handleRuntimeListFeedsOf(context, { detail: 'full', ...args });

mock.method(clients, 'createAdtClient', () => packageClient);

const context = { connection: {} as any, logger: undefined };

let profiler: Record<string, unknown>;
let feeds: Record<string, unknown>;
let lastFeedResults: any;
let lastProfilerResults: any;
let dumps: Record<string, unknown>;
let classExecutor: Record<string, unknown>;
let packageClient: Record<string, unknown>;

// `handleGetPackageTree` is the only handler in this file that reaches
// `createAdtClient` (`../../lib/clients`) rather than `AdtRuntimeClient`/
// `AdtExecutor` — mocked at module scope, same as the two above, so the
// factory can close over a `let` the individual test assigns.

/**
 * A cut of an on-premise system's `GET /sap/bc/adt/feeds` (2026-09-26): the dumps feed with its
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
  const FEED =
    '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom" xmlns:trc="http://www.sap.com/adt/runtime/traces/abaptraces">' +
    '<atom:entry><atom:id>/sap/bc/adt/runtime/traces/abaptraces/TRACE0000000000001</atom:id><atom:published>2026-01-01T00:00:00Z</atom:published>' +
    // Every field the reading's type requires (adt-strategies 0.29 throws on
    // a missing one), placeholders where a value is not asserted.
    '<trc:extendedData><trc:objectName>ZCL_X=====CP</trc:objectName><trc:state value="R" text="Finished"/><trc:runtime>42</trc:runtime><trc:user>SAPUSER01</trc:user><trc:host>HOST</trc:host>' +
    '<trc:expiration>2026-01-08T00:00:00Z</trc:expiration><trc:system>SID</trc:system><trc:client>001</trc:client><trc:size>8</trc:size>' +
    '<trc:runtimeABAP>30</trc:runtimeABAP><trc:runtimeSystem>10</trc:runtimeSystem><trc:runtimeDatabase>2</trc:runtimeDatabase><trc:isAggregated>false</trc:isAggregated><trc:amdpFileSize>0</trc:amdpFileSize></trc:extendedData>' +
    '</atom:entry></atom:feed>';
  const listing = () => {
    profiler = {
      list: async () =>
        okResponse(
          lastProfilerResults.list({
            status: 200,
            statusText: 'OK',
            headers: {},
            data: FEED,
          }),
        ),
    };
  };

  it('answers the parsed entries and their count — not a reader that returns nothing', async () => {
    listing();
    const result: any = await handleRuntimeListProfilerTraceFiles(
      context as any,
      { detail: 'full' },
    );
    const body = JSON.parse(result.content[0].text);

    assert.equal(result.isError, false);
    assert.equal(body.count, 1);
    assert.equal(body.entries[0].id, 'TRACE0000000000001');
  });

  it('terse, by default: one TSV row per trace — id, recordedAt, objectName, state, runtime', async () => {
    listing();
    const terse: any = await handleRuntimeListProfilerTraceFiles(
      context as any,
    );
    assert.equal(
      terse.content[0].text,
      '# count 1\nid\trecordedAt\tobjectName\tstate\truntime\nTRACE0000000000001\t2026-01-01T00:00:00Z\tZCL_X=====CP\tFinished\t42',
    );
    const medium: any = await handleRuntimeListProfilerTraceFiles(
      context as any,
      { detail: 'medium' },
    );
    const body = JSON.parse(medium.content[0].text);
    assert.equal('uri' in body.entries[0], false);
    assert.equal(body.entries[0].host, 'HOST');
  });

  it('raw answers the feed as ADT sent it', async () => {
    listing();
    const raw: any = await handleRuntimeListProfilerTraceFiles(context as any, {
      detail: 'raw',
    });
    assert.equal(raw.content[0].text, FEED);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetDumpById', () => {
  it('passes dump_id and view through to getById — a dropped view argument would silently read the default view', async () => {
    const getById = mock.fn(async () => okResponse('<dump>content</dump>'));
    dumps = { getById };

    await handleRuntimeGetDumpById(
      context as any,
      {
        dump_id: 'DUMP-1',
        view: 'formatted',
        response_mode: 'payload',
      } as any,
    );

    assert.ok(
      getById.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          'DUMP-1',
          {
            view: 'formatted',
            analyse: analyseException,
          },
        ]),
      ),
    );
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetProfilerTraceData', () => {
  it('hitlist view: reads the hitlist view and passes with_system_events — an ignored view would call the wrong key', async () => {
    const read = mock.fn(async () => okResponse({ entries: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'hitlist',
      with_system_events: true,
    });

    assert.ok(
      read.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          'trace-1',
          'hitlist',
          {
            withSystemEvents: true,
            analyse: analyseException,
          },
        ]),
      ),
    );
  });

  it('statements view: reads the statements view with id/withDetails/autoDrillDownThreshold — a dropped argument would omit one', async () => {
    const read = mock.fn(async () => okResponse({ statements: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'statements',
      id: 42,
      with_details: true,
      auto_drill_down_threshold: 5,
    });

    assert.ok(
      read.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          'trace-1',
          'statements',
          {
            id: 42,
            withDetails: true,
            autoDrillDownThreshold: 5,
            withSystemEvents: undefined,
            analyse: analyseException,
          },
        ]),
      ),
    );
  });

  it('db_accesses view: reads the dbAccesses view — a wrong member name would silently call a different one', async () => {
    const read = mock.fn(async () => okResponse({ accesses: [] }));
    profiler = { read };

    await handleRuntimeGetProfilerTraceData(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'db_accesses',
    });

    assert.ok(
      read.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          'trace-1',
          'dbAccesses',
          {
            withSystemEvents: undefined,
            analyse: analyseException,
          },
        ]),
      ),
    );
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
    profiler = { read: mock.fn(async () => okResponse(hitList)) };

    const result: any = await handleRuntimeAnalyzeProfilerTrace(
      context as any,
      { trace_id_or_uri: 'trace-1', view: 'hitlist', top: 2 },
    );
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.summary.total_records, 3);
    assert.equal(body.summary.top_records.length, 2);
    assert.equal(body.summary.top_records[0].description, 'slow');
    assert.equal(body.summary.top_records[1].description, 'medium');
    // The ranking field survives into the compact row, flattened — the
    // second half of the bug (a nested object was dropped as "not a
    // primitive", so even a correct ranking would have shown `{}` rows).
    assert.equal(body.summary.top_records[0].grossTime_time, 900);
  });

  // No count of the server's (#391): without top every row is ranked and
  // answered; 0 answers none.
  it('hitlist without top: every entry, ranked', async () => {
    const entries = Array.from({ length: 12 }, (_, n) => ({
      index: n + 1,
      description: `entry ${n + 1}`,
      hitCount: 1,
      grossTime: { time: n + 1, percentage: 1 },
    }));
    profiler = { read: mock.fn(async () => okResponse({ entries })) };

    const result: any = await handleRuntimeAnalyzeProfilerTrace(
      context as any,
      { trace_id_or_uri: 'trace-1', view: 'hitlist' },
    );
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.summary.total_records, 12);
    assert.equal(body.summary.top_records.length, 12);
    assert.equal(body.summary.top_records[0].description, 'entry 12');

    const none: any = await handleRuntimeAnalyzeProfilerTrace(context as any, {
      trace_id_or_uri: 'trace-1',
      view: 'hitlist',
      top: 0,
    });
    assert.equal(
      JSON.parse(none.content[0].text).summary.top_records.length,
      0,
    );
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
    profiler = { read: mock.fn(async () => okResponse(dbAccesses)) };

    const result: any = await handleRuntimeAnalyzeProfilerTrace(
      context as any,
      { trace_id_or_uri: 'trace-1', view: 'db_accesses', top: 5 },
    );
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.summary.total_records, 2);
    assert.equal(body.summary.top_records[0].tableName, 'T2');
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeCreateProfilerTraceParameters', () => {
  it('schedules a trace with every parameter mapped — a dropped argument would silently omit one', async () => {
    const scheduleTrace = mock.fn(async () => okResponse('request-uri-1'));
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

    assert.ok(
      scheduleTrace.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          {
            headers: DEFAULT_ADT_HEADERS['classExecutor.scheduleTrace'],
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
          },
        ]),
      ),
    );
    assert.equal(body.profiler_id, 'request-uri-1');
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListSystemMessages', () => {
  it('unwraps the IAdtResponse envelope and does not mask a refusal as success', async () => {
    feeds = {
      systemMessages: mock.fn(async () => refusedResponse('no authorization')),
    };

    const result: any = await handleRuntimeListSystemMessages(
      context as any,
      {},
    );

    assert.equal(result.isError, true);
  });

  const MESSAGES =
    '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry>' +
    '<atom:id>MSG1</atom:id><atom:title>Maintenance tonight</atom:title><atom:updated>2026-11-22T10:00:00Z</atom:updated>' +
    '</atom:entry></atom:feed>';
  const readThrough = (data: string) =>
    okResponse(
      lastFeedResults.systemMessages({
        status: 200,
        statusText: 'OK',
        headers: {},
        data,
      }),
    );

  it('terse, by default: a TSV row per message', async () => {
    feeds = { systemMessages: async () => readThrough(MESSAGES) };
    const result: any = await handleRuntimeListSystemMessages(
      context as any,
      {},
    );
    const lines = result.content[0].text.split('\n');
    assert.deepStrictEqual(lines.slice(0, 2), [
      '# count 1',
      'id\tcreatedOn\tauthor\ttitle',
    ]);
    assert.equal(lines[2]?.split('\t')[0], 'MSG1');
  });

  it('full answers count/messages', async () => {
    feeds = { systemMessages: async () => readThrough(MESSAGES) };
    const result: any = await handleRuntimeListSystemMessages(context as any, {
      detail: 'full',
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.count, 1);
    assert.equal(body.messages[0].title, 'Maintenance tonight');
  });

  it('raw answers the feed as ADT sent it', async () => {
    feeds = { systemMessages: async () => readThrough(MESSAGES) };
    const result: any = await handleRuntimeListSystemMessages(context as any, {
      detail: 'raw',
    });
    assert.equal(result.content[0].text, MESSAGES);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeGetGatewayErrorLog', () => {
  /** A wire answer read by the handler's own reading of `slot`. */
  const readThrough = (slot: string, data: string) =>
    okResponse(
      lastFeedResults[slot]({
        status: 200,
        statusText: 'OK',
        headers: {},
        data,
      }),
    );
  /** A gateway error feed of one entry, as the cloud writes its id. */
  const FEED =
    '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry>' +
    '<atom:id>Backend Error/ABC123/20261122101010</atom:id><atom:title>Backend Error: boom</atom:title>' +
    '<atom:updated>20261122101010</atom:updated><atom:author><atom:name>SAPUSER01</atom:name></atom:author>' +
    '</atom:entry></atom:feed>';
  const HTML = '<html><body>RAW_DETAIL_MARKER</body></html>';

  it('error_url reads that document; raw answers it as ADT sent it', async () => {
    const asked: string[] = [];
    feeds = {
      gatewayErrorDetail: async (uri: string) => {
        asked.push(uri);
        return readThrough('gatewayErrorDetail', HTML);
      },
    };

    const result: any = await handleRuntimeGetGatewayErrorLog(context as any, {
      error_url: '/sap/bc/adt/gw/errorlog/Backend%20Error/ABC123',
      detail: 'raw',
    });

    assert.deepStrictEqual(asked, [
      '/sap/bc/adt/gw/errorlog/Backend%20Error/ABC123',
    ]);
    assert.equal(result.content[0].text, HTML);
  });

  it('list branch answers count/errors at full', async () => {
    feeds = { gatewayErrors: async () => readThrough('gatewayErrors', FEED) };

    const result: any = await handleRuntimeGetGatewayErrorLog(context as any, {
      detail: 'full',
    });
    const body = JSON.parse(result.content[0].text);

    assert.equal(body.mode, 'list');
    assert.equal(body.count, 1);
    assert.equal(body.errors[0].opid, 'ABC123');
  });

  it('terse, by default: a row per error, its opid and the kind its detail is read under', async () => {
    feeds = { gatewayErrors: async () => readThrough('gatewayErrors', FEED) };

    const result: any = await handleRuntimeGetGatewayErrorLog(
      context as any,
      {},
    );

    const lines = result.content[0].text.split('\n');
    assert.deepStrictEqual(lines.slice(0, 2), [
      '# count 1',
      'opid\tdetail_kind\tdateTime\ttype\tshortText\tusername',
    ]);
    const [opid, kind, dateTime, , shortText, username] = lines[2].split('\t');
    assert.deepStrictEqual(
      [opid, kind, dateTime, shortText, username],
      ['ABC123', 'Backend Error', '20261122101010', 'boom', 'SAPUSER01'],
    );
  });

  it('raw answers the list as the Atom document ADT sent', async () => {
    feeds = { gatewayErrors: async () => readThrough('gatewayErrors', FEED) };
    const result: any = await handleRuntimeGetGatewayErrorLog(context as any, {
      detail: 'raw',
    });
    assert.equal(result.content[0].text, FEED);
  });

  it('reads the detail by opid under its kind', async () => {
    const asked: string[] = [];
    feeds = {
      gatewayErrorDetail: async (uri: string) => {
        asked.push(uri);
        return readThrough('gatewayErrorDetail', HTML);
      },
    };

    await handleRuntimeGetGatewayErrorLog(context as any, {
      opid: 'ABC123',
      detail_kind: 'Backend Error',
      detail: 'raw',
    });

    assert.deepStrictEqual(asked, [
      '/sap/bc/adt/gw/errorlog/Backend%20Error/ABC123',
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListFeeds', () => {
  for (const [feedType, member, _options] of [
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
  ] as const) {
    it(format('feed_type %s calls feeds.%s', feedType, member), async () => {
      // The entries readings are wrapped to keep SAP's next page link, so a
      // feed member answers a page: its entries, and `next_to` when there is
      // more.
      const entries = [{ id: '1', transactionId: '1' }];
      const spy = mock.fn(async () =>
        okResponse(member === 'list' ? entries : { entries }),
      );
      feeds = { [member]: spy };

      const result: any = await handleRuntimeListFeeds(
        context as any,
        {
          feed_type: feedType,
        } as any,
      );
      const body = JSON.parse(result.content[0].text);

      assert.equal(spy.mock.callCount(), 1);
      assert.equal(body.count, 1);
    });
  }

  it('terse, by default: the dumps as dump_id, updated and title rows, next_to as a # line', async () => {
    const entries = [
      {
        id: '/sap/bc/adt/vit/runtime/dumps/20261122%20ABC',
        title: 'MESSAGE_TYPE_X in ZPROG',
        updated: '2026-11-22T10:00:00Z',
        link: '/sap/bc/adt/vit/runtime/dumps/20261122%20ABC',
        content: 'LONG_DUMP_CONTENT_NEVER_TERSE',
      },
    ];
    feeds = {
      dumps: mock.fn(async () =>
        okResponse({ entries, next: '/feed?to=20261122095959' }),
      ),
    };

    const result: any = await handleRuntimeListFeedsOf(
      context as any,
      {
        feed_type: 'dumps',
        max_results: 1,
      } as any,
    );
    const text: string = result.content[0].text;

    assert.equal(text.split('\n')[0], '# feed dumps');
    assert.equal(text.split('\n')[1], '# count 1');
    assert.deepStrictEqual(text.split('\n').slice(-2), [
      'dump_id\tupdated\ttitle',
      '20261122%20ABC\t2026-11-22T10:00:00Z\tMESSAGE_TYPE_X in ZPROG',
    ]);
    assert.equal(text.includes('LONG_DUMP_CONTENT_NEVER_TERSE'), false);
  });

  it("feed_type variants reads each feed's query variants out of the feed list", async () => {
    const result: any = await handleRuntimeListFeeds(
      context as any,
      {
        feed_type: 'variants',
      } as any,
    );

    assert.equal(result.isError, false);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.feed_type, 'variants');
    // Every feed is listed; the one with no variant has none.
    assert.equal(body.count, 2);
    assert.deepStrictEqual(body.entries[1].variants, []);
    assert.deepStrictEqual(body.entries[0], {
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

describe('RuntimeListFeeds variants terse', () => {
  it('a feed without variants is still a row', async () => {
    const result: any = await handleRuntimeListFeedsOf(
      context as any,
      {
        feed_type: 'variants',
      } as any,
    );
    const rows = result.content[0].text.split('\n');
    assert.ok(
      rows.some((row: string) => row.endsWith('\t\t\t')),
      result.content[0].text,
    );
  });
});

describe('GetPackageTree', () => {
  it('a refused existence check short-circuits before any walk, and answers the error of the read as it is with its step — a disabled check would proceed to walk regardless', async () => {
    const readMetadata = mock.fn(async () =>
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

    assert.equal(readMetadata.mock.callCount(), 1);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      message: 'object not found',
      origin: 'refusal',
      step: 'read package metadata',
    });
  });

  it('an existing package walks the tree', async () => {
    const readMetadata = mock.fn(async () => okResponse('<pak:package/>'));
    const fetchNodeStructure = mock.fn(async () => okResponse(levelOf([], [])));
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
    assert.equal(readMetadata.mock.callCount(), 1);
    assert.ok(fetchNodeStructure.mock.callCount() > 0);
    assert.equal(result.isError, false);
  });
});

describe('feedVariantsOf', () => {
  it('reads every feed of the recorded feed list, its variants or none', () => {
    const read = feedVariantsOf({ data: feedListXml });
    assert.deepStrictEqual(read.at(-1)?.variants, []);
    assert.deepStrictEqual(read.slice(0, 1), [
      {
        feed: '/sap/bc/adt/runtime/dumps',
        title: 'ABAP Runtime Errors',
        variants: [
          {
            title: 'Runtime Errors caused by me (OKYSLYTSIA)',
            query: 'and ( equals ( user , OKYSLYTSIA ) )',
            is_default: true,
          },
          {
            title:
              'Runtime Errors for objects I am responsible for (OKYSLYTSIA)',
            query: 'and ( equals ( responsible , OKYSLYTSIA ) )',
            is_default: false,
          },
        ],
      },
    ]);
  });

  it('reads a title in CDATA, an attribute quoted with apostrophes and an entity, as the XML parser does', () => {
    const xml =
      '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">' +
      '<atom:entry><atom:id>/sap/bc/adt/runtime/dumps</atom:id><atom:title type="text"><![CDATA[Errors & dumps]]></atom:title>' +
      '<feed:extendedData xmlns:feed="http://www.sap.com/adt/feeds"><feed:queryVariants>' +
      "<feed:queryVariant title='Mine &amp; yours' queryString='equals ( user , X )' isDefault='true'/>" +
      '</feed:queryVariants></feed:extendedData></atom:entry>' +
      '</atom:feed>';
    assert.deepStrictEqual(feedVariantsOf({ data: xml }), [
      {
        feed: '/sap/bc/adt/runtime/dumps',
        title: 'Errors & dumps',
        variants: [
          {
            title: 'Mine & yours',
            query: 'equals ( user , X )',
            is_default: true,
          },
        ],
      },
    ]);
  });
});
