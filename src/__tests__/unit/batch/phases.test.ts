/**
 * An internal batch phase (spec §11, the shared mechanism): `runPhase` records
 * `read(item, batch)` for every item on one `AdtBatchConnection` over the
 * call's connection, sends it in one envelope, and answers each item's
 * settlement in item order. A part's non-2xx is that item's failure; an
 * envelope that fails is every item's failure, the envelope's error as it
 * came; a credential refusal is rethrown, never a result.
 *
 * Real `AdtBatchConnection` (adt-clients 34.x); only the connection is a fake.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  LATE_RECORD_WORDS,
  MORE_ENVELOPES_WORDS,
  type PhaseRules,
  runPhase,
  runPhaseOutcome,
} from '../../../lib/batch/phases';
import { rejectionOf } from '../../helpers/assertions';
import {
  envelopeConnection,
  envelopeResponse,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const ITEMS = ['ITEM_A', 'ITEM_B', 'ITEM_C'] as const;

/** One GET per item, its answer's body the value. */
const read = async (item: string, batch: IAbapConnection) => {
  const response = await batch.makeAdtRequest({
    url: `/sap/bc/adt/probe/${item.toLowerCase()}`,
    method: 'GET',
    timeout: 0,
  });
  return String(response.data);
};

const contextOn = (connection: unknown): HandlerContext =>
  ({ connection, logger: undefined }) as unknown as HandlerContext;

