/**
 * `chunksOf`: a phase's independent reads in consecutive envelopes of at
 * most `size`, balanced, so no envelope carries a single read beside a
 * fuller one (301 reads are 151 and 150, never 300 and 1).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { chunksOf, READS_PER_ENVELOPE } from '../../../lib/batch/phases';
import { batchReader } from '../../../lib/strategies/packageWalk';
import {
  envelopeConnection,
  envelopeResponse,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const sizes = (n: number, size: number) =>
  chunksOf(
    Array.from({ length: n }, (_, i) => i),
    size,
  ).map((c) => c.length);

describe('chunksOf', () => {
  it('at most one chunk when everything fits', () => {
    assert.deepStrictEqual(sizes(0, 300), []);
    assert.deepStrictEqual(sizes(1, 300), [1]);
    assert.deepStrictEqual(sizes(300, 300), [300]);
  });

  it('past the bound: balanced chunks, none of one read', () => {
    assert.deepStrictEqual(sizes(301, 300), [151, 150]);
    assert.deepStrictEqual(sizes(601, 300), [201, 200, 200]);
    assert.deepStrictEqual(sizes(7, 3), [3, 2, 2]);
    for (let n = 2; n <= 1000; n++) {
      const chunks = sizes(n, READS_PER_ENVELOPE);
      assert.ok(chunks.every((c) => c >= 2 && c <= READS_PER_ENVELOPE));
      assert.equal(
        chunks.reduce((a, b) => a + b, 0),
        n,
      );
    }
  });

  it('keeps the order', () => {
    assert.deepStrictEqual(chunksOf([1, 2, 3, 4, 5, 6, 7], 3), [
      [1, 2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it(`batchReader: a level of more than ${READS_PER_ENVELOPE} reads in balanced envelopes, every item answered in order`, async () => {
    const fake = envelopeConnection((parts) =>
      envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      ),
    );
    const context = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
    } as unknown as HandlerContext;
    const read = batchReader(context, async (item: number, c) => {
      const answer = await c.makeAdtRequest({
        url: `/sap/bc/adt/x/${item}`,
        method: 'GET',
        // The contract's required field; the fake answers at once.
        timeout: 0,
      });
      return String(answer.data);
    });
    const items = Array.from({ length: READS_PER_ENVELOPE + 1 }, (_, i) => i);
    const results = await withinTurns(read(items), 2000);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [151, 150],
    );
    assert.deepStrictEqual(
      results.map((r) => (r.ok ? r.value : undefined)),
      items.map((i) => `/sap/bc/adt/x/${i}`),
    );
  });
});
