/**
 * Issue #261 — the dump tools: SAP pages a feed at 100 entries and offers the
 * next page as a `rel="next"` link; the dumps feed filters on the attributes
 * its descriptor declares; a dump is read by the id its feed entry carries;
 * and its summary is the `dump:dump` root, not whatever keys happen to match.
 *
 * The feed and dump documents below are cut to the parts these readings touch
 * and sanitised: the user is `SAPUSER01`, the objects and packages are
 * placeholders.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, type Mock, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads: the
// handlers and src/lib/clients bind it when they load (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones).
const AdtRuntimeClientMock = mock.fn<(...args: any[]) => any>(
  function AdtRuntimeClient() {
    return {
      getFeeds: () => feeds,
      getDumps: () => dumps,
    };
  },
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtRuntimeClient: AdtRuntimeClientMock,
});

import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import {
  dumpIdFrom,
  dumpSummaryOf,
  handleRuntimeGetDumpById,
} from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import {
  dumpIdOf,
  dumpQueryOf,
  handleRuntimeListFeeds as handleRuntimeListFeedsOf,
} from '../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  FEED_ENTRIES_CEILING,
  FEED_PAGE_DEFAULT,
  feedPage,
  feedPages,
  nextToOf,
  secondBefore,
} from '../../lib/strategies/feedPages';
import { assertMatchObject, assertThrows } from '../helpers/assertions';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

/** handleRuntimeListFeeds at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleRuntimeListFeeds = (
  context: Parameters<typeof handleRuntimeListFeedsOf>[0],
  args: Parameters<typeof handleRuntimeListFeedsOf>[1],
) => handleRuntimeListFeedsOf(context, { detail: 'full', ...args });

const context = { connection: {} as any, logger: undefined };

let feeds: Record<string, Mock<(...args: any[]) => any>>;
let dumps: Record<string, Mock<(...args: any[]) => any>>;

const body = (result: any) => JSON.parse(result.content[0].text);

/** A success's value — `getResult` is on the success half of the union. */
const pageValue = (answered: unknown): any =>
  (answered as { getResult: () => { value: unknown } }).getResult().value;

const entryId = (n: number) => `/sap/bc/adt/vit/runtime/dumps/ID${n}%20X`;

/** A page of `count` entries starting at `first`, and SAP's next link or none. */
function page(first: number, count: number, next?: string) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: entryId(first + i),
  }));
  return okResponse(next ? { entries, next_to: next } : { entries });
}

// ---------------------------------------------------------------------------

describe('nextToOf', () => {
  it("reads the next link's to, attributes in any order, &amp; or not", () => {
    assert.equal(
      nextToOf(
        '<atom:feed><atom:link href="/sap/bc/adt/runtime/dumps?$top=100&amp;to=20260930043748" rel="next"/></atom:feed>',
      ),
      '20260930043748',
    );
    assert.equal(
      nextToOf(
        '<feed><link rel="next" type="application/atom+xml" href="/x?to=20260101000000&$top=100"/></feed>',
      ),
      '20260101000000',
    );
  });

  it('reads a next link whose attributes are quoted with apostrophes, as XML allows', () => {
    assert.equal(
      nextToOf(
        "<atom:feed xmlns:atom=\"http://www.w3.org/2005/Atom\"><atom:link rel='next' href='/sap/bc/adt/runtime/dumps?$top=100&amp;to=20260930043748'/></atom:feed>",
      ),
      '20260930043748',
    );
  });

  it('reads a next link that is not self-closing', () => {
    assert.equal(
      nextToOf(
        '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:link href="/x?$top=100&amp;to=2026" rel="next"></atom:link></atom:feed>',
      ),
      '2026',
    );
  });

  it('answers nothing without a next link', () => {
    assert.equal(
      nextToOf('<atom:feed><atom:link href="/x?to=1" rel="self"/></atom:feed>'),
      undefined,
    );
    assert.equal(nextToOf(''), undefined);
  });

  it('feedPage keeps the entries reading and adds the next page', () => {
    const read = feedPage((() => [{ id: 'a' }]) as never);
    assert.deepStrictEqual(
      read({
        data: '<feed><link rel="next" href="/x?$top=100&amp;to=2026"/></feed>',
      } as never),
      { entries: [{ id: 'a' }], next_to: '2026' },
    );
    assert.deepStrictEqual(read({ data: '<feed/>' } as never), {
      entries: [{ id: 'a' }],
    });
  });
});