describe('runPhase', () => {
  it('all items in one envelope; results in item order', async () => {
    const fake = envelopeConnection(
      partByPart((inner) => ({
        status: 200,
        statusText: 'OK',
        body: inner.url,
      })),
    );
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    assert.equal(fake.envelopes.length, 1);
    assert.equal(fake.envelopes[0]?.url, '/sap/bc/adt/communication/batch');
    assert.deepStrictEqual(
      fake.envelopes[0]?.parts.map((p) => p.url),
      [
        '/sap/bc/adt/probe/item_a',
        '/sap/bc/adt/probe/item_b',
        '/sap/bc/adt/probe/item_c',
      ],
    );
    assert.equal(fake.directs.length, 0);
    assert.deepStrictEqual(results, [
      { ok: true, value: '/sap/bc/adt/probe/item_a' },
      { ok: true, value: '/sap/bc/adt/probe/item_b' },
      { ok: true, value: '/sap/bc/adt/probe/item_c' },
    ]);
  });

  it("a part's 404 is that item's failure, the rest answer", async () => {
    const fake = envelopeConnection(
      partByPart((inner) =>
        inner.url.endsWith('item_b')
          ? { status: 404, statusText: 'Not Found', body: 'absent' }
          : { status: 200, statusText: 'OK', body: inner.url },
      ),
    );
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    assert.equal(fake.envelopes.length, 1);
    assert.deepStrictEqual(results[0], {
      ok: true,
      value: '/sap/bc/adt/probe/item_a',
    });
    assert.deepStrictEqual(results[2], {
      ok: true,
      value: '/sap/bc/adt/probe/item_c',
    });
    const failed = results[1];
    assert.equal(failed?.ok, false);
    assert.equal(
      (failed as { error: { response?: { status?: number } } }).error.response
        ?.status,
      404,
    );
  });

  it("an envelope failure is every item's, as it came", async () => {
    const thrown = statusError(500, 'Internal Server Error', 'placeholder');
    const fake = envelopeConnection(() => {
      throw thrown;
    });
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    assert.equal(fake.envelopes.length, 1);
    assert.equal(results.length, 3);
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.equal((result as { error: unknown }).error, thrown);
    }
  });

  it('a credential refusal rethrows', async () => {
    const refusal = new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
    const fake = envelopeConnection(() => {
      throw refusal;
    });
    assert.equal(
      await rejectionOf(
        withinTurns(runPhase(contextOn(fake.connection), ITEMS, read)),
      ),
      refusal,
    );
    assert.equal(fake.envelopes.length, 1);
  });

  describe('every read records before the envelope is sent', () => {
    const answered = () =>
      envelopeConnection(
        partByPart((inner) => ({
          status: 200,
          statusText: 'OK',
          body: inner.url,
        })),
      );
    const turn = () => new Promise((resolve) => setImmediate(resolve));

    it('a read that waits two event-loop turns before recording lands in the one envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          if (item === 'ITEM_B') {
            await turn();
            await turn();
          }
          return read(item, batch);
        }),
      );
      assert.equal(fake.envelopes.length, 1);
      assert.equal(fake.envelopes[0]?.parts.length, 3);
      assert.equal(
        results.every((r) => r.ok),
        true,
      );
    });

    it('a read that awaits real I/O before recording lands in the one envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          if (item === 'ITEM_C') await readFile(__filename);
          return read(item, batch);
        }),
        5_000,
      );
      assert.equal(fake.envelopes.length, 1);
      assert.deepStrictEqual(
        fake.envelopes[0]?.parts.map((p) => p.url),
        [
          '/sap/bc/adt/probe/item_a',
          '/sap/bc/adt/probe/item_b',
          '/sap/bc/adt/probe/item_c',
        ],
      );
      assert.equal(
        results.every((r) => r.ok),
        true,
      );
    });

    it('a read that settles without recording is its own answer; the others go in the envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) =>
          item === 'ITEM_A' ? 'nothing to read' : read(item, batch),
        ),
      );
      assert.deepStrictEqual(results[0], {
        ok: true,
        value: 'nothing to read',
      });
      assert.equal(fake.envelopes.length, 1);
      assert.equal(fake.envelopes[0]?.parts.length, 2);
    });

    it('no read records: nothing is sent', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async () => 'none'),
      );
      assert.equal(fake.envelopes.length, 0);
      assert.equal(
        results.every((r) => r.ok),
        true,
      );
    });

    it('a record made after the envelope was sent is rejected at once, not hung', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          const first = await read(item, batch);
          if (item !== 'ITEM_B') return first;
          // Needs the first answer: belongs in a later phase.
          return read(`${item}_AGAIN`, batch);
        }),
      );
      assert.equal(fake.envelopes.length, 1);
      assert.equal(results[0]?.ok, true);
      assert.equal(results[2]?.ok, true);
      const late = results[1] as { ok: false; error: Error };
      assert.equal(late.ok, false);
      assert.equal(late.error.message, LATE_RECORD_WORDS);
    });

    it('a phase that would send more than one envelope fails every item with the fixed error', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) =>
          item === 'ITEM_C'
            ? String(
                (
                  await batch.makeAdtRequest({
                    url: '/sap/bc/adt/probe/item_c?_action=LOCK',
                    method: 'POST',
                    timeout: 0,
                    headers: { 'X-sap-adt-sessiontype': 'stateful' },
                  })
                ).data,
              )
            : read(item, batch),
        ),
      );
      assert.equal(fake.envelopes.length, 1);
      assert.equal(results.length, 3);
      for (const result of results) {
        assert.equal(result.ok, false);
        assert.equal(
          (result as { error: Error }).error.message,
          MORE_ENVELOPES_WORDS,
        );
      }
    });
  });
});

/**
 * The phase policy over several envelopes (the consumer's bound): which
 * outcomes end a phase whatever `failuresEnd` says, and which only when it
 * is not `false`. These pin the behaviour `sendPlanned` must keep.
 */
