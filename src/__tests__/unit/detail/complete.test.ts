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
  identityOf,
  incompleteAnswerWords,
  Written,
} from '../../../lib/detail';
import { return_error } from '../../../lib/utils';

/** Two objects SAP listed without a name, apart only by their URI. */
const NAMELESS = [
  { type: 'CLAS/OC', name: '', uri: '/sap/bc/adt/x/one' },
  { type: 'CLAS/OC', name: '', uri: '/sap/bc/adt/x/two' },
];
type Item = (typeof NAMELESS)[number];

/** What the reading held: each object by the values its row writes. */
const held = (items: readonly Item[]) =>
  items.map((item) => identityOf([item.type, item.name, item.uri]));

/** The rows a formatter writes, as it would. */
const rows = (items: readonly Item[]) =>
  items.map((item) => ({ row: [item.type, item.name, item.uri] }));

describe('completeAnswer over the cells written', () => {
  it('every object written: the answer, unchanged', () => {
    const shown = completeAnswer('Tool', held, (items: readonly Item[]) =>
      Written.text(
        [{ header: ['type', 'name', 'uri'] }, ...rows(items)],
        [0, 1, 2],
      ),
    );
    assert.equal(
      shown(NAMELESS),
      'type\tname\turi\nCLAS/OC\t\t/sap/bc/adt/x/one\nCLAS/OC\t\t/sap/bc/adt/x/two',
    );
  });

  // Codex's first surviving mutation (round 6, P1-1): the first object's
  // URI written into both rows. The identities are the cells written, so the
  // two rows read as one object twice: refused.
  it("the first object's URI written into both rows: refused", () => {
    const shown = completeAnswer('Tool', held, (items: readonly Item[]) =>
      Written.text(
        [
          { header: ['type', 'name', 'uri'] },
          ...items.map((item) => ({
            row: [item.type, item.name, items[0]?.uri ?? ''],
          })),
        ],
        [0, 1, 2],
      ),
    );
    assert.throws(
      () => shown(NAMELESS),
      (thrown: unknown) =>
        thrown instanceof IncompleteAnswerError &&
        thrown.message === incompleteAnswerWords('Tool'),
    );
  });

  // Codex's second surviving mutation: an extra row appended. A row is an
  // item, and nothing appends text after the writer: refused.
  it('an extra row appended: refused', () => {
    const shown = completeAnswer('Tool', held, (items: readonly Item[]) =>
      Written.text(
        [
          { header: ['type', 'name', 'uri'] },
          ...rows(items),
          { row: ['CLAS/OC', 'ZEXTRA', ''] },
        ],
        [0, 1, 2],
      ),
    );
    assert.throws(() => shown(NAMELESS), IncompleteAnswerError);
  });

  it('one row fewer: refused', () => {
    const shown = completeAnswer('Tool', held, (items: readonly Item[]) =>
      Written.text(rows(items.slice(1)), [0, 1, 2]),
    );
    assert.throws(() => shown(NAMELESS), IncompleteAnswerError);
  });

  it('a plain claim is no written answer: it does not compile', () => {
    // @ts-expect-error a formatter's own claim is not `Written`.
    completeAnswer('Tool', held, () => ({ answer: '', identities: [] }));
  });

  it('the JSON writers identify each row by its fields, as placed in the answer', () => {
    const json = Written.json({ count: 2 }, { objects: NAMELESS }, [
      'type',
      'name',
      'uri',
    ]);
    assert.deepStrictEqual(json.answer, { count: 2, objects: NAMELESS });
    assert.deepStrictEqual(json.identities, held(NAMELESS));
    const tree = Written.jsonTreeRoot(
      { name: 'r', children: [{ name: 'c', children: [] }] },
      (node) => node.children,
      ['name'],
      false,
    );
    assert.deepStrictEqual(tree.identities, [identityOf(['c'])]);
  });

  it('a head line is never a row; a mark is an item', () => {
    const written = Written.text(
      [
        { head: 'count', value: '1' },
        { mark: 'incomplete', words: ['type=T'] },
      ],
      [0],
    );
    assert.equal(written.answer, '# count 1\n# incomplete type=T');
    assert.deepStrictEqual(written.identities, [
      identityOf(['incomplete', 'type=T']),
    ]);
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
