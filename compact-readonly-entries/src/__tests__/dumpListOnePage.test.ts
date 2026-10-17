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
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
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
    handleHandlerDumpList(context, structuredClone(args) as never),
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
  it.each([
    undefined,
    1,
    10,
    100,
  ])('exactly one request for top %s', async (top) => {
    const timer = jest.spyOn(global, 'setTimeout');
    try {
      const args = top === undefined ? {} : { top };
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => runWith(mode, args, FEED)),
      );
      expect(held.sent).toHaveLength(1);
      expect(IS_DUMPS(held.sent[0] ?? '')).toBe(true);
      expect(documented.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);
      if (top !== undefined) {
        expect(held.sent[0]).toContain(`%24top=${top}`);
      }
      expect(timer).not.toHaveBeenCalled();

      expect(documented.answer?.isError).not.toBe(true);
      expect(jsonOf(documented.answer).count).toBe(2);

      expect(refused.answer?.isError).toBe(true);
      expect(jsonOf(refused.answer).status).toBe(404);
      expect(jsonOf(refused.answer).step).toBe('read dumps');
    } finally {
      timer.mockRestore();
    }
  });

  it('top 101 is refused before any request, naming the cap', async () => {
    const { sent, answer } = await runWith('document', { top: 101 }, FEED);
    expect(sent).toEqual([]);
    expect(answer?.isError).toBe(true);
    expect(textOf(answer)).toContain('100');
  });

  it('the next link is answered as SAP sent it', async () => {
    const { sent, answer } = await runWith('document', { top: 100 }, FEED);
    expect(sent).toHaveLength(1);
    const answered = jsonOf(answer);
    expect(answered.next_to).toBe('20260930043748');
    expect(answered.count).toBe(2);
    expect(
      (answered.entries as Array<{ dump_id: string }>).map((e) => e.dump_id),
    ).toEqual(['ID1', 'ID2']);
  });

  it('a feed without a next link answers none', async () => {
    const { answer } = await runWith('document', {}, FEED_END);
    expect(jsonOf(answer)).not.toHaveProperty('next_to');
  });

  it('a given to reaches the one request', async () => {
    const { sent } = await runWith(
      'document',
      { top: 10, to: '20260930043748' },
      FEED,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('to=20260930043748');
  });

  it('the description says the next page starts at the boundary second, inclusive', () => {
    expect(TOOL_DEFINITION.description).toContain(
      "The next link's page starts at the boundary second, inclusive: entries of that second may repeat; match them by dump_id.",
    );
    expect(TOOL_DEFINITION.description).toMatch(/\b100\b/);
    const props = TOOL_DEFINITION.inputSchema.properties;
    expect(props.top.description).toContain('100');
    expect(props.to.description).toContain('boundary second, inclusive');
  });
});