describe('runPhaseOutcome: what ends a phase over several envelopes', () => {
  const FIVE = [0, 1, 2, 3, 4];

  /** A phase of five reads at bound 2 (envelopes of 2, 2, 1); `answer` per envelope, from 1. */
  const phaseOn = async (
    answer: (envelope: number) => 'ok' | (() => unknown),
    readOf: (item: number, c: IAbapConnection) => Promise<string> = async (
      item,
      c,
    ) =>
      String(
        (
          await c.makeAdtRequest({
            url: `/sap/bc/adt/x/${item}`,
            method: 'GET',
            timeout: 0,
          })
        ).data,
      ),
    rules?: PhaseRules<number, string>,
  ) => {
    let count = 0;
    const fake = envelopeConnection((parts) => {
      count += 1;
      const given = answer(count);
      if (given !== 'ok') throw given();
      return envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      );
    });
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      partsPerEnvelope: 2,
    };
    const outcome = await withinTurns(
      runPhaseOutcome(context, FIVE, readOf, rules),
      2000,
    );
    return { fake, outcome };
  };

  const failingFirst = (envelope: number) =>
    envelope === 1
      ? () => statusError(500, 'Internal Server Error')
      : ('ok' as const);

  it('a failed envelope ends the phase by default: no later envelope', async () => {
    const { fake, outcome } = await phaseOn(failingFirst);
    assert.equal(fake.envelopes.length, 1);
    assert.ok(outcome.results.every((r) => !r.ok));
  });

  it('with failuresEnd false a failed envelope ends nothing: the later envelopes are sent and answer', async () => {
    const { fake, outcome } = await phaseOn(failingFirst, undefined, {
      failuresEnd: false,
    });
    assert.equal(fake.envelopes.length, 3);
    assert.deepStrictEqual(
      outcome.results.map((r) => r.ok),
      [false, false, true, true, true],
    );
    assert.equal(outcome.envelope.failed, true);
  });

  it('with failuresEnd false a refused second envelope request still ends the phase', async () => {
    const { fake, outcome } = await phaseOn(
      () => 'ok',
      async (item, c) =>
        String(
          (
            await c.makeAdtRequest(
              item === 1
                ? {
                    url: '/sap/bc/adt/x/1?_action=LOCK',
                    method: 'POST',
                    timeout: 0,
                    headers: { 'X-sap-adt-sessiontype': 'stateful' },
                  }
                : { url: `/sap/bc/adt/x/${item}`, method: 'GET', timeout: 0 },
            )
          ).data,
        ),
      { failuresEnd: false },
    );
    assert.equal(fake.envelopes.length, 1);
    assert.equal(outcome.results.length, 5);
    for (const result of outcome.results) {
      assert.equal(result.ok, false);
      assert.equal(
        (result as { error: Error }).error.message,
        MORE_ENVELOPES_WORDS,
      );
    }
  });

  it('with failuresEnd false a settlement the failure reader knows still ends the phase', async () => {
    const refusal = new AuthRefusedError(
      authError['credential-refused']({ credential: 'token' }),
      'request',
    );
    const { fake, outcome } = await phaseOn(
      () => 'ok',
      async (item, c) => {
        const answered = await c.makeAdtRequest({
          url: `/sap/bc/adt/x/${item}`,
          method: 'GET',
          timeout: 0,
        });
        if (item === 0) throw refusal;
        return String(answered.data);
      },
      { failuresEnd: false },
    );
    assert.equal(fake.envelopes.length, 1);
    const last = outcome.results[4];
    assert.ok(last !== undefined && !last.ok && last.error === refusal);
  });
});

describe('runPhaseOutcome: an envelope failure the reads absorb, with failuresEnd false', () => {
  it('a credential refusal of the envelope that every read absorbs ends nothing: the later envelopes are sent', async () => {
    const refusal = new AuthRefusedError(
      authError['credential-refused']({ credential: 'token' }),
      'request',
    );
    let count = 0;
    const fake = envelopeConnection((parts) => {
      count += 1;
      if (count === 1) throw refusal;
      return envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      );
    });
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      partsPerEnvelope: 2,
    };
    const outcome = await withinTurns(
      runPhaseOutcome(
        context,
        [0, 1, 2, 3, 4],
        async (item, c) => {
          try {
            return String(
              (
                await c.makeAdtRequest({
                  url: `/sap/bc/adt/x/${item}`,
                  method: 'GET',
                  timeout: 0,
                })
              ).data,
            );
          } catch {
            return 'absorbed';
          }
        },
        { failuresEnd: false },
      ),
      2000,
    );
    assert.equal(fake.envelopes.length, 3);
    assert.deepStrictEqual(
      outcome.results.map((r) => (r.ok ? r.value : 'failed')),
      [
        'absorbed',
        'absorbed',
        '/sap/bc/adt/x/2',
        '/sap/bc/adt/x/3',
        '/sap/bc/adt/x/4',
      ],
    );
  });
});
