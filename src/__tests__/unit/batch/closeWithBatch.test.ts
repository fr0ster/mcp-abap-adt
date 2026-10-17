/**
 * An instance's end with a batch open (spec §8): nothing recorded is sent.
 *
 * - The instance close (`closeInstance`: stdio's client close, an SSE close,
 *   the pool's eviction, the process shutdown) drops the batch — mode off,
 *   its signal aborted, the batch connection and the answers gone — in the
 *   tick the close begins; no envelope goes out, and every recorded handler
 *   settles (the batch's signal ends its wait for parts that will never
 *   come) with no unhandled rejection — proven under plain node
 *   (`plainNode.ts`: inside Jest no `unhandledRejection` listener is told),
 *   with handlers that do not guard their parts.
 * - The idle bound ending held state with a batch open (Review Focus 4):
 *   nothing sent, the recorded handlers released, `BatchEnd` then refused
 *   `batch_mode_off`, `BatchAnswers` "no answer with that number" for the
 *   last executed batch's numbers too.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import { BATCH_MODE_OFF_WORDS } from '../../../lib/auth/serverRefusal';
import { NO_ANSWER_WORDS } from '../../../lib/batch/answers';
import type { RecordedCall } from '../../../lib/batch/InstanceBatch';
import { closeInstance } from '../../../lib/instanceClose';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';
import { runPlainNode } from '../../helpers/plainNode';

const SCENARIO = 'src/__tests__/unit/batch/scenarios/batchDrop.scenario.ts';
const DURING_END =
  'src/__tests__/unit/batch/scenarios/closeDuringEnd.scenario.ts';

const sap = (inner: InnerRequest): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'text/plain' },
  body: `source of ${inner.url}`,
});

const TOOLS = ['GetProgram', 'GetClass'];

const turns = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

/** Whether every recorded call's answer has settled within a few turns. */
async function settled(recorded: RecordedCall[]): Promise<boolean> {
  let done = false;
  void Promise.all(recorded.map((call) => call.answer)).then(() => {
    done = true;
  });
  await turns();
  return done;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the instance close with a batch open', () => {
  it('closeInstance with a batch open: zero envelopes, recorded handlers released', async () => {
    const s = await batchStand({ tools: TOOLS, part: sap });
    s.begin();
    expect(await s.call('GetProgram', { program_name: 'PROG_A' })).toEqual({
      content: [],
    });
    expect(await s.call('GetClass', { class_name: 'CL_A' })).toEqual({
      content: [],
    });
    const open = s.owner.opened();
    const recorded = [...(open?.recorded ?? [])];
    expect(recorded.map((call) => call.number)).toEqual([1, 2]);
    const signal = s.owner.signal();

    const closing = closeInstance(s.server);
    // Dropped in the tick the close begins.
    expect(s.owner.mode()).toBe('off');
    expect(s.owner.opened()).toBeUndefined();
    expect(signal.aborted).toBe(true);
    await closing;

    expect(await settled(recorded)).toBe(true);
    for (const answer of await Promise.all(recorded.map((c) => c.answer))) {
      expect(answer.isError).toBe(true);
    }
    expect(s.executes).not.toHaveBeenCalled();
    for (const fake of s.built) expect(fake.envelopes).toEqual([]);
    expect(s.owner.holdsState()).toBe(false);
    await s.close();
  });

  it.each(['close', 'dispose'])(
    'plain node, %s with a batch open: nothing sent, every recorded handler settled, no unhandled rejection',
    async (how) => {
      const report = await runPlainNode(SCENARIO, [how]);
      expect(report).toEqual({
        callAnswers: [[], []],
        numbers: [1, 2],
        mode: 'off',
        holdsState: false,
        signalAborted: true,
        executes: 0,
        direct: [],
        settled: true,
        recordedErrors: [true, true],
        unhandled: [],
      });
    },
  );
});

describe('the instance close while BatchEnd executes', () => {
  it('plain node: nothing more sent after the drop, no answers afterwards, no unhandled rejection', async () => {
    const report = await runPlainNode(DURING_END);
    expect(report).toEqual({
      numbers: [1, 2],
      // The batch's one envelope, both parts, was on the wire at the drop;
      // nothing went after it.
      envelopes: [2],
      direct: [],
      modeAtDrop: 'off',
      mode: 'off',
      holdsState: false,
      // BatchEnd's end() after the drop re-installs nothing.
      answers: [null, null],
      settled: true,
      endSettled: true,
      unhandled: [],
    });
  });
});

describe('the idle bound with a batch open (Review Focus 4)', () => {
  it('nothing sent; recorded handlers released; BatchEnd then batch_mode_off; BatchAnswers no answer with that number', async () => {
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    const s = await batchStand({ tools: TOOLS, part: sap });
    // A batch executed: its answer 1 is kept.
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    expect((await s.end()).summary).toEqual({ recorded: 1, failed: [] });
    expect(s.owner.answer(1)).toBeDefined();
    const sentBefore = s.built.map((fake) => fake.envelopes.length);

    // The next batch open, two calls recorded, then no call for the bound.
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_B' });
    await s.call('GetClass', { class_name: 'CL_B' });
    const recorded = [...(s.owner.opened()?.recorded ?? [])];
    expect(recorded.map((call) => call.number)).toEqual([1, 2]);
    const signal = s.owner.signal();

    jest.advanceTimersByTime(30 * 60_000);
    jest.useRealTimers();
    await turns();

    expect(s.owner.mode()).toBe('off');
    expect(signal.aborted).toBe(true);
    expect(await settled(recorded)).toBe(true);
    expect(s.executes).toHaveBeenCalledTimes(1); // the first batch's only
    expect(s.built.map((fake) => fake.envelopes.length)).toEqual(
      sentBefore.concat(new Array(s.built.length - sentBefore.length).fill(0)),
    );

    const ended = await s.call('BatchEnd');
    expect(ended.isError).toBe(true);
    expect(payloadOf(ended)).toEqual({
      error: 'batch_mode_off',
      message: BATCH_MODE_OFF_WORDS,
    });
    expect(await s.answers([1, 2])).toEqual([
      { number: 1, error: 'no_answer', message: NO_ANSWER_WORDS },
      { number: 2, error: 'no_answer', message: NO_ANSWER_WORDS },
    ]);
    expect(s.executes).toHaveBeenCalledTimes(1);
    await s.close();
  });
});
