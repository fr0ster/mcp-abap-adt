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
  handleRuntimeListFeeds,
} from '../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  FEED_ENTRIES_CEILING,
  FEED_PAGE_DEFAULT,
  feedPage,
  feedPages,
  nextToOf,
} from '../../lib/strategies/feedPages';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

const context = { connection: {} as any, logger: undefined };

let feeds: Record<string, jest.Mock>;
let dumps: Record<string, jest.Mock>;

jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  AdtRuntimeClient: jest.fn(() => ({
    getFeeds: () => feeds,
    getDumps: () => dumps,
  })),
}));

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
    expect(
      nextToOf(
        '<atom:feed><atom:link href="/sap/bc/adt/runtime/dumps?$top=100&amp;to=20260930043748" rel="next"/></atom:feed>',
      ),
    ).toBe('20260930043748');
    expect(
      nextToOf(
        '<feed><link rel="next" type="application/atom+xml" href="/x?to=20260101000000&$top=100"/></feed>',
      ),
    ).toBe('20260101000000');
  });

  it('answers nothing without a next link', () => {
    expect(
      nextToOf('<atom:feed><atom:link href="/x?to=1" rel="self"/></atom:feed>'),
    ).toBeUndefined();
    expect(nextToOf('')).toBeUndefined();
  });

  it('feedPage keeps the entries reading and adds the next page', () => {
    const read = feedPage((() => [{ id: 'a' }]) as never);
    expect(
      read({
        data: '<feed><link rel="next" href="/x?$top=100&amp;to=2026"/></feed>',
      } as never),
    ).toEqual({ entries: [{ id: 'a' }], next_to: '2026' });
    expect(read({ data: '<feed/>' } as never)).toEqual({
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
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(page(0, 100, 'T1'))
      .mockResolvedValueOnce(page(100, 100, 'T2'))
      .mockResolvedValueOnce(page(200, 51, 'T3'));

    const value = pageValue(
      await feedPages(fetch, { maxResults: 250, to: 'T0' }, byId),
    );

    // One entry beyond the count is read: it marks where the answer ends.
    expect(fetch.mock.calls.map(([p]) => p)).toEqual([
      { maxResults: 100, to: 'T0' },
      { maxResults: 100, to: 'T1' },
      { maxResults: 51, to: 'T2' },
    ]);
    expect(value.entries).toHaveLength(250);
    // Entries without a time: SAP's own link is the continuation.
    expect(value.next_to).toBe('T3');
  });

  it('stops where SAP offers no next page, and says nothing remains', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(page(0, 100, 'T1'))
      .mockResolvedValueOnce(page(100, 30));

    const value = pageValue(await feedPages(fetch, { maxResults: 500 }, byId));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(value.entries).toHaveLength(130);
    expect(value.next_to).toBeUndefined();
  });

  it('keeps an entry on both sides of a page boundary once', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(page(0, 3, 'T1'))
      .mockResolvedValueOnce(page(2, 3));

    const value = pageValue(await feedPages(fetch, { maxResults: 10 }, byId));

    expect(value.entries.map((e: any) => e.id)).toEqual(
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
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okResponse({ entries: first, next_to: '20260930053732' }),
      )
      .mockImplementationOnce(async ({ maxResults }: any) =>
        okResponse({
          entries: second.slice(0, maxResults),
          next_to: '20260930050000',
        }),
      );

    const value = pageValue(await feedPages(fetch, { maxResults: 150 }, byId));

    // 151 to read, 100 read, 4 of them to come again.
    expect(fetch.mock.calls[1][0]).toEqual({
      maxResults: 55,
      to: '20260930053732',
    });
    expect(value.entries).toHaveLength(150);
    expect(new Set(value.entries.map((e: any) => e.id)).size).toBe(150);
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
    const feed = jest.fn(async ({ maxResults, to }: any) => {
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
    expect(first.entries.map((e: any) => e.id)).toEqual([entryId(0)]);
    expect(first.next_to).toBe('20261001070002');

    const second = pageValue(
      await feedPages(feed, { maxResults: 10, to: first.next_to }, byId),
    );
    expect(second.entries.map((e: any) => e.id)).toEqual(
      [1, 2, 3].map(entryId),
    );
    expect(second.next_to).toBeUndefined();
  });

  it('keeps one crowded second whole rather than answer nothing', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(
      okResponse({
        entries: stamped(0, Array(3).fill('2026-10-01T07:00:00Z')),
        next_to: '20261001070000',
      }),
    );

    const value = pageValue(await feedPages(fetch, { maxResults: 2 }, byId));

    expect(value.entries).toHaveLength(2);
    expect(value.next_to).toBe('20261001070000');
  });

  it(`never collects more than ${FEED_ENTRIES_CEILING}`, async () => {
    let n = 0;
    const fetch = jest.fn(async ({ maxResults }: any) => {
      const answered = page(n, maxResults, `T${n + maxResults}`);
      n += maxResults;
      return answered;
    });

    const value = pageValue(
      await feedPages(fetch as never, { maxResults: 5000 }, byId),
    );

    expect(fetch).toHaveBeenCalledTimes(FEED_ENTRIES_CEILING / 100 + 1);
    expect(value.entries).toHaveLength(FEED_ENTRIES_CEILING);
    expect(value.next_to).toBe(`T${FEED_ENTRIES_CEILING + 1}`);
  });

  it("reads the default count the same way when no count is given — its next_to is ours, not SAP's inclusive link", async () => {
    const all = stamped(0, [
      ...Array(49).fill('2026-10-01T07:00:09Z'),
      '2026-10-01T07:00:08Z',
      '2026-10-01T07:00:08Z',
      '2026-10-01T07:00:07Z',
    ]);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okResponse({ entries: all.slice(0, 51), next_to: '20261001070008' }),
      );

    const value = pageValue(await feedPages(fetch, { to: 'T0' }, byId));

    expect(fetch.mock.calls).toEqual([
      [{ maxResults: FEED_PAGE_DEFAULT + 1, to: 'T0' }],
    ]);
    // The second ending at the cut goes whole to the next read.
    expect(value.entries).toHaveLength(49);
    expect(value.next_to).toBe('20261001070008');
  });

  it('answers a failing page as itself', async () => {
    const refused = refusedResponse('page two refused');
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(page(0, 100, 'T1'))
      .mockResolvedValueOnce(refused);

    expect(await feedPages(fetch, { maxResults: 200 }, byId)).toBe(refused);
  });
});

