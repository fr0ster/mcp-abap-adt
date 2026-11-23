/**
 * `bodyTextOf` writes an answer's body as `String` does, an absent one as
 * `''`, and reads the body once: a getter behind `data` runs one time, as it
 * did under `String(answer.data ?? '')`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyTextOf } from '../../lib/wireValue';

/** An answer whose `data` is a getter that counts its reads. */
function counted(value: unknown): {
  answer: { data: unknown };
  reads: () => number;
} {
  let reads = 0;
  return {
    answer: {
      get data() {
        reads += 1;
        return value;
      },
    },
    reads: () => reads,
  };
}

describe('bodyTextOf', () => {
  const cases: [string, unknown, string][] = [
    ['a string', '<xml/>', '<xml/>'],
    ['undefined', undefined, ''],
    ['null', null, ''],
    ['a number', 42, '42'],
    ['an object', { a: 1 }, '[object Object]'],
    ['a list', [1, 2], '1,2'],
    // Bytes are their UTF-8 text, never their numbers (Codex round 7).
    ['bytes', new TextEncoder().encode('<ä/>'), '<ä/>'],
  ];
  for (const [name, value, text] of cases) {
    it(`writes ${name} as String does, reading data once`, () => {
      const { answer, reads } = counted(value);
      assert.equal(bodyTextOf(answer), text);
      assert.equal(reads(), 1);
    });
  }
});
