/**
 * `BatchAnswers` (spec §6): the map of the last ended batch read by number,
 * in the order asked — each number's handler resumed when first read;
 * nothing sent; served while a batch is open.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import {
  ANSWERS_ASK_WORDS,
  ANSWERS_NUMBER_WORDS,
  NO_ANSWER_WORDS,
  readAnswers,
} from '../../../lib/batch/answers';
import {
  type BatchAnswer,
  InstanceBatch,
  type OpenBatch,
} from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { batchStand } from '../../helpers/batchStand';

const answerOf = (number: number): BatchAnswer => ({
  number,
  content: [{ type: 'text', text: `answer ${number}` }],
});

/** An owner whose last batch recorded 1, 2 and 3, each answering `answer <n>` when read. */
function answered(): InstanceBatch {
  const owner = new InstanceBatch({ keepRawParts: false });
  const open: OpenBatch = {
    connection: {} as never,
    target: new LateBoundConnection(),
    recorded: [1, 2, 3].map((number) => ({
      number,
      parts: () => [],
      resume: async () => answerOf(number),
    })),
  };
  owner.begin('communication', open);
  owner.end(open);
  return owner;
}

const none = (number: number) => ({
  number,
  error: 'no_answer',
  message: NO_ANSWER_WORDS,
});

describe('BatchAnswers', () => {
  it('number and numbers, in the order asked', async () => {
    const owner = answered();
    expect(await readAnswers(owner, { number: 2 })).toEqual([answerOf(2)]);
    expect(await readAnswers(owner, { numbers: [3, 1, 2] })).toEqual([
      answerOf(3),
      answerOf(1),
      answerOf(2),
    ]);
  });

  it('both or neither refused', () => {
    const owner = answered();
    expect(() => readAnswers(owner, { number: 1, numbers: [2] })).toThrow(
      ANSWERS_ASK_WORDS,
    );
    expect(() => readAnswers(owner, {})).toThrow(ANSWERS_ASK_WORDS);
    expect(() => readAnswers(owner, { numbers: [] })).toThrow(
      ANSWERS_ASK_WORDS,
    );
  });

  it('0, -1, 1.5 refused before anything runs; duplicates answered per occurrence', async () => {
    const owner = answered();
    const asked = jest.spyOn(owner, 'answer');
    for (const bad of [0, -1, 1.5, Number.NaN, '1']) {
      expect(() => readAnswers(owner, { number: bad })).toThrow(
        ANSWERS_NUMBER_WORDS,
      );
      expect(() => readAnswers(owner, { numbers: [1, bad] })).toThrow(
        ANSWERS_NUMBER_WORDS,
      );
    }
    expect(asked).not.toHaveBeenCalled();
    expect(await readAnswers(owner, { numbers: [2, 2, 9, 2] })).toEqual([
      answerOf(2),
      answerOf(2),
      none(9),
      answerOf(2),
    ]);
  });

  it('before any batch and an unknown number: no answer with that number', async () => {
    const fresh = new InstanceBatch({ keepRawParts: false });
    expect(await readAnswers(fresh, { numbers: [1, 2] })).toEqual([
      none(1),
      none(2),
    ]);
    expect(await readAnswers(answered(), { number: 4 })).toEqual([none(4)]);
  });

  it("served while a batch is open: the last batch's answers, nothing sent, nothing recorded", async () => {
    const s = await batchStand({
      tools: ['GetProgram'],
      part: () => ({ status: 200, statusText: 'OK', body: 'source' }),
    });
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_A' });
    await s.end();
    const [first] = await s.answers([1]);
    // The next phase is recorded; the previous phase's answers stay readable.
    s.begin();
    await s.call('GetProgram', { program_name: 'PROG_B' });
    expect(await s.answers([1, 2])).toEqual([first, none(2)]);
    expect(s.owner.opened()?.recorded.map((r) => r.number)).toEqual([1]);
    expect(s.built.flatMap((b) => b.envelopes)).toHaveLength(1);
    // A refused ask, through the tool: the words, nothing read.
    const refused = await s.call('BatchAnswers', { number: 1, numbers: [1] });
    expect(refused.isError).toBe(true);
    expect(refused.content?.[0]?.text).toBe(ANSWERS_ASK_WORDS);
    await s.close();
  });
});
