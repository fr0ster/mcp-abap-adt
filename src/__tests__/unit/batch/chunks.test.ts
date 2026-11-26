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
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  chunksOf,
  envelopesOf,
  readsPerEnvelopeOf,
  runPhaseOutcome,
} from '../../../lib/batch/phases';
import {
  BATCH_READS_PER_ENVELOPE_ROW,
  ParameterRefusal,
  readParameters,
  type YamlConfig,
} from '../../../lib/config';
import { batchReader } from '../../../lib/strategies/packageWalk';
import {
  envelopeConnection,
  envelopeResponse,
  statusError,
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
  const contextWith = (readsPerEnvelope?: number): HandlerContext => ({
    connection: envelopeConnection(() => envelopeResponse([])).connection,
    ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
  });

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
  const read = (
    argv: string[],
    env: NodeJS.ProcessEnv = {},
    yaml: YamlConfig | null = null,
  ) =>
    readParameters(
      {
        program: 'reads-per-envelope',
        rows: [BATCH_READS_PER_ENVELOPE_ROW],
        removed: [],
      },
      argv,
      env,
      yaml,
    ).batchReadsPerEnvelope;

  it('YAML batch.readsPerEnvelope: an integer or digits are read; null and blank are not given', () => {
    assert.equal(read([], {}, { batch: { readsPerEnvelope: 300 } }), 300);
    assert.equal(read([], {}, { batch: { readsPerEnvelope: '40' } }), 40);
    assert.equal(
      read([], {}, { batch: { readsPerEnvelope: null } }),
      undefined,
    );
    assert.equal(read([], {}, { batch: { readsPerEnvelope: '' } }), undefined);
    assert.equal(read([], { MCP_BATCH_READS_PER_ENVELOPE: '' }), undefined);
  });

  for (const value of [1, 1.5, true, 'x', [300], { n: 300 }]) {
    it(`YAML ${JSON.stringify(value)} is refused`, () => {
      assert.throws(
        () => read([], {}, { batch: { readsPerEnvelope: value } }),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid batch.readsPerEnvelope (config file): must be a whole number of reads from 2',
      );
    });
  }

  it('the CLI beats the environment, which beats YAML', () => {
    const yaml = { batch: { readsPerEnvelope: 30 } };
    const env = { MCP_BATCH_READS_PER_ENVELOPE: '20' };
    assert.equal(read(['--batch-reads-per-envelope=10'], env, yaml), 10);
    assert.equal(read([], env, yaml), 20);
    assert.equal(read([], {}, yaml), 30);
  });

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
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid readsPerEnvelope: must be a whole number of reads from 2',
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
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
    };
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

describe('runPhaseOutcome: the bound is applied to every phase', () => {
  /** A phase of `n` reads on a fake; `fail(envelope)` makes that envelope (from 1) fail. */
  const phaseOn = async (
    n: number,
    readsPerEnvelope: number | undefined,
    fail?: { envelope: number; with: () => unknown },
  ) => {
    let count = 0;
    const fake = envelopeConnection((parts) => {
      count += 1;
      if (fail !== undefined && count === fail.envelope) throw fail.with();
      return envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      );
    });
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
    };
    const outcome = await withinTurns(
      runPhaseOutcome(context, numbers(n), async (item, c) => {
        const answer = await c.makeAdtRequest({
          url: `/sap/bc/adt/x/${item}`,
          method: 'GET',
          timeout: 0,
        });
        return String(answer.data);
      }),
      2000,
    );
    return { fake, outcome };
  };

  it('no bound: three reads in one envelope', async () => {
    const { fake } = await phaseOn(3, undefined);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [3],
    );
  });

  it('bound 2: three reads in envelopes of 2 and 1, answered in item order', async () => {
    const { fake, outcome } = await phaseOn(3, 2);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [2, 1],
    );
    assert.deepStrictEqual(
      outcome.results.map((r) => (r.ok ? r.value : undefined)),
      ['/sap/bc/adt/x/0', '/sap/bc/adt/x/1', '/sap/bc/adt/x/2'],
    );
    assert.equal(outcome.envelope.failed, false);
  });

  it('bound 2: a failed first envelope ends the phase — no later envelope, every item its failure', async () => {
    const failure = statusError(500, 'Internal Server Error');
    const { fake, outcome } = await phaseOn(5, 2, {
      envelope: 1,
      with: () => failure,
    });
    assert.equal(fake.envelopes.length, 1);
    assert.equal(outcome.results.length, 5);
    assert.ok(outcome.results.every((r) => !r.ok));
    assert.equal(outcome.envelope.failed, true);
  });

  it('bound 2: a credential refusal ends the phase — no later envelope, the later items settle with it', async () => {
    const refusal = new AuthRefusedError(
      authError['credential-refused']({ credential: 'token' }),
      'request',
    );
    const { fake, outcome } = await phaseOn(5, 2, {
      envelope: 1,
      with: () => refusal,
    });
    assert.equal(fake.envelopes.length, 1);
    assert.equal(outcome.results.length, 5);
    const last = outcome.results[4];
    assert.ok(last !== undefined && !last.ok && last.error === refusal);
  });

  it('bound 2: a part SAP answered 401 ends the phase — no later envelope', async () => {
    const fake = envelopeConnection((parts) =>
      envelopeResponse(
        parts.map((p) =>
          p.url.endsWith('/x/1')
            ? { status: 401, statusText: 'Unauthorized', body: '' }
            : { status: 200, statusText: 'OK', body: p.url },
        ),
      ),
    );
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      readsPerEnvelope: 2,
    };
    const outcome = await withinTurns(
      runPhaseOutcome(context, numbers(5), async (item, c) => {
        const answer = await c.makeAdtRequest({
          url: `/sap/bc/adt/x/${item}`,
          method: 'GET',
          timeout: 0,
        });
        return String(answer.data);
      }),
      2000,
    );
    assert.equal(fake.envelopes.length, 1);
    assert.deepStrictEqual(
      outcome.results.map((r) => r.ok),
      [true, false, false, false, false],
    );
  });

  it('bound 2: a failure in a later envelope keeps the earlier answers', async () => {
    const { fake, outcome } = await phaseOn(5, 2, {
      envelope: 2,
      with: () => statusError(500, 'Internal Server Error'),
    });
    assert.equal(fake.envelopes.length, 2);
    assert.deepStrictEqual(
      outcome.results.map((r) => r.ok),
      [true, true, false, false, false],
    );
  });
});