const byId = {
  keyOf: (e: any) => e.id as string,
  stampOf: (e: any) => e.updated as string | undefined,
};

/** Entries `first`… stamped with the given instants, in order. */
function stamped(first: number, stamps: string[]) {
  return stamps.map((updated, i) => ({ id: entryId(first + i), updated }));
}

// ---------------------------------------------------------------------------

describe('feedPages', () => {
  /** `n` entries from `first`, one second apart, newest first. */
  function seconds(first: number, n: number, from = Date.UTC(2026, 9, 1, 7)) {
    return Array.from({ length: n }, (_, i) => ({
      id: entryId(first + i),
      updated: new Date(from - (first + i) * 1000)
        .toISOString()
        .replace('.000', ''),
    }));
  }

  it('follows the next link until the count is reached, and answers where to go on', async () => {
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(async () => page(0, 100, 'T1'), 0);
      fn.mock.mockImplementationOnce(async () => page(100, 100, 'T2'), 1);
      fn.mock.mockImplementationOnce(async () => page(200, 51, 'T3'), 2);
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(
      await feedPages(fetch, { maxResults: 250, to: 'T0' }, byId),
    );

    // One entry beyond the count is read: it marks where the answer ends.
    assert.deepStrictEqual(
      fetch.mock.calls.map((c) => c.arguments[0]),
      [
        { maxResults: 100, to: 'T0' },
        { maxResults: 100, to: 'T1' },
        { maxResults: 51, to: 'T2' },
      ],
    );
    assert.equal(value.entries.length, 250);
    // Entries without a time: SAP's own link is the continuation.
    assert.equal(value.next_to, 'T3');
  });

  it('stops where SAP offers no next page, and says nothing remains', async () => {
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(async () => page(0, 100, 'T1'), 0);
      fn.mock.mockImplementationOnce(async () => page(100, 30), 1);
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { maxResults: 500 }, byId));

    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(value.entries.length, 130);
    assert.equal(value.next_to, undefined);
  });

  it('keeps an entry on both sides of a page boundary once', async () => {
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(async () => page(0, 3, 'T1'), 0);
      fn.mock.mockImplementationOnce(async () => page(2, 3), 1);
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { maxResults: 10 }, byId));

    assert.deepStrictEqual(
      value.entries.map((e: any) => e.id),
      [0, 1, 2, 3, 4].map(entryId),
    );
  });

  it('asks a boundary page for its repeats too — SAP answers the second named by `to` again', async () => {
    // As the BTP ABAP environment paged (2026-10-01): the first page ends on
    // four entries of one second, its next link names that second, and the
    // next page starts with the same four.
    const boundary = '2026-09-30T05:37:32Z';
    const first = [
      ...seconds(0, 96, Date.UTC(2026, 9, 1, 7)),
      ...stamped(96, Array(4).fill(boundary)),
    ];
    const second = [
      ...first.slice(96),
      ...seconds(100, 60, Date.UTC(2026, 8, 30, 5, 37, 31) + 100_000),
    ];
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(
        async () => okResponse({ entries: first, next_to: '20260930053732' }),
        0,
      );
      fn.mock.mockImplementationOnce(
        async ({ maxResults }: any) =>
          okResponse({
            entries: second.slice(0, maxResults),
            next_to: '20260930050000',
          }),
        1,
      );
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { maxResults: 150 }, byId));

    // 151 to read, 100 read, 4 of them to come again.
    assert.deepStrictEqual(fetch.mock.calls[1]?.arguments[0], {
      maxResults: 55,
      to: '20260930053732',
    });
    assert.equal(value.entries.length, 150);
    assert.equal(new Set(value.entries.map((e: any) => e.id)).size, 150);
  });

  it('never ends an answer inside a second, so reading on repeats nothing and skips nothing', async () => {
    // Newest first: s3, then two entries of s2, then s1.
    const all = stamped(0, [
      '2026-10-01T07:00:03Z',
      '2026-10-01T07:00:02Z',
      '2026-10-01T07:00:02Z',
      '2026-10-01T07:00:01Z',
    ]);
    // The feed as SAP answers it: entries at or before `to`, inclusive.
    const feed = mock.fn(async ({ maxResults, to }: any) => {
      const from = to
        ? all.filter((e) => e.updated.replace(/\D/g, '') <= to)
        : all;
      const entries = from.slice(0, maxResults);
      const last = entries[entries.length - 1];
      return okResponse(
        entries.length < from.length
          ? { entries, next_to: last.updated.replace(/\D/g, '') }
          : { entries },
      );
    });

    const first = pageValue(await feedPages(feed, { maxResults: 2 }, byId));
    // s2's two entries are left whole to the next call.
    assert.deepStrictEqual(
      first.entries.map((e: any) => e.id),
      [entryId(0)],
    );
    assert.equal(first.next_to, '20261001070002');

    const second = pageValue(
      await feedPages(feed, { maxResults: 10, to: first.next_to }, byId),
    );
    assert.deepStrictEqual(
      second.entries.map((e: any) => e.id),
      [1, 2, 3].map(entryId),
    );
    assert.equal(second.next_to, undefined);
  });

  it('answers a second holding more than asked whole, and reads on from the second before it', async () => {
    const crowded = '2026-10-01T07:00:00Z';
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(
        async () =>
          okResponse({
            entries: stamped(0, Array(3).fill(crowded)),
            next_to: '20261001070000',
          }),
        0,
      );
      fn.mock.mockImplementationOnce(
        async () =>
          okResponse({
            entries: stamped(0, [
              ...Array(4).fill(crowded),
              '2026-10-01T06:59:59Z',
            ]),
            next_to: '20261001065959',
          }),
        1,
      );
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { maxResults: 2 }, byId));

    assert.deepStrictEqual(fetch.mock.calls[1]?.arguments[0], {
      maxResults: 100,
      to: '20261001070000',
    });
    // All four of that second, more than asked; the next read starts past it.
    assert.deepStrictEqual(
      value.entries.map((e: any) => e.id),
      [0, 1, 2, 3].map(entryId),
    );
    assert.equal(value.next_to, '20261001065959');
    assert.equal(value.incomplete_second, undefined);
  });

  it('says so when a second holds more than one request answers', async () => {
    const crowded = '2026-10-01T07:00:00Z';
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(
        async () =>
          okResponse({
            entries: stamped(0, Array(3).fill(crowded)),
            next_to: '20261001070000',
          }),
        0,
      );
      fn.mock.mockImplementationOnce(
        async () =>
          okResponse({
            entries: stamped(0, Array(100).fill(crowded)),
            next_to: '20261001070000',
          }),
        1,
      );
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { maxResults: 2 }, byId));

    assert.equal(value.entries.length, 100);
    assert.equal(value.next_to, '20261001065959');
    assert.equal(value.incomplete_second, '20261001070000');
  });

  it('steps a bound back one second across a day', () => {
    assert.equal(secondBefore('20261001000000'), '20260930235959');
    assert.equal(secondBefore('20261001070000'), '20261001065959');
  });

  it(`never collects more than ${FEED_ENTRIES_CEILING}`, async () => {
    let n = 0;
    const fetch = mock.fn(async ({ maxResults }: any) => {
      const answered = page(n, maxResults, `T${n + maxResults}`);
      n += maxResults;
      return answered;
    });

    const value = pageValue(
      await feedPages(fetch as never, { maxResults: 5000 }, byId),
    );

    assert.equal(fetch.mock.callCount(), FEED_ENTRIES_CEILING / 100 + 1);
    assert.equal(value.entries.length, FEED_ENTRIES_CEILING);
    assert.equal(value.next_to, `T${FEED_ENTRIES_CEILING + 1}`);
  });

  it("reads the default count the same way when no count is given — its next_to is ours, not SAP's inclusive link", async () => {
    const all = stamped(0, [
      ...Array(49).fill('2026-10-01T07:00:09Z'),
      '2026-10-01T07:00:08Z',
      '2026-10-01T07:00:08Z',
      '2026-10-01T07:00:07Z',
    ]);
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(
        async () =>
          okResponse({ entries: all.slice(0, 51), next_to: '20261001070008' }),
        0,
      );
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    const value = pageValue(await feedPages(fetch, { to: 'T0' }, byId));

    assert.deepStrictEqual(
      fetch.mock.calls.map((c) => c.arguments),
      [[{ maxResults: FEED_PAGE_DEFAULT + 1, to: 'T0' }]],
    );
    // The second ending at the cut goes whole to the next read.
    assert.equal(value.entries.length, 49);
    assert.equal(value.next_to, '20261001070008');
  });

  it('answers a failing page as itself', async () => {
    const refused = refusedResponse('page two refused');
    const fetch = ((fn) => {
      fn.mock.mockImplementationOnce(async () => page(0, 100, 'T1'), 0);
      fn.mock.mockImplementationOnce(async () => refused, 1);
      return fn;
    })(mock.fn<(...args: any[]) => any>());

    assert.equal(await feedPages(fetch, { maxResults: 200 }, byId), refused);
  });
});

