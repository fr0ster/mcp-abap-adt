/**
 * `HandlerBatch` answers (spec §6): the map of the last ended batch read by number,
 * in the order asked — each number's handler resumed when first read;
 * nothing sent; served while a batch is open.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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
import * as connectionFactory from '../../../lib/connectionFactory';
import { assertThrows } from '../../helpers/assertions';
import { batchStand } from '../../helpers/batchStand';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time), as the Jest factory
// did; the names it left out stay real.
mock.method(connectionFactory, 'createAbapConnection', () => undefined);
mock.method(connectionFactory, 'systemKindOf', () => 'onprem');
// A long read outside a batch opens a connection of its own: a sibling
// of the stand's, built by the mock below.
mock.method(connectionFactory, 'siblingRecordOf', () => ({
  settings: {},
  credential: {},
  kind: 'onprem',
}));
// A view over a connection keeps its kind: the kind is mocked above.
mock.method(connectionFactory, 'withSystemKindOf', (view: object) => view);

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

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

describe('HandlerBatch answers', () => {
  it('number and numbers, in the order asked', async () => {
    const owner = answered();
    assert.deepStrictEqual(await readAnswers(owner, { number: 2 }), [
      answerOf(2),
    ]);
    assert.deepStrictEqual(await readAnswers(owner, { numbers: [3, 1, 2] }), [
      answerOf(3),
      answerOf(1),
      answerOf(2),
    ]);
  });

  it('both or neither refused', () => {
    const owner = answered();
    assertThrows(
      () => readAnswers(owner, { number: 1, numbers: [2] }),
      ANSWERS_ASK_WORDS,
    );
    assertThrows(() => readAnswers(owner, {}), ANSWERS_ASK_WORDS);
    assertThrows(() => readAnswers(owner, { numbers: [] }), ANSWERS_ASK_WORDS);
  });

  it('0, -1, 1.5 refused before anything runs; duplicates answered per occurrence', async () => {
    const owner = answered();
    const asked = mock.method(owner, 'answer');
    // A string is ruled out by the ask's type (the schema parses numbers).
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      assertThrows(
        () => readAnswers(owner, { number: bad }),
        ANSWERS_NUMBER_WORDS,
      );
      assertThrows(
        () => readAnswers(owner, { numbers: [1, bad] }),
        ANSWERS_NUMBER_WORDS,
      );
    }
    assert.equal(asked.mock.callCount(), 0);
    assert.deepStrictEqual(
      await readAnswers(owner, { numbers: [2, 2, 9, 2] }),
      [answerOf(2), answerOf(2), none(9), answerOf(2)],
    );
  });

  it('before any batch and an unknown number: no answer with that number', async () => {
    const fresh = new InstanceBatch({ keepRawParts: false });
    assert.deepStrictEqual(await readAnswers(fresh, { numbers: [1, 2] }), [
      none(1),
      none(2),
    ]);
    assert.deepStrictEqual(await readAnswers(answered(), { number: 4 }), [
      none(4),
    ]);
  });

  it("served while a batch is open: the last batch's answers, nothing sent, nothing recorded", async () => {
    const s = await batchStand({
      tools: ['HandlerGet'],
      part: () => ({ status: 200, statusText: 'OK', body: 'source' }),
    });
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_A',
    });
    await s.end();
    const [first] = await s.answers([1]);
    // The next phase is recorded; the previous phase's answers stay readable.
    s.begin();
    await s.call('HandlerGet', {
      object_type: 'PROGRAM',
      program_name: 'PROG_B',
    });
    assert.deepStrictEqual(await s.answers([1, 2]), [first, none(2)]);
    assert.deepStrictEqual(
      s.owner.opened()?.recorded.map((r) => r.number),
      [1],
    );
    assert.equal(s.built.flatMap((b) => b.envelopes).length, 1);
    // A refused ask, through the tool: the words, nothing read.
    const refused = await s.call('HandlerBatch', {
      action: 'answers',
      number: 1,
      numbers: [1],
    });
    assert.equal(refused.isError, true);
    assert.equal(refused.content?.[0]?.text, ANSWERS_ASK_WORDS);
    await s.close();
  });
});
