/**
 * `chunksOf` / `envelopesOf`: a phase's independent reads in envelopes. No
 * bound is the server's own: with none given every read goes in one
 * envelope; with the consumer's bound (`readsPerEnvelope`) in consecutive
 * envelopes of at most that many, balanced, so no envelope carries a single
 * read beside a fuller one (301 reads at 300 are 151 and 150, never 300
 * and 1).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  chunksOf,
  envelopesOf,
  readsPerEnvelopeOf,
} from '../../../lib/batch/phases';
import {
  BATCH_READS_PER_ENVELOPE_ROW,
  ParameterRefusal,
  readParameters,
} from '../../../lib/config';
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

/** The consumer's bound the tests below set. */
const BOUND = 300;

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('chunksOf', () => {
  it('no bound: every item in one chunk, none for no item', () => {
    assert.deepStrictEqual(
      chunksOf(numbers(0), undefined).map((c) => c.length),
      [],
    );
    assert.deepStrictEqual(
      chunksOf(numbers(302), undefined).map((c) => c.length),
      [302],
    );
    assert.deepStrictEqual(
      chunksOf(numbers(5000), undefined).map((c) => c.length),
      [5000],
    );
  });

  it('at most one chunk when everything fits', () => {
    assert.deepStrictEqual(sizes(0, BOUND), []);
    assert.deepStrictEqual(sizes(1, BOUND), [1]);
    assert.deepStrictEqual(sizes(300, BOUND), [300]);
  });

  it('past the bound: balanced chunks, none of one read', () => {
    assert.deepStrictEqual(sizes(301, BOUND), [151, 150]);
    assert.deepStrictEqual(sizes(302, BOUND), [151, 151]);
    assert.deepStrictEqual(sizes(601, BOUND), [201, 200, 200]);
    assert.deepStrictEqual(sizes(7, 3), [3, 2, 2]);
    for (let n = 2; n <= 1000; n++) {
      const chunks = sizes(n, BOUND);
      assert.ok(chunks.every((c) => c >= 2 && c <= BOUND));
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
});

describe('envelopesOf', () => {
  const contextWith = (readsPerEnvelope?: number) =>
    ({
      connection: undefined,
      ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
    }) as unknown as HandlerContext;

  it('no bound in the context: 302 reads in one envelope', () => {
    assert.deepStrictEqual(
      envelopesOf(contextWith(), numbers(302)).map((c) => c.length),
      [302],
    );
  });

  it("the context's bound of 300: 302 reads in 151 and 151", () => {
    assert.deepStrictEqual(
      envelopesOf(contextWith(BOUND), numbers(302)).map((c) => c.length),
      [151, 151],
    );
  });
});

describe('the consumer’s bound', () => {
  const read = (argv: string[], env: NodeJS.ProcessEnv = {}) =>
    readParameters(
      {
        program: 'reads-per-envelope',
        rows: [BATCH_READS_PER_ENVELOPE_ROW],
        removed: [],
      },
      argv,
      env,
      undefined,
    ).batchReadsPerEnvelope;

  it('not given: no bound, and no default', () => {
    assert.equal(read([]), undefined);
    assert.equal(BATCH_READS_PER_ENVELOPE_ROW.default, undefined);
  });

  it('a whole number from 2 is read, from the CLI and the environment', () => {
    assert.equal(read(['--batch-reads-per-envelope=300']), 300);
    assert.equal(read(['--batch-reads-per-envelope=2']), 2);
    assert.equal(read([], { MCP_BATCH_READS_PER_ENVELOPE: '150' }), 150);
  });

  for (const value of ['1', '0', '-3', 'abc', '2.5', '1e3', 'x300']) {
    it(`"${value}" is refused, the value not echoed`, () => {
      assert.throws(
        () => read([`--batch-reads-per-envelope=${value}`]),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid --batch-reads-per-envelope: must be a whole number of reads from 2',
      );
    });
  }

  it("an embedder's option: a whole number from 2, else refused", () => {
    assert.equal(readsPerEnvelopeOf(2, 'readsPerEnvelope'), 2);
    for (const value of [1, 0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => readsPerEnvelopeOf(value, 'readsPerEnvelope'),
        /Invalid readsPerEnvelope: must be a whole number of reads from 2/,
      );
    }
  });
});

describe('batchReader', () => {
  const readerOn = (readsPerEnvelope?: number) => {
    const fake = envelopeConnection((parts) =>
      envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      ),
    );
    const context = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
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
    return { fake, read };
  };

  it('no bound given: a level of 302 reads in one envelope', async () => {
    const { fake, read } = readerOn();
    const items = numbers(302);
    const results = await withinTurns(read(items), 2000);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [302],
    );
    assert.equal(results.length, 302);
  });

  it(`the consumer's bound of ${BOUND}: a level of 302 reads in balanced envelopes, every item answered in order`, async () => {
    const { fake, read } = readerOn(BOUND);
    const items = numbers(302);
    const results = await withinTurns(read(items), 2000);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [151, 151],
    );
    assert.deepStrictEqual(
      results.map((r) => (r.ok ? r.value : undefined)),
      items.map((i) => `/sap/bc/adt/x/${i}`),
    );
  });
});