// ---------------------------------------------------------------------------

describe('the dumps feed query', () => {
  it('is nothing when no filter is given', () => {
    assert.equal(dumpQueryOf({}), undefined);
    assert.equal(dumpQueryOf({ user: '  ' }), undefined);
  });

  it('puts the user as equals and the rest as contains, in one and ( … )', () => {
    assert.equal(
      dumpQueryOf({
        user: 'SAPUSER01',
        runtime_error: 'CONVT_NO_NUMBER',
        exception: 'CX_SY_CONVERSION',
        object_name: 'ZCL_PLACEHOLDER',
        package: 'ZPLACEHOLDER',
        component: 'BC-ABA',
      }),
      'and ( equals ( user , SAPUSER01 ) , contains ( runtimeError , CONVT_NO_NUMBER ) , ' +
        'contains ( exception , CX_SY_CONVERSION ) , contains ( objectName , ZCL_PLACEHOLDER ) , ' +
        'contains ( package , ZPLACEHOLDER ) , contains ( component , BC-ABA ) )',
    );
  });

  it('refuses a value that would end its operand', () => {
    assertThrows(() => dumpQueryOf({ runtime_error: 'A B' }), /blanks/);
    assertThrows(() => dumpQueryOf({ package: 'A,B' }), /commas/);
    assertThrows(() => dumpQueryOf({ exception: 'A)' }), /parentheses/);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListFeeds — dumps', () => {
  beforeEach(() => {
    AdtRuntimeClientMock.mock.resetCalls();
  });

  it('sends the filters as one query, pages on, and gives each entry its dump_id', async () => {
    const dumpsMember = ((fn) => {
      fn.mock.mockImplementationOnce(async () => page(0, 100, 'T1'), 0);
      fn.mock.mockImplementationOnce(async () => page(100, 21, 'T2'), 1);
      return fn;
    })(mock.fn<(...args: any[]) => any>());
    feeds = { dumps: dumpsMember };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'dumps',
      user: 'SAPUSER01',
      runtime_error: 'CONVT',
      max_results: 120,
      from: '20260901000000',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(dumpsMember.mock.calls[1 - 1]?.arguments, [
      {
        user: 'SAPUSER01',
        query:
          'and ( equals ( user , SAPUSER01 ) , contains ( runtimeError , CONVT ) )',
        from: '20260901000000',
        analyse: analyseException,
        maxResults: 100,
        to: undefined,
      },
    ]);
    assertMatchObject(dumpsMember.mock.calls[1]?.arguments[0], {
      maxResults: 21,
      to: 'T1',
    });
    const answered = body(result);
    assert.equal(answered.count, 120);
    assert.equal(answered.next_to, 'T2');
    assert.deepStrictEqual(answered.entries[0], {
      dump_id: 'ID0%20X',
      id: entryId(0),
    });
  });

  it('refuses a dumps filter on another feed rather than dropping it', async () => {
    feeds = { systemMessages: mock.fn() };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'system_messages',
      runtime_error: 'CONVT',
    });

    assert.equal(result.isError, true);
    assert.equal(feeds.systemMessages.mock.callCount(), 0);
  });

  it('refuses a value that would break the query, before any request', async () => {
    feeds = { dumps: mock.fn() };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'dumps',
      object_name: 'A B',
    });

    assert.equal(result.isError, true);
    assert.equal(feeds.dumps.mock.callCount(), 0);
  });
});

