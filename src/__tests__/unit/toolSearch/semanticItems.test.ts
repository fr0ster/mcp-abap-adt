/**
 * A `tools/tool-search.json` entry's semantic list, on the parser and the
 * renderer alone (`searchEntry.ts`): an item naming several members is kept
 * while any one of them is offered, `serial` writes the comma before the
 * last of three or more items, and an item naming both `member` and
 * `members`, or an empty `members`, is malformed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JsonValue } from '../../../lib/json';
import { entryOf, rendered } from '../../../lib/toolSearch/searchEntry';

/** An entry whose semantic lists `items`, joined by `and`. */
function listing(items: JsonValue[], serial?: JsonValue): JsonValue {
  return {
    keywords: [],
    semantic: {
      before: 'Do ',
      items,
      join: 'and',
      ...(serial === undefined ? {} : { serial }),
      after: '.',
    },
  };
}

const sentence = (entry: JsonValue, offered?: readonly string[]): string =>
  rendered(entryOf('T', entry), offered).semantic;

describe('a semantic item naming several members', () => {
  const entry = listing([
    { text: 'A', member: 'a' },
    { text: 'B', members: ['b1', 'b2', 'b3'] },
  ]);

  it('is kept when any one of its members is offered', () => {
    assert.equal(sentence(entry, ['a', 'b2']), 'Do A and B.');
    assert.equal(sentence(entry, ['b3']), 'Do B.');
  });

  it('leaves when none of its members is offered', () => {
    assert.equal(sentence(entry, ['a']), 'Do A.');
  });

  it('is kept when no members are stated', () => {
    assert.equal(sentence(entry), 'Do A and B.');
  });
});

describe('serial', () => {
  const items = (count: number): JsonValue[] =>
    ['A', 'B', 'C'].slice(0, count).map((text) => ({ text }));

  it('writes "A, B, and C" for three items', () => {
    assert.equal(sentence(listing(items(3), true)), 'Do A, B, and C.');
  });

  it('writes "A and B" for two items and "A" for one', () => {
    assert.equal(sentence(listing(items(2), true)), 'Do A and B.');
    assert.equal(sentence(listing(items(1), true)), 'Do A.');
  });

  it('counts the items left after the members offered', () => {
    const entry = listing(
      [{ text: 'A' }, { text: 'B', member: 'b' }, { text: 'C' }],
      true,
    );
    assert.equal(sentence(entry, []), 'Do A and C.');
  });

  it('absent, writes "A, B and C" as before', () => {
    assert.equal(sentence(listing(items(3))), 'Do A, B and C.');
  });

  it('false, writes "A, B and C"', () => {
    assert.equal(sentence(listing(items(3), false)), 'Do A, B and C.');
  });

  it('other than a boolean is malformed', () => {
    assert.throws(() => entryOf('T', listing(items(3), 'yes')), {
      message: 'tools/tool-search.json: T.semantic.serial is malformed',
    });
  });
});

describe('a malformed item', () => {
  it('naming both member and members is refused', () => {
    assert.throws(
      () => entryOf('T', listing([{ text: 'A', member: 'a', members: ['a'] }])),
      {
        message:
          'tools/tool-search.json: T.semantic.items[0].members is malformed',
      },
    );
  });

  it('with an empty members is refused', () => {
    assert.throws(() => entryOf('T', listing([{ text: 'A', members: [] }])), {
      message:
        'tools/tool-search.json: T.semantic.items[0].members is malformed',
    });
  });

  it('with members other than a list of strings is refused', () => {
    assert.throws(() => entryOf('T', listing([{ text: 'A', members: [1] }])), {
      message:
        'tools/tool-search.json: T.semantic.items[0].members is malformed',
    });
  });
});
