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
  Written,
} from '../../../lib/detail';
import { return_error } from '../../../lib/utils';

const held = (items: readonly string[]) => items;

/** The rows of a list of names: each its cell and its identity. */
const rowsOf = (items: readonly string[]) =>
  items.map((item) => ({ cells: [item], identity: item }));

describe('completeAnswer over the written rows', () => {
  it('every item written: the answer, unchanged', () => {
    const shown = completeAnswer('Tool', held, (items: readonly string[]) =>
      Written.tsv(['name'], rowsOf(items)),
    );
    assert.equal(shown(['a', 'b', 'a']), 'name\na\nb\na');
  });

  // Codex's mutation (round 5, P1-1): one row fewer handed to the writer,
  // the full list of identities beside it. The identities are the rows
  // written, so the claim has nowhere to go: the answer is refused.
  it('one row fewer to tsv, the full identities claimed: refused', () => {
    const claimed = ['a', 'b', 'a'];
    const shown = completeAnswer('Tool', held, (items: readonly string[]) => {
      const written = Written.tsv(['name'], rowsOf(items.slice(1)));
      void claimed;
      return written;
    });
    assert.throws(
      () => shown(claimed),
      (thrown: unknown) =>
        thrown instanceof IncompleteAnswerError &&
        thrown.message === incompleteAnswerWords('Tool') &&
        thrown.message.includes("detail: 'full'"),
    );
  });

  for (const [label, written] of [
    ['two merged', ['a', 'b']],
    ['one missed and another doubled', ['a', 'a', 'a']],
    ['one added', ['a', 'b', 'a', 'c']],
  ] as const) {
    it(`${label}: refused in fixed words naming the tool`, () => {
      const shown = completeAnswer('Tool', held, () =>
        Written.tsv(['name'], rowsOf(written)),
      );
      assert.throws(() => shown(['a', 'b', 'a']), IncompleteAnswerError);
    });
  }

  it('a plain claim is no written answer: it does not compile', () => {
    // @ts-expect-error a formatter's own claim is not `Written`.
    completeAnswer('Tool', held, () => ({ answer: '', identities: [] }));
  });

  it('the JSON writers read the items from the answer itself', () => {
    const list = Written.list(
      { objects: [{ name: 'a' }, { name: 'b' }] },
      (answer) => answer.objects,
      (o) => o.name,
    );
    assert.deepStrictEqual(list.identities, ['a', 'b']);
    const tree = Written.tree(
      { name: 'r', children: [{ name: 'c', children: [] }] },
      (answer) => answer,
      (node) => node.children,
      (node, depth) => `${depth}|${node.name}`,
      false,
    );
    assert.deepStrictEqual(tree.identities, ['1|c']);
  });

  it('plain lines carry no item; written parts carry theirs, in order', () => {
    const written = Written.lines([
      '# head',
      Written.row(['x'], 'x'),
      Written.marked('incomplete', ['type=T'], 'i'),
    ]);
    assert.equal(written.answer, '# head\nx\n# incomplete type=T');
    assert.deepStrictEqual(written.identities, ['x', 'i']);
  });
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