// ---------------------------------------------------------------------------

/**
 * The default view's root: the attributes the BTP ABAP environment answered
 * (2026-09-30), and the termination link as it answered it (2026-10-01) —
 * `adt://<system>` before the ADT path, `#start=<line>,<column>` after it;
 * the system is `SID` here. Chapters and payload cut.
 */
const dumpXml =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<dump:dump xmlns:dump="http://www.sap.com/adt/categories/dump" xmlns:adtcore="http://www.sap.com/adt/core"' +
  ' title="Runtime error RAISE_SHORTDUMP" error="RAISE_SHORTDUMP" author="SAPUSER01"' +
  ' exception="CX_SY_ZERODIVIDE" terminatedProgram="ZCL_PLACEHOLDER===============CP"' +
  ' serverInstance="host_SID_00" datetime="2026-09-30T04:37:48Z" systemDate="20260930" systemTime="043748">' +
  '<dump:links>' +
  '<dump:link relation="self" uri="/sap/bc/adt/runtime/dump/ID1"/>' +
  '<dump:link relation="http://www.sap.com/adt/relations/runtime/dump/termination" type="text/plain"' +
  ' uri="adt://SID/sap/bc/adt/oo/classes/zcl_placeholder/source/main#start=42,8"/>' +
  '</dump:links>' +
  '<dump:chapters><dump:chapter name="kap0" title="Short Text" category="ABAP Developer View" line="1"/>' +
  '<dump:chapter name="kap11" title="User and Transaction" category="System Environment" line="40"/></dump:chapters>' +
  '</dump:dump>';

