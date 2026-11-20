/**
 * Whether a destination has the communication batch (spec §11): learned only
 * from the outer envelope response. A `404` to the envelope request marks the
 * destination as having none — that call and later ones run sequentially — be
 * it rejected by the transport with `response` attached, or resolved by a
 * connection without a multipart body (seen by the forwarding connection under
 * the `AdtBatchConnection`, before the parser). An inner part's `404` is that
 * item's answer; any other envelope failure is that phase's failure: neither
 * is a verdict.
 *
 * Real `AdtBatchConnection` (adt-clients 34.x); only the connection is a fake.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { runPhase, withSequentialFallback } from '../../../lib/batch/phases';
import { assertMatchObject, rejectionOf } from '../../helpers/assertions';
import {
  type EnvelopeAnswer,
  envelopeConnection,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const ITEMS = ['ITEM_A', 'ITEM_B'] as const;

const urlOf = (item: string) => `/sap/bc/adt/probe/${item.toLowerCase()}`;

const get = async (item: string, connection: IAbapConnection) =>
  String(
    (
      await connection.makeAdtRequest({
        url: urlOf(item),
        method: 'GET',
        timeout: 0,
      })
    ).data,
  );

/** Every request outside an envelope: `200`, its URL as the body. */
const direct = async (
  request: IAbapRequestOptions,
): Promise<IAdtWireResponse> =>
  ({
    status: 200,
    statusText: 'OK',
    headers: {},
    data: `direct ${request.url}`,
  }) as IAdtWireResponse;

/**
 * A tool's read: batched (one phase, each item's value or `failed`), or the
 * sequential version (one direct GET per item); which ran is answered.
 */
async function toolRead(
  context: HandlerContext,
): Promise<{ ran: 'batched' | 'sequential'; values: string[] }> {
  return withSequentialFallback<{
    ran: 'batched' | 'sequential';
    values: string[];
  }>(
    context,
    async () => ({
      ran: 'batched' as const,
      values: (await runPhase(context, ITEMS, get)).map((r) =>
        r.ok ? r.value : 'failed',
      ),
    }),
    async () => {
      const values: string[] = [];
      for (const item of ITEMS)
        values.push(await get(item, context.connection));
      return { ran: 'sequential' as const, values };
    },
  );
}

function standOn(answer: EnvelopeAnswer) {
  const fake = envelopeConnection(answer, direct);
  const availability = createBatchAvailability();
  const context = {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: availability,
  } as unknown as HandlerContext;
  return { fake, availability, context };
}

const SEQUENTIAL = {
  ran: 'sequential',
  values: ITEMS.map((item) => `direct ${urlOf(item)}`),
};

