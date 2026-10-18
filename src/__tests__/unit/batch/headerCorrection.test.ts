/**
 * The format correction of an internal batch phase (`runPhase`): right after
 * the phase's envelope answered, the parts SAP answered `406`/`415` go in one
 * envelope of their own, each recorded again by the same member call
 * (`withAdtHeaders`) with the corrected pair; the corrected pair is kept for
 * the system, the same pairs the calls outside a batch take.
 *
 * Real `AdtBatchConnection` and real adt-clients members (`getWhereUsed`);
 * only the connection is a fake, answering every request — an envelope's
 * part or a request outside a batch — from one model of SAP.
 */
import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  AdtHeaderPairs,
  type AdtHeaderPort,
} from '../../../lib/adtHeaders/AdtHeaderPairs';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { runPhase } from '../../../lib/batch/phases';
import {
  envelopeConnection,
  type PartAnswer,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const OP = 'utils.getWhereUsed';
const DEFAULT = DEFAULT_ADT_HEADERS[OP];
const NEWER =
  'application/vnd.sap.adt.repository.usagereferences.result.v2+xml';
const NEWER_BODY =
  'application/vnd.sap.adt.repository.usagereferences.request.v2+xml';
const ITEMS = ['ITEM_A', 'ITEM_B', 'ITEM_C'] as const;

const notAcceptable = (types: string): PartAnswer => ({
  status: 406,
  statusText: 'Not Acceptable',
  body: `<exc:exception><message>The message content is not acceptable. Accepted content types: ${types}</message></exc:exception>`,
});

/** What a model of SAP answers a where-used request of `item`. */
type Sap = (
  item: string,
  accept: string | undefined,
  contentType: string | undefined,
) => PartAnswer;

/** `item_b` serves only `NEWER` as the Accept; every other item any. */
const acceptsNewer: Sap = (item, accept) =>
  item === 'item_b' && accept !== NEWER
    ? notAcceptable(NEWER)
    : { status: 200, statusText: 'OK', body: `references of ${item}` };

const headerOf = (
  headers: Record<string, unknown> | undefined,
  name: string,
) => {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return String(value);
  }
  return undefined;
};

/** The item a where-used request names (its object URI). */
const itemOf = (url: string) =>
  ITEMS.find((item) =>
    decodeURIComponent(url).toLowerCase().endsWith(item.toLowerCase()),
  )?.toLowerCase() ?? '';

