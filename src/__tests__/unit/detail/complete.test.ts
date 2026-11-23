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
  type Line,
  listedText,
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

  // Codex round 7: SAP's text may hold a line break or a tab — it can add
  // no line and no column, and the identity is the same escaped value.
  it('a line break in a head value or a cell adds no line', () => {
    const written = Written.text(
      [
        { head: 'object', value: 'ZA\n# injected' },
        { header: ['name'] },
        { row: ['a\tb\nc'] },
      ],
      [0],
    );
    assert.equal(written.answer.split('\n').length, 3, written.answer);
    assert.deepStrictEqual(written.identities, [identityOf(['a\tb\nc'])]);
  });

  it('an extra root: refused', () => {
    const shown = completeAnswer(
      'Tool',
      () => [identityOf(['child'])],
      () =>
        Written.text(
          [
            { root: ['P'], depth: 0 },
            { row: ['child'], depth: 1 },
            { root: ['Q'], depth: 0 },
          ],
          [0],
        ),
    );
    assert.throws(() => shown(undefined), IncompleteAnswerError);
  });

  it('a copy of a written answer is no written answer: refused', () => {
    const shown = completeAnswer(
      'Tool',
      () => [identityOf(['a'])],
      () => Object.assign({}, Written.text([{ row: ['a'] }], [0])),
    );
    assert.throws(() => shown(undefined), IncompleteAnswerError);
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
    assert.equal(written.answer, '# count 1\n# incomplete\ttype=T');
    assert.deepStrictEqual(written.identities, [
      identityOf(['incomplete', 'type=T']),
    ]);
  });

  // Codex round 8: the writer's guarantees hold for every line it writes.
  it('two lists of mark words never render alike', () => {
    const one = Written.text([{ mark: 'm', words: ['a b', 'c'] }], [0]);
    const two = Written.text([{ mark: 'm', words: ['a', 'b c'] }], [0]);
    const three = Written.text([{ mark: 'm', words: ['a\tb', 'c'] }], [0]);
    const four = Written.text([{ mark: 'm', words: ['a', 'b', 'c'] }], [0]);
    const answers = [one, two, three, four].map((w) => w.answer);
    assert.equal(new Set(answers).size, 4, answers.join(' | '));
  });

  it('head labels and header cells are escaped like every value', () => {
    const written = Written.text(
      [
        { head: 'a\nb', value: 'v' },
        { group: 'g\nh', value: 'v' },
        { header: ['x\ny', 'z'] },
      ],
      [0],
    );
    assert.equal(written.answer.split('\n').length, 3, written.answer);
  });

  // Codex round 9, probe one: a second root never stands in for an omitted
  // row — root validity is its own check.
  it('a second root cannot replace an omitted row', () => {
    const shown = completeAnswer(
      'Tool',
      () => [identityOf(['root', 'X'])],
      () =>
        Written.text(
          [
            { root: ['P'], depth: 0 },
            { root: ['X'], depth: 0 },
          ],
          [0, 1],
        ),
    );
    assert.throws(() => shown(undefined), IncompleteAnswerError);
  });

  it('two roots and nothing held: refused by the root check alone', () => {
    const shown = completeAnswer(
      'Tool',
      () => [],
      () =>
        Written.text(
          [
            { root: ['P'], depth: 0 },
            { bulletRoot: 'Q', depth: 0 },
          ],
          [0],
        ),
    );
    assert.throws(() => shown(undefined), IncompleteAnswerError);
  });

  // Codex round 9, probe two, and the GetPackageTree regression: each part
  // of a list is its own section — its root allowed, its items counted
  // against its own read.
  type Tree = { readonly name: string; readonly children: readonly string[] };
  const heldOf = (tree: Tree) => tree.children.map((c) => identityOf([c]));
  const treeOf = (tree: Tree) =>
    Written.text(
      [
        { root: [tree.name], depth: 0 },
        ...tree.children.map((c): Line => ({ row: [c], depth: 1 })),
      ],
      [0],
    );

  it('listedText: two trees, each its own root, pass', () => {
    const text = listedText(
      'Tool',
      [
        {
          heads: [{ head: 'asked', value: 'A' }],
          read: { name: 'A', children: ['a1'] },
        },
        {
          heads: [{ head: 'asked', value: 'B' }],
          read: { name: 'B', children: ['b1'] },
        },
      ],
      heldOf,
      treeOf,
    );
    assert.equal(text, '# asked A\nA\n  a1\n# asked B\nB\n  b1');
  });

  it("listedText: an item written under another object's section is refused", () => {
    const swapped = (tree: Tree) =>
      treeOf(
        tree.name === 'A'
          ? { name: 'A', children: ['a1', 'b1'] }
          : { name: 'B', children: [] },
      );
    assert.throws(
      () =>
        listedText(
          'Tool',
          [
            { heads: [], read: { name: 'A', children: ['a1'] } },
            { heads: [], read: { name: 'B', children: ['b1'] } },
          ],
          heldOf,
          swapped,
        ),
      IncompleteAnswerError,
    );
  });

  it('nested: the inner answer is set whole, the container cannot replace it', () => {
    const inner = Written.json({}, { rows: NAMELESS }, ['type', 'name', 'uri']);
    const nested = Written.nested(
      { metadata: 'replaced?', other: 1 },
      'metadata',
      inner,
    );
    assert.deepStrictEqual(nested.answer, {
      metadata: { rows: NAMELESS },
      other: 1,
    });
    assert.deepStrictEqual(nested.identities, held(NAMELESS));
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
