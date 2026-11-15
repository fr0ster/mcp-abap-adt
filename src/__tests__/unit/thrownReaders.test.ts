/**
 * The readers a thrown value is inspected through: `thrownAs` (an instance
 * of a class, or nothing), `asError` (itself when an `Error`, else one of its
 * text) and `messageOf` (an `Error`'s message, else the value written out).
 * Each answers what the inline `instanceof` it replaces answered.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { messageOf } from '../../lib/answer';
import { asError, thrownAs } from '../../lib/thrownValue';

class Refusal extends Error {
  constructor(readonly words: string) {
    super(words);
  }
}

class Other extends Error {}

/** A class of ours that is no `Error`. */
class Plain {
  readonly kind = 'plain';
}

const values: [string, unknown][] = [
  ['an Error', new Error('plain')],
  ['a class of ours', new Refusal('refused')],
  ['another class', new Other('other')],
  ['a class that is no Error', new Plain()],
  ['a string', 'text'],
  ['a number', 42],
  ['null', null],
  ['undefined', undefined],
  ['an object', { message: 'not an error' }],
];

describe('thrownAs', () => {
  for (const [name, value] of values) {
    it(`answers ${name} as instanceof does`, () => {
      assert.equal(
        thrownAs(value, Refusal),
        value instanceof Refusal ? value : undefined,
      );
      assert.equal(
        thrownAs(value, Error),
        value instanceof Error ? value : undefined,
      );
      assert.equal(
        thrownAs(value, Plain),
        value instanceof Plain ? value : undefined,
      );
    });
  }
});

describe('asError', () => {
  for (const [name, value] of values) {
    it(`answers ${name} as the inline wrap did`, () => {
      const inline = value instanceof Error ? value : new Error(String(value));
      const read = asError(value);
      if (value instanceof Error) assert.equal(read, value);
      else {
        assert.ok(read instanceof Error);
        assert.equal(read.message, inline.message);
      }
    });
  }
});

describe('messageOf', () => {
  for (const [name, value] of values) {
    it(`answers ${name} as the inline message did`, () => {
      assert.equal(
        messageOf(value),
        value instanceof Error ? value.message : String(value),
      );
    });
  }
});