describe('batch availability', () => {
  it('an outer 404 the transport rejects (with response) marks the destination; that call and later ones run sequentially', async () => {
    const s = standOn(() => {
      throw statusError(404, 'Not Found');
    });

    assert.deepStrictEqual(await withinTurns(toolRead(s.context)), SEQUENTIAL);
    assert.equal(s.fake.envelopes.length, 1);
    assert.equal(s.availability.available(), false);

    assert.deepStrictEqual(await withinTurns(toolRead(s.context)), SEQUENTIAL);
    // No envelope for the later call: only its direct reads.
    assert.equal(s.fake.envelopes.length, 1);
    assert.deepStrictEqual(
      s.fake.directs.map((r) => r.url),
      [...ITEMS.map(urlOf), ...ITEMS.map(urlOf)],
    );
  });

  it('an outer 404 a connection resolves without a multipart body marks it (via the forwarding connection under the batch)', async () => {
    const s = standOn(
      () =>
        ({
          status: 404,
          statusText: 'Not Found',
          headers: {},
          data: '',
        }) as IAdtWireResponse,
    );

    assert.deepStrictEqual(await withinTurns(toolRead(s.context)), SEQUENTIAL);
    assert.equal(s.fake.envelopes.length, 1);
    assert.equal(s.availability.available(), false);

    assert.deepStrictEqual(await withinTurns(toolRead(s.context)), SEQUENTIAL);
    assert.equal(s.fake.envelopes.length, 1);
  });

  it("an inner part's 404 leaves batching on", async () => {
    const s = standOn(
      partByPart((inner) =>
        inner.url.endsWith('item_a')
          ? { status: 404, statusText: 'Not Found', body: 'absent' }
          : { status: 200, statusText: 'OK', body: inner.url },
      ),
    );

    assert.deepStrictEqual(await withinTurns(toolRead(s.context)), {
      ran: 'batched',
      values: ['failed', urlOf('ITEM_B')],
    });
    assert.equal(s.availability.available(), true);

    await withinTurns(toolRead(s.context));
    assert.equal(s.fake.envelopes.length, 2);
    assert.equal(s.fake.directs.length, 0);
  });

  it('any other envelope failure is not a verdict', async () => {
    let answered = 0;
    // A 500 the transport rejects, then a 503 a connection resolves with no
    // multipart body (the parser's own error), then a 403 rejected.
    const s = standOn(() => {
      answered += 1;
      if (answered === 1) throw statusError(500, 'Internal Server Error');
      if (answered === 2) {
        return {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {},
          data: '',
        } as IAdtWireResponse;
      }
      throw statusError(403, 'Forbidden');
    });

    for (let call = 1; call <= 3; call++) {
      assert.deepStrictEqual(await withinTurns(toolRead(s.context)), {
        ran: 'batched',
        values: ['failed', 'failed'],
      });
      assert.equal(s.availability.available(), true);
      assert.equal(s.fake.envelopes.length, call);
    }
    assert.equal(s.fake.directs.length, 0);
  });

  describe('the first outer status decides', () => {
    it("2xx first: a later outer 404 is that phase's envelope failure, batching stays on", async () => {
      let answered = 0;
      const s = standOn((parts) => {
        answered += 1;
        if (answered === 1) {
          return partByPart((inner) => ({
            status: 200,
            statusText: 'OK',
            body: inner.url,
          }))(parts, undefined as never);
        }
        throw statusError(404, 'Not Found');
      });

      assert.equal((await withinTurns(toolRead(s.context))).ran, 'batched');
      assert.equal(s.availability.available(), true);

      assert.deepStrictEqual(await withinTurns(toolRead(s.context)), {
        ran: 'batched',
        values: ['failed', 'failed'],
      });
      assert.equal(s.availability.available(), true);
      assert.equal(s.fake.directs.length, 0);

      // Still batching: the next call sends its envelope.
      await withinTurns(toolRead(s.context));
      assert.equal(s.fake.envelopes.length, 3);
    });

    it('404 first: a later 2xx envelope does not turn batching back on', async () => {
      let answered = 0;
      const s = standOn((parts) => {
        answered += 1;
        if (answered === 1) throw statusError(404, 'Not Found');
        return partByPart((inner) => ({
          status: 200,
          statusText: 'OK',
          body: inner.url,
        }))(parts, undefined as never);
      });

      assertMatchObject(
        await rejectionOf(withinTurns(runPhase(s.context, ITEMS, get))),
        { response: { status: 404 } },
      );
      assert.equal(s.availability.available(), false);

      const later = await withinTurns(runPhase(s.context, ITEMS, get));
      assert.equal(
        later.every((r) => r.ok),
        true,
      );
      assert.equal(s.availability.available(), false);
      assert.deepStrictEqual(
        await withinTurns(toolRead(s.context)),
        SEQUENTIAL,
      );
      assert.equal(s.fake.envelopes.length, 2);
    });

    it('a status that is neither decides nothing; the first 2xx or 404 after it does', () => {
      const served = createBatchAvailability();
      served.noteOuterStatus(500);
      served.noteOuterStatus(200);
      served.noteOuterStatus(404);
      assert.equal(served.available(), true);

      const absent = createBatchAvailability();
      absent.noteOuterStatus(503);
      absent.noteOuterStatus(404);
      absent.noteOuterStatus(204);
      assert.equal(absent.available(), false);
    });
  });
});