function system(sap: Sap) {
  return envelopeConnection(
    partByPart((inner) =>
      sap(
        itemOf(inner.url),
        inner.headers.accept,
        inner.headers['content-type'],
      ),
    ),
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const headers = request.headers as Record<string, unknown>;
      const answer = sap(
        itemOf(request.url),
        headerOf(headers, 'accept'),
        headerOf(headers, 'content-type'),
      );
      if (answer.status >= 400) {
        throw statusError(
          answer.status,
          answer.statusText ?? '',
          answer.body ?? '',
          answer.headers ?? {},
        );
      }
      return {
        status: answer.status,
        statusText: answer.statusText ?? 'OK',
        headers: answer.headers ?? {},
        data: answer.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

type Fake = ReturnType<typeof system>;

const contextOn = (fake: Fake, port: AdtHeaderPort): HandlerContext =>
  ({
    connection: fake.connection,
    logger: undefined,
    adtHeaders: port,
  }) as unknown as HandlerContext;

/** One item's where-used, through the wrapper, on `connection`. */
const whereUsed =
  (context: HandlerContext) =>
  async (item: string, connection: IAbapConnection) => {
    const answer = await withAdtHeaders(context, OP, (headers) =>
      new AdtClient(connection)
        .getUtils()
        .getWhereUsed({ object_name: item, object_type: 'class' }, { headers }),
    );
    return answer.ok
      ? { ok: true, raw: answer.getResult().value }
      : {
          ok: false,
          status: answer.getError().response?.status,
          data: answer.getError().response?.data,
        };
  };

const envelopeParts = (fake: Fake) =>
  fake.envelopes.map((e) =>
    e.parts.map((p) => [
      itemOf(p.url),
      p.headers.accept,
      p.headers['content-type'],
    ]),
  );

const phase = (fake: Fake, port: AdtHeaderPort) => {
  const context = contextOn(fake, port);
  return withinTurns(runPhase(context, ITEMS, whereUsed(context)));
};

describe('the format correction of an internal batch phase', () => {
  it('only the 406 part is recorded again, by its member with the corrected Accept, in one envelope', async () => {
    const fake = system(acceptsNewer);
    const port = new AdtHeaderPairs().forSystem('S1');
    const results = await phase(fake, port);

    expect(envelopeParts(fake)).toEqual([
      [
        ['item_a', DEFAULT.accept, DEFAULT.contentType],
        ['item_b', DEFAULT.accept, DEFAULT.contentType],
        ['item_c', DEFAULT.accept, DEFAULT.contentType],
      ],
      [['item_b', NEWER, DEFAULT.contentType]],
    ]);
    expect(fake.directs).toHaveLength(0);
    expect(results.map((r) => r.ok && r.value.ok)).toEqual([true, true, true]);
  });

  it('the answers equal the sequential answers for the same SAP', async () => {
    const batched = system(acceptsNewer);
    const results = await phase(batched, new AdtHeaderPairs().forSystem('S1'));

    const sequential = system(acceptsNewer);
    const context = contextOn(sequential, new AdtHeaderPairs().forSystem('S1'));
    const values: unknown[] = [];
    for (const item of ITEMS) {
      values.push(
        await whereUsed(context)(
          item,
          sequential.connection as unknown as IAbapConnection,
        ),
      );
    }
    expect(results).toEqual(values.map((value) => ({ ok: true, value })));
  });

  it('the corrected pair is kept for the system; a later phase sends it directly', async () => {
    const fake = system(acceptsNewer);
    const port = new AdtHeaderPairs().forSystem('S1');
    await phase(fake, port);
    expect(port.pairFor(OP)).toEqual({
      accept: NEWER,
      contentType: DEFAULT.contentType,
    });

    await phase(fake, port);
    expect(envelopeParts(fake).slice(2)).toEqual([
      [
        ['item_a', NEWER, DEFAULT.contentType],
        ['item_b', NEWER, DEFAULT.contentType],
        ['item_c', NEWER, DEFAULT.contentType],
      ],
    ]);
  });

  it('a pair corrected outside a batch is sent by a batched part, and one corrected in a batch outside it', async () => {
    const first = system(acceptsNewer);
    const port = new AdtHeaderPairs().forSystem('S1');
    await whereUsed(contextOn(first, port))(
      'ITEM_B',
      first.connection as unknown as IAbapConnection,
    );
    expect(
      first.directs.map((r) => headerOf(r.headers as never, 'accept')),
    ).toEqual([DEFAULT.accept, NEWER]);
    await phase(first, port);
    expect(envelopeParts(first)).toEqual([
      [
        ['item_a', NEWER, DEFAULT.contentType],
        ['item_b', NEWER, DEFAULT.contentType],
        ['item_c', NEWER, DEFAULT.contentType],
      ],
    ]);

    const second = system(acceptsNewer);
    const other = new AdtHeaderPairs().forSystem('S1');
    await phase(second, other);
    await whereUsed(contextOn(second, other))(
      'ITEM_B',
      second.connection as unknown as IAbapConnection,
    );
    expect(
      second.directs.map((r) => headerOf(r.headers as never, 'accept')),
    ).toEqual([NEWER]);
  });

  it('a 415 part is recorded again with the Content-Type it names', async () => {
    const fake = system((item, accept, contentType) =>
      item === 'item_b' && contentType !== NEWER_BODY
        ? {
            status: 415,
            statusText: 'Unsupported Media Type',
            headers: { 'content-type': NEWER_BODY },
          }
        : { status: 200, statusText: 'OK', body: `${item} as ${accept}` },
    );
    const port = new AdtHeaderPairs().forSystem('S1');
    const results = await phase(fake, port);
    expect(envelopeParts(fake)[1]).toEqual([
      ['item_b', DEFAULT.accept, NEWER_BODY],
    ]);
    expect(results.map((r) => r.ok && r.value.ok)).toEqual([true, true, true]);
    expect(port.pairFor(OP)).toEqual({
      accept: DEFAULT.accept,
      contentType: NEWER_BODY,
    });
  });

  it('a 406 naming no type is the part’s answer: no correction envelope, nothing kept', async () => {
    const fake = system((item, accept) =>
      item === 'item_b'
        ? notAcceptable('')
        : { status: 200, statusText: 'OK', body: `${item} as ${accept}` },
    );
    const port = new AdtHeaderPairs().forSystem('S1');
    const results = await phase(fake, port);
    expect(fake.envelopes).toHaveLength(1);
    expect(results[1]).toEqual({
      ok: true,
      value: expect.objectContaining({ ok: false, status: 406 }),
    });
    expect(port.pairFor(OP)).toEqual(DEFAULT);
  });

  it('the correction envelope’s answer is the call’s answer, a second 406 included: one round', async () => {
    const fake = system((item, accept) =>
      item === 'item_b'
        ? {
            ...notAcceptable(accept === NEWER ? 'application/xml' : NEWER),
          }
        : { status: 200, statusText: 'OK', body: item },
    );
    const results = await phase(fake, new AdtHeaderPairs().forSystem('S1'));
    expect(fake.envelopes).toHaveLength(2);
    const second = results[1] as {
      ok: true;
      value: { ok: boolean; status?: number; data?: string };
    };
    expect(second.value.ok).toBe(false);
    expect(second.value.status).toBe(406);
    // The correction's answer, not the first one.
    expect(second.value.data).toContain('application/xml');
  });
});