describe('RuntimeGetDumpById', () => {
  it('takes the id out of a feed entry URI, or the id as it is', () => {
    assert.equal(
      dumpIdFrom('/sap/bc/adt/vit/runtime/dumps/ID1%20X'),
      'ID1%20X',
    );
    assert.equal(dumpIdFrom('/sap/bc/adt/runtime/dumps/ID1'), 'ID1');
    assert.equal(dumpIdFrom(' ID1 '), 'ID1');
    assert.equal(dumpIdOf(entryId(7)), dumpIdFrom(entryId(7)));
  });

  it('summarises the root: runtime error, exception, program, time, user, termination', () => {
    assert.deepStrictEqual(dumpSummaryOf(dumpXml), {
      runtime_error: 'RAISE_SHORTDUMP',
      exception: 'CX_SY_ZERODIVIDE',
      title: 'Runtime error RAISE_SHORTDUMP',
      terminated_program: 'ZCL_PLACEHOLDER===============CP',
      datetime: '2026-09-30T04:37:48Z',
      user: 'SAPUSER01',
      termination: {
        uri: '/sap/bc/adt/oo/classes/zcl_placeholder/source/main',
        line: 42,
      },
    });
  });

  it('has no summary for a document without the root', () => {
    assert.equal(dumpSummaryOf('plain formatted text'), undefined);
    assert.equal(dumpSummaryOf('<html><body/></html>'), undefined);
  });

  it('reads the dump a URI names, and answers the summary alone when asked', async () => {
    const getById = mock.fn(async () => okResponse(dumpXml));
    dumps = { getById };

    const result: any = await handleRuntimeGetDumpById(context as any, {
      dump_id: entryId(1),
      response_mode: 'summary',
    });

    assert.ok(
      getById.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [
          'ID1%20X',
          {
            analyse: analyseException,
            view: 'default',
          },
        ]),
      ),
    );
    const answered = body(result);
    assert.equal(answered.summary.runtime_error, 'RAISE_SHORTDUMP');
    assert.equal(answered.summary.termination.line, 42);
    assert.equal(answered.payload, undefined);
  });
});
