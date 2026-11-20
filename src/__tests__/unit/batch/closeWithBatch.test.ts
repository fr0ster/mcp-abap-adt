/**
 * An instance's end with a batch open (spec §8): nothing recorded is sent.
 *
 * - The instance close (`closeInstance`: stdio's client close, an SSE close,
 *   the pool's eviction, the process shutdown) drops the batch — mode off,
 *   its signal aborted, the batch connection and the answers gone — in the
 *   tick the close begins; no envelope goes out, and every recorded handler
 *   settles (the batch's signal ends its wait for parts that will never
 *   come) with no unhandled rejection — proven under plain node
 *   (`plainNode.ts`: inside the node:test runner an unhandled rejection
 *   fails the file instead),
 *   with handlers that do not guard their parts.
 * - The idle bound ending held state with a batch open (Review Focus 4):
 *   nothing sent, the recorded handlers released, `HandlerBatch` end then refused
 *   `batch_mode_off`, `HandlerBatch` answers "no answer with that number" for the
 *   last executed batch's numbers too.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BATCH_MODE_OFF_WORDS } from '../../../lib/auth/serverRefusal';
import { NO_ANSWER_WORDS } from '../../../lib/batch/answers';
import * as connectionFactory from '../../../lib/connectionFactory';
import { closeInstance } from '../../../lib/instanceClose';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import { HandlerLedger } from '../../helpers/handlerLedger';
import { runPlainNode } from '../../helpers/plainNode';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// Every case restores every mock after it: they are replaced before each.
beforeEach(() => {
  mock.method(connectionFactory, 'createAbapConnection', () => undefined);
});

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const SCENARIO = 'src/__tests__/unit/batch/scenarios/batchDrop.scenario.ts';
const DURING_END =
  'src/__tests__/unit/batch/scenarios/closeDuringEnd.scenario.ts';
const UNREAD = 'src/__tests__/unit/batch/scenarios/unreadNumbers.scenario.ts';

const sap = (inner: InnerRequest): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'text/plain' },
  body: `source of ${inner.url}`,
});

const TOOLS = ['HandlerGet'];

const turns = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

/** Whether every handler that started has returned or thrown within a few turns. */
async function settled(ledger: HandlerLedger): Promise<boolean> {
  await turns();
  return ledger.allEnded();
}

afterEach(() => {
  useRealTimers();
  mock.restoreAll();
});

describe('the instance close with a batch open', () => {
  it('closeInstance with a batch open: zero envelopes, recorded handlers released', async () => {
    const ledger = new HandlerLedger();
    const s = await batchStand({ tools: TOOLS, part: sap, ledger });
    s.begin();
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      {
        content: [],
      },
    );
    assert.deepStrictEqual(
      await s.call('HandlerGet', { object_type: 'CLASS', class_name: 'CL_A' }),
      {
        content: [],
      },
    );
    const open = s.owner.opened();
    const recorded = [...(open?.recorded ?? [])];
    assert.deepStrictEqual(
      recorded.map((call) => call.number),
      [1, 2],
    );
    const signal = s.owner.signal();

    const closing = closeInstance(s.server);
    // Dropped in the tick the close begins.
    assert.equal(s.owner.mode(), 'off');
    assert.equal(s.owner.opened(), undefined);
    assert.equal(signal.aborted, true);
    await closing;

    assert.equal(await settled(ledger), true);
    assert.equal(s.executes.mock.callCount(), 0);
    for (const fake of s.built) assert.deepStrictEqual(fake.envelopes, []);
    assert.equal(s.owner.holdsState(), false);
    await s.close();
  });

  for (const how of ['close', 'dispose']) {
    it(
      format(
        'plain node, %s with a batch open: nothing sent, every recorded handler settled, no unhandled rejection',
        how,
      ),
      async () => {
        const report = await runPlainNode(SCENARIO, [how]);
        assert.deepStrictEqual(report, {
          callAnswers: [[], []],
          numbers: [1, 2],
          mode: 'off',
          holdsState: false,
          signalAborted: true,
          executes: 0,
          direct: [],
          settled: true,
          unhandled: [],
        });
      },
    );
  }
});