// ---------------------------------------------------------------------------

describe('the dumps feed query', () => {
  it('is nothing when no filter is given', () => {
    expect(dumpQueryOf({})).toBeUndefined();
    expect(dumpQueryOf({ user: '  ' })).toBeUndefined();
  });

  it('puts the user as equals and the rest as contains, in one and ( … )', () => {
    expect(
      dumpQueryOf({
        user: 'SAPUSER01',
        runtime_error: 'CONVT_NO_NUMBER',
        exception: 'CX_SY_CONVERSION',
        object_name: 'ZCL_PLACEHOLDER',
        package: 'ZPLACEHOLDER',
        component: 'BC-ABA',
      }),
    ).toBe(
      'and ( equals ( user , SAPUSER01 ) , contains ( runtimeError , CONVT_NO_NUMBER ) , ' +
        'contains ( exception , CX_SY_CONVERSION ) , contains ( objectName , ZCL_PLACEHOLDER ) , ' +
        'contains ( package , ZPLACEHOLDER ) , contains ( component , BC-ABA ) )',
    );
  });

  it('refuses a value that would end its operand', () => {
    expect(() => dumpQueryOf({ runtime_error: 'A B' })).toThrow(/blanks/);
    expect(() => dumpQueryOf({ package: 'A,B' })).toThrow(/commas/);
    expect(() => dumpQueryOf({ exception: 'A)' })).toThrow(/parentheses/);
  });
});

// ---------------------------------------------------------------------------

describe('RuntimeListFeeds — dumps', () => {
  beforeEach(() => {
    (AdtRuntimeClient as unknown as jest.Mock).mockClear();
  });

  it('sends the filters as one query, pages on, and gives each entry its dump_id', async () => {
    const dumpsMember = jest
      .fn()
      .mockResolvedValueOnce(page(0, 100, 'T1'))
      .mockResolvedValueOnce(page(100, 21, 'T2'));
    feeds = { dumps: dumpsMember };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'dumps',
      user: 'SAPUSER01',
      runtime_error: 'CONVT',
      max_results: 120,
      from: '20260901000000',
    });

    expect(result.isError).toBe(false);
    expect(dumpsMember).toHaveBeenNthCalledWith(1, {
      user: 'SAPUSER01',
      query:
        'and ( equals ( user , SAPUSER01 ) , contains ( runtimeError , CONVT ) )',
      from: '20260901000000',
      analyse: analyseException,
      maxResults: 100,
      to: undefined,
    });
    expect(dumpsMember.mock.calls[1][0]).toMatchObject({
      maxResults: 21,
      to: 'T1',
    });
    const answered = body(result);
    expect(answered.count).toBe(120);
    expect(answered.next_to).toBe('T2');
    expect(answered.entries[0]).toEqual({
      dump_id: 'ID0%20X',
      id: entryId(0),
    });
  });

  it('refuses a dumps filter on another feed rather than dropping it', async () => {
    feeds = { systemMessages: jest.fn() };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'system_messages',
      runtime_error: 'CONVT',
    });

    expect(result.isError).toBe(true);
    expect(feeds.systemMessages).not.toHaveBeenCalled();
  });

  it('refuses a value that would break the query, before any request', async () => {
    feeds = { dumps: jest.fn() };

    const result: any = await handleRuntimeListFeeds(context as any, {
      feed_type: 'dumps',
      object_name: 'A B',
    });

    expect(result.isError).toBe(true);
    expect(feeds.dumps).not.toHaveBeenCalled();
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
    expect(dumpIdFrom('/sap/bc/adt/vit/runtime/dumps/ID1%20X')).toBe('ID1%20X');
    expect(dumpIdFrom('/sap/bc/adt/runtime/dumps/ID1')).toBe('ID1');
    expect(dumpIdFrom(' ID1 ')).toBe('ID1');
    expect(dumpIdOf(entryId(7))).toBe(dumpIdFrom(entryId(7)));
  });

  it('summarises the root: runtime error, exception, program, time, user, termination', () => {
    expect(dumpSummaryOf(dumpXml)).toEqual({
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
    expect(dumpSummaryOf('plain formatted text')).toBeUndefined();
    expect(dumpSummaryOf('<html><body/></html>')).toBeUndefined();
  });

  it('reads the dump a URI names, and answers the summary alone when asked', async () => {
    const getById = jest.fn(async () => okResponse(dumpXml));
    dumps = { getById };

    const result: any = await handleRuntimeGetDumpById(context as any, {
      dump_id: entryId(1),
      response_mode: 'summary',
    });

    expect(getById).toHaveBeenCalledWith('ID1%20X', {
      analyse: analyseException,
      view: 'default',
    });
    const answered = body(result);
    expect(answered.summary.runtime_error).toBe('RAISE_SHORTDUMP');
    expect(answered.summary.termination.line).toBe(42);
    expect(answered.payload).toBeUndefined();
  });
});
