/**
 * An answer is the complete result or an error, never a partial one
 * (`src/lib/detail/complete.ts`): a formatter that renders other items than
 * its reading held ends the call with `incomplete_answer`, in fixed words
 * naming the tool — at the `answer()` boundary, a reader of thrown values
 * and `return_error` alike.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { answer, answerThrown } from '../../../lib/answer';
import {
  completeAnswer,
  IncompleteAnswerError,
  incompleteAnswerWords,
} from '../../../lib/detail';
import { return_error } from '../../../lib/utils';

const held = (items: readonly string[]) => items;

describe('completeAnswer', () => {
  it('the items held, each rendered: the answer, unchanged', () => {
    const shown = completeAnswer('Tool', held, (items: readonly string[]) => ({
      answer: items.join(','),
      rendered: [...items],
    }));
    assert.equal(shown(['a', 'b', 'a']), 'a,b,a');
  });

  for (const [label, rendered] of [
    ['one dropped', ['a', 'b']],
    ['two merged', ['a', 'b']],
    ['one missed and another doubled', ['a', 'a', 'a']],
    ['one added', ['a', 'b', 'a', 'c']],
  ] as const) {
    it(`${label}: refused in fixed words naming the tool`, () => {
      const shown = completeAnswer('Tool', held, () => ({
        answer: 'partial',
        rendered,
      }));
      assert.throws(
        () => shown(['a', 'b', 'a']),
        (thrown: unknown) =>
          thrown instanceof IncompleteAnswerError &&
          thrown.message === incompleteAnswerWords('Tool') &&
          thrown.message.includes("detail: 'full'"),
      );
    });
  }
});

describe('the answer boundary answers an incomplete answer as its error', () => {
  const ctx = { tool: 'Tool', detail: 'terse' as const };
  const refused = () => {
    throw new IncompleteAnswerError('Tool');
  };
  const payload = (result: { content: Array<{ text?: string }> }) =>
    JSON.parse(result.content[0]?.text ?? '{}');

  it('a projection that refuses: incomplete_answer, no partial text', async () => {
    const result = await answer(
      ctx,
      async () =>
        ({
          ok: true,
          getResult: () => ({ value: 'x' }),
          getError: () => {
            throw new Error('no error');
          },
        }) as never,
      refused,
    );
    assert.equal(result.isError, true);
    assert.equal(payload(result).error, 'incomplete_answer');
    assert.equal(payload(result).message, incompleteAnswerWords('Tool'));
  });

  it('a reading that refuses inside the call: incomplete_answer', () => {
    const result = answerThrown(new IncompleteAnswerError('Tool'), ctx);
    assert.equal(payload(result).error, 'incomplete_answer');
  });

  it('a handler that answers its throws by return_error: incomplete_answer', () => {
    const result = return_error(new IncompleteAnswerError('Tool'));
    assert.equal(result.isError, true);
    assert.deepStrictEqual(payload(result), {
      error: 'incomplete_answer',
      tool: 'Tool',
      message: incompleteAnswerWords('Tool'),
    });
  });
});