describe('the instance close while HandlerBatch end executes', () => {
  it('plain node: nothing more sent after the drop, no answers afterwards, no unhandled rejection', async () => {
    const report = await runPlainNode(DURING_END);
    assert.deepStrictEqual(report, {
      numbers: [1, 2],
      // The batch's one envelope, both parts, was on the wire at the drop;
      // nothing went after it.
      envelopes: [2],
      direct: [],
      modeAtDrop: 'off',
      mode: 'off',
      holdsState: false,
      // the batch end's end() after the drop re-installs nothing.
      answers: [null, null],
      settled: true,
      endSettled: true,
      unhandled: [],
    });
  });
});

describe('the idle bound with a batch open (Review Focus 4)', () => {
  it('nothing sent; recorded handlers released; HandlerBatch end then batch_mode_off; HandlerBatch answers no answer with that number', async () => {
    // setImmediate (and the microtask queues) left real; no automatic
    // advance is needed: the in-memory transport moves on real
    // turns, and the bound is reached by the explicit advance below (§3.7).
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const ledger = new HandlerLedger();
    const s = await batchStand({ tools: TOOLS, part: sap, ledger });
    // A batch executed: its answer 1 is kept.
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    assert.deepStrictEqual((await s.end()).summary, {
      recorded: 1,
      sent: 1,
      received: 1,
    });
    assert.notEqual(s.owner.answer(1), undefined);
    const sentBefore = s.built.map((fake) => fake.envelopes.length);

    // The next batch open, two calls recorded, then no call for the bound.
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_B',
    });
    await s.call('HandlerGet', { object_type: 'CLASS', class_name: 'CL_B' });
    const recorded = [...(s.owner.opened()?.recorded ?? [])];
    assert.deepStrictEqual(
      recorded.map((call) => call.number),
      [1, 2],
    );
    const signal = s.owner.signal();

    mock.timers.tick(30 * 60_000);
    useRealTimers();
    await turns();

    assert.equal(s.owner.mode(), 'off');
    assert.equal(signal.aborted, true);
    assert.equal(await settled(ledger), true);
    assert.equal(s.executes.mock.callCount(), 1); // the first batch's only
    assert.deepStrictEqual(
      s.built.map((fake) => fake.envelopes.length),
      sentBefore.concat(new Array(s.built.length - sentBefore.length).fill(0)),
    );

    const ended = await s.call('HandlerBatch', { action: 'end' });
    assert.equal(ended.isError, true);
    assert.deepStrictEqual(payloadOf(ended), {
      error: 'batch_mode_off',
      message: BATCH_MODE_OFF_WORDS,
    });
    assert.deepStrictEqual(await s.answers([1, 2]), [
      { number: 1, error: 'no_answer', message: NO_ANSWER_WORDS },
      { number: 2, error: 'no_answer', message: NO_ANSWER_WORDS },
    ]);
    assert.equal(s.executes.mock.callCount(), 1);
    await s.close();
  });
});

describe('numbers never read (spec §6)', () => {
  for (const how of ['replace', 'close']) {
    it(
      format(
        'plain node, the map %s: a handler never read was waiting, awaited by nothing, and is let go with no unhandled rejection',
        how,
      ),
      async () => {
        const report = await runPlainNode(UNREAD, [how]);
        assert.deepStrictEqual(report, {
          numbers: [1, 2],
          summary: { recorded: 2, sent: 3, received: 3 },
          read: [[1, [{ type: 'text', text: 'a' }]]],
          // The batch's one envelope; the replacing batch was empty.
          envelopes: [3],
          settledBefore: false,
          settled: true,
          holdsState: false,
          unhandled: [],
        });
      },
    );
  }
});
