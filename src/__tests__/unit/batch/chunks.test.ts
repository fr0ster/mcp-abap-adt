/**
 * `chunksOf` / `envelopesOf`: a phase's independent reads in envelopes. No
 * bound is the server's own: with none given every read goes in one
 * envelope; with the consumer's bound (`partsPerEnvelope`) in consecutive
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
  partsPerEnvelopeOf,
  runPhaseOutcome,
} from '../../../lib/batch/phases';
import {
  BATCH_PARTS_PER_ENVELOPE_ROW,
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
  const contextWith = (partsPerEnvelope?: number): HandlerContext => ({
    connection: envelopeConnection(() => envelopeResponse([])).connection,
    ...(partsPerEnvelope !== undefined && { partsPerEnvelope }),
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
        program: 'parts-per-envelope',
        rows: [BATCH_PARTS_PER_ENVELOPE_ROW],
        removed: [],
      },
      argv,
      env,
      yaml,
    ).batchPartsPerEnvelope;

  it('YAML batch.partsPerEnvelope: an integer or digits are read; null and blank are not given', () => {
    assert.equal(read([], {}, { batch: { partsPerEnvelope: 300 } }), 300);
    assert.equal(read([], {}, { batch: { partsPerEnvelope: '40' } }), 40);
    assert.equal(
      read([], {}, { batch: { partsPerEnvelope: null } }),
      undefined,
    );
    assert.equal(read([], {}, { batch: { partsPerEnvelope: '' } }), undefined);
    assert.equal(read([], { MCP_BATCH_PARTS_PER_ENVELOPE: '' }), undefined);
  });

  for (const value of [1, 1.5, true, 'x', [300], { n: 300 }]) {
    it(`YAML ${JSON.stringify(value)} is refused`, () => {
      assert.throws(
        () => read([], {}, { batch: { partsPerEnvelope: value } }),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid batch.partsPerEnvelope (config file): must be a whole number of parts from 2',
      );
    });
  }

  it('the CLI beats the environment, which beats YAML', () => {
    const yaml = { batch: { partsPerEnvelope: 30 } };
    const env = { MCP_BATCH_PARTS_PER_ENVELOPE: '20' };
    assert.equal(read(['--batch-parts-per-envelope=10'], env, yaml), 10);
    assert.equal(read([], env, yaml), 20);
    assert.equal(read([], {}, yaml), 30);
  });

  it('not given: no bound, and no default', () => {
    assert.equal(read([]), undefined);
    assert.equal(BATCH_PARTS_PER_ENVELOPE_ROW.default, undefined);
  });

  it('a whole number from 2 is read, from the CLI and the environment', () => {
    assert.equal(read(['--batch-parts-per-envelope=300']), 300);
    assert.equal(read(['--batch-parts-per-envelope=2']), 2);
    assert.equal(read([], { MCP_BATCH_PARTS_PER_ENVELOPE: '150' }), 150);
  });

  for (const value of ['1', '0', '-3', 'abc', '2.5', '1e3', 'x300']) {
    it(`"${value}" is refused, the value not echoed`, () => {
      assert.throws(
        () => read([`--batch-parts-per-envelope=${value}`]),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.words ===
            'Invalid --batch-parts-per-envelope: must be a whole number of parts from 2',
      );
    });
  }

  it("an embedder's option: a whole number from 2, else refused", () => {
    assert.equal(partsPerEnvelopeOf(2, 'partsPerEnvelope'), 2);
    for (const value of [1, 0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => partsPerEnvelopeOf(value, 'partsPerEnvelope'),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid partsPerEnvelope: must be a whole number of parts from 2',
      );
    }
  });
});

describe('batchReader', () => {
  const readerOn = (partsPerEnvelope?: number) => {
    const fake = envelopeConnection((parts) =>
      envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      ),
    );
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      ...(partsPerEnvelope !== undefined && { partsPerEnvelope }),
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
    partsPerEnvelope: number | undefined,
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
      ...(partsPerEnvelope !== undefined && { partsPerEnvelope }),
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
      partsPerEnvelope: 2,
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

describe('the bound counts parts (requests), a read kept whole', () => {
  /** A phase whose item `i` records `partsOf(i)` independent requests. */
  const phaseOf = async (
    partsOf: (item: number) => number,
    items: number,
    partsPerEnvelope: number,
  ) => {
    const fake = envelopeConnection((parts) =>
      envelopeResponse(
        parts.map((p) => ({ status: 200, statusText: 'OK', body: p.url })),
      ),
    );
    const context: HandlerContext = {
      connection: fake.connection,
      logger: undefined,
      batchAvailability: createBatchAvailability(),
      partsPerEnvelope,
    };
    const outcome = withinTurns(
      runPhaseOutcome(context, numbers(items), async (item, c) => {
        const answers = await Promise.all(
          Array.from({ length: partsOf(item) }, (_, part) =>
            c.makeAdtRequest({
              url: `/sap/bc/adt/x/${item}/${part}`,
              method: 'GET',
              timeout: 0,
            }),
          ),
        );
        return answers.map((answer) => String(answer.data));
      }),
      2000,
    );
    return { fake, outcome };
  };

  it('the envelopes are filled by parts: three reads of two requests at 4 are 2 + 1 reads (4 + 2 parts)', async () => {
    const { fake, outcome } = await phaseOf(() => 2, 3, 4);
    const settled = await outcome;
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [4, 2],
    );
    assert.deepStrictEqual(
      settled.results.map((r) => (r.ok ? r.value.length : -1)),
      [2, 2, 2],
    );
  });

  it('a read whose requests do not fit moves whole to the next envelope: two reads of two at 3 are two envelopes of 2', async () => {
    const { fake, outcome } = await phaseOf(() => 2, 2, 3);
    await outcome;
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [2, 2],
    );
    // Each envelope holds one read's two requests, never split.
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.map((p) => p.url.split('/').at(-2))),
      [
        ['0', '0'],
        ['1', '1'],
      ],
    );
  });

  it('a read needing more parts than the bound: nothing is sent, the error names both numbers', async () => {
    const { fake, outcome } = await phaseOf(
      (item) => (item === 1 ? 3 : 1),
      3,
      2,
    );
    await assert.rejects(
      outcome,
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          'a read of this step needs 3 parts in one ADT batch envelope, more than the 2 parts per envelope set (--batch-parts-per-envelope / partsPerEnvelope); nothing was sent',
    );
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 0);
  });
});
