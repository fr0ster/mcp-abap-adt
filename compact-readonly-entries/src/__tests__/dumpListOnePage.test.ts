/**
 * `HandlerDumpList` reads one page per call (spec §4.6, the owner's rule:
 * compact is one ADT request per tool call; the consumer chains and pages).
 *
 * One `GET /sap/bc/adt/runtime/dumps` per call for any `top` up to 100 (the
 * measured cap), held open, answered with a document and answered `404`
 * alike; SAP's next link comes back as it came (`next_to`, the `to` of the
 * link); `top` 101 is refused before any request, naming the cap.
 *
 * Real adt-clients code runs over the batch proof's counting connection.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { defineTool, type HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { assertNoProperty } from '../../../src/__tests__/helpers/assertions';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { jsonAt, listedJson } from '../../../src/__tests__/helpers/listedJson';
import {
  TOOL_DEFINITION as FEEDS_TOOL,
  handleRuntimeListFeeds,
} from '../../../src/handlers/system/readonly/handleRuntimeListFeeds';
import { createBatchAvailability } from '../../../src/lib/batch/availability';
import {
  handleHandlerDumpList,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerDumpList';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: string[]; answer?: Answer };

async function runWith(
  mode: Mode,
  args: Record<string, unknown>,
  body?: string,
): Promise<Run> {
  const counting = countingConnection(mode, body);
  const context = {
    connection: counting.connection,
    logger: silent,
  } as unknown as HandlerContext;
  const pending = Promise.resolve(
    // Through its entry: the schema is the one check of a call.
    defineTool(TOOL_DEFINITION, handleHandlerDumpList).call(
      context,
      structuredClone(args),
    ),
  ) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...counting.sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent: counting.sent, answer };
}

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';
const jsonOf = (answer?: Answer) =>
  JSON.parse(textOf(answer)) as Record<string, unknown>;

const MODES: Mode[] = ['pending', 'document', 'not-found'];

const entry = (n: number, updated: string) =>
  `<atom:entry><atom:id>/sap/bc/adt/vit/runtime/dumps/ID${n}</atom:id><atom:title>t${n}</atom:title><atom:updated>${updated}</atom:updated></atom:entry>`;

/** A dumps feed of two entries whose head carries SAP's next link. */
const FEED = `<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:link href="/sap/bc/adt/runtime/dumps?$top=100&amp;to=20260930043748" rel="next"/>${entry(1, '2026-09-30T04:40:00Z')}${entry(2, '2026-09-30T04:37:48Z')}</atom:feed>`;
const FEED_END = FEED.replace(/<atom:link[^>]*rel="next"\/>/, '');

const IS_DUMPS = (line: string) =>
  line.startsWith('GET ') && line.includes('/sap/bc/adt/runtime/dumps');

describe('HandlerDumpList reads one page', () => {
  for (const top of [undefined, 1, 10, 100]) {
    it(format('exactly one request for top %s', top), async (t) => {
      const timer = t.mock.method(global, 'setTimeout');
      try {
        const args = top === undefined ? {} : { top };
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => runWith(mode, args, FEED)),
        );
        assert.equal(held.sent.length, 1);
        assert.equal(IS_DUMPS(held.sent[0] ?? ''), true);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);
        if (top !== undefined) {
          assert.ok(held.sent[0].includes(`%24top=${top}`));
        }
        assert.equal(timer.mock.callCount(), 0);

        assert.notEqual(documented.answer?.isError, true);
        // Terse, the default: the count as a `#` line.
        assert.ok(
          textOf(documented.answer).split('\n').includes('# count 2'),
          textOf(documented.answer),
        );

        assert.equal(refused.answer?.isError, true);
        assert.equal(jsonOf(refused.answer).status, 404);
        assert.equal(jsonOf(refused.answer).step, 'read dumps');
      } finally {
        timer.mock.restore();
      }
    });
  }

  it('top 101 is refused before any request, naming the cap', async () => {
    const { sent, answer } = await runWith('document', { top: 101 }, FEED);
    assert.deepStrictEqual(sent, []);
    assert.equal(answer?.isError, true);
    assert.ok(textOf(answer).includes('100'));
  });

  it('the next link is answered as SAP sent it', async () => {
    const { sent, answer } = await runWith('document', { top: 100 }, FEED);
    assert.equal(sent.length, 1);
    const lines = textOf(answer).split('\n');
    assert.ok(lines.includes('# next_to 20260930043748'), textOf(answer));
    assert.ok(lines.includes('# count 2'));
    assert.deepStrictEqual(
      lines
        .filter((line) => line.startsWith('ID'))
        .map((l) => l.split('\t')[0]),
      ['ID1', 'ID2'],
    );
    // At full: the JSON page, the link as it came.
    const full = jsonOf(
      (await runWith('document', { top: 100, detail: 'full' }, FEED)).answer,
    );
    assert.equal(full.next_to, '20260930043748');
    assert.deepStrictEqual(
      (full.entries as Array<{ dump_id: string }>).map((e) => e.dump_id),
      ['ID1', 'ID2'],
    );
  });

  it('a feed without a next link answers none', async () => {
    const { answer } = await runWith('document', {}, FEED_END);
    assert.equal(textOf(answer).includes('# next_to'), false, textOf(answer));
    assertNoProperty(
      jsonOf((await runWith('document', { detail: 'full' }, FEED_END)).answer),
      'next_to',
    );
  });

  // Compact parity: one page answers in RuntimeListFeeds' shape at each level.
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`a page answers as RuntimeListFeeds answers the dumps at detail ${detail}`, async () => {
      const compact = await runWith('document', { detail }, FEED_END);
      const counting = countingConnection('document', FEED_END);
      // The full tool's sequential path: one page, one request, as compact.
      const sequential = createBatchAvailability();
      sequential.noteOuterStatus(404);
      const full = (await defineTool(FEEDS_TOOL, handleRuntimeListFeeds).call(
        {
          connection: counting.connection,
          logger: silent,
          batchAvailability: sequential,
        } as never,
        { feed_type: 'dumps', detail },
      )) as Answer;
      // raw is what ADT sent: the page is one read, its document; the full
      // tool walks pages, so it answers the array of them — here one.
      if (detail === 'raw') {
        assert.equal(textOf(compact.answer), FEED_END);
        assert.equal(
          textOf(full),
          JSON.stringify([{ status: 200, body: textOf(compact.answer) }]),
        );
        return;
      }
      assert.equal(textOf(compact.answer), textOf(full));
    });
  }

  it('a given to reaches the one request', async () => {
    const { sent } = await runWith(
      'document',
      { top: 10, to: '20260930043748' },
      FEED,
    );
    assert.equal(sent.length, 1);
    assert.ok(sent[0].includes('to=20260930043748'));
  });

  it('the parameters say the next page starts at the boundary second, inclusive', () => {
    // The description states the function and the facts; the paging rule
    // and the bound of top are the parameters'.
    assert.ok(
      TOOL_DEFINITION.description.includes(
        'where the next read starts when more remain',
      ),
    );
    const schema = listedJson(TOOL_DEFINITION.inputSchema);
    assert.ok(jsonAt(schema, 'top').description?.includes('100'));
    assert.ok(
      jsonAt(schema, 'to').description?.includes('boundary second, inclusive'),
    );
  });
});
