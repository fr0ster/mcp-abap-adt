/**
 * The assertion helpers (`helpers/assertions.ts`, spec §3.8): one case per
 * clause of each contract, each failing when its clause is broken. A helper
 * is expected to fail with an `AssertionError`; a case that expects a pass
 * calls the helper bare.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as vm from 'node:vm';
import {
  assertMatchObject,
  assertNoProperty,
  assertRejects,
  assertThrows,
  messageOf,
  rejectionOf,
} from '../../helpers/assertions';

/** `run` fails with an AssertionError whose message holds each of `words`. */
function refuses(run: () => unknown, ...words: string[]): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof assert.AssertionError, String(error));
    for (const word of words)
      assert.ok(error.message.includes(word), error.message);
    return true;
  });
}

/** `promise` rejects with an AssertionError whose message holds each of `words`. */
async function refusesAsync(
  promise: Promise<unknown>,
  ...words: string[]
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof assert.AssertionError, String(error));
    for (const word of words)
      assert.ok(error.message.includes(word), error.message);
    return true;
  });
}

const thrower = (value: unknown) => () => {
  throw value;
};

class Custom extends Error {}
class Other extends Error {}

describe('assertMatchObject', () => {
  it('every expected key must be present (in, prototype chain)', () => {
    assertMatchObject({ a: 1, b: 2 }, { a: 1 });
    refuses(() => assertMatchObject({ a: 1 }, { a: 1, b: 2 }), '$.b');
  });

  it('an expected undefined key must be present', () => {
    assertMatchObject({ a: undefined }, { a: undefined });
    refuses(() => assertMatchObject({}, { a: undefined }), '$.a', 'missing');
  });

  it('an inherited key counts as present', () => {
    const actual: object = Object.create({ a: 1 });
    assertMatchObject(actual, { a: 1 });
  });

  it('extra actual keys are ignored', () => {
    assertMatchObject({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } });
  });

  it('arrays match by length and element', () => {
    assertMatchObject([{ a: 1, x: 0 }, 2], [{ a: 1 }, 2]);
    refuses(() => assertMatchObject([1, 2, 3], [1, 2]), '$');
    refuses(() => assertMatchObject([1, 3], [1, 2]), '$[1]');
  });

  it('an array-like is not an array', () => {
    refuses(() => assertMatchObject({ 0: 1, length: 1 }, [1]), '$');
  });

  it('a Date and a RegExp compare by value', () => {
    assertMatchObject({ d: new Date(5), r: /a/g }, { d: new Date(5), r: /a/g });
    refuses(
      () => assertMatchObject({ d: new Date(5) }, { d: new Date(6) }),
      '$.d',
    );
    refuses(() => assertMatchObject({ r: /a/g }, { r: /a/i }), '$.r');
    refuses(() => assertMatchObject({ d: 5 }, { d: new Date(5) }), '$.d');
  });

  it('a Map expected compares by isDeepStrictEqual', () => {
    assertMatchObject({ m: new Map([[1, 'a']]) }, { m: new Map([[1, 'a']]) });
    refuses(
      () =>
        assertMatchObject(
          {
            m: new Map([
              [1, 'a'],
              [2, 'b'],
            ]),
          },
          { m: new Map([[1, 'a']]) },
        ),
      '$.m',
    );
  });

  it('a class instance matches a plain expected object', () => {
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    assertMatchObject(new Point(1, 2), { x: 1 });
  });

  it('primitives compare by Object.is', () => {
    assertMatchObject({ n: Number.NaN }, { n: Number.NaN });
    refuses(() => assertMatchObject({ z: 0 }, { z: -0 }), '$.z');
    refuses(() => assertMatchObject({ s: '1' }, { s: 1 }), '$.s');
  });

  it('a failure names the path and both values', () => {
    refuses(
      () =>
        assertMatchObject(
          { a: [0, 0, { b: 'got-value' }] },
          { a: [0, 0, { b: 'want-value' }] },
        ),
      '$.a[2].b',
      'got-value',
      'want-value',
    );
  });
});

describe('messageOf', () => {
  it('a string message is the message', () => {
    assert.equal(messageOf(new Error('boom')), 'boom');
    assert.equal(messageOf({ message: 'plain' }), 'plain');
  });

  it('messageOf reads a non-string message as String(value)', () => {
    assert.equal(messageOf({ message: 42 }), '[object Object]');
  });

  it('a primitive is String(value)', () => {
    assert.equal(messageOf('text'), 'text');
    assert.equal(messageOf(7), '7');
    assert.equal(messageOf(undefined), 'undefined');
  });

  it('null is String(null)', () => {
    assert.equal(messageOf(null), 'null');
  });

  it("an Error whose message was deleted reads Error.prototype's message", () => {
    const error = new Error('gone');
    Reflect.deleteProperty(error, 'message');
    assert.equal(messageOf(error), '');
  });
});

describe('assertThrows', () => {
  it('no throw fails', () => {
    refuses(() => assertThrows(() => 1), 'did not throw');
  });

  it('absent expectation accepts any throw', () => {
    assertThrows(thrower(new Error('x')));
    assertThrows(thrower('a string'));
    assertThrows(thrower(undefined));
  });

  it('a string expectation is a substring of the message', () => {
    assertThrows(thrower(new Error('the long message')), 'long');
    refuses(
      () => assertThrows(thrower(new Error('the message')), 'other'),
      'other',
    );
  });

  it('a RegExp is tested against the message, never String(error)', () => {
    assertThrows(thrower(new Error('abc')), /b/);
    class NamedOnly extends Error {
      override name = 'NamedOnly';
    }
    // String(error) is "NamedOnly: abc"; the message is "abc".
    refuses(
      () => assertThrows(thrower(new NamedOnly('abc')), /NamedOnly/),
      'NamedOnly',
    );
  });

  it('a class expectation is instanceof', () => {
    assertThrows(thrower(new Custom('x')), Custom);
    assertThrows(thrower(new Custom('x')), Error);
    refuses(
      () => assertThrows(thrower(new Custom('x')), Other),
      'not an instance of Other',
    );
  });

  it('an Error expectation: equal messages', () => {
    assertThrows(thrower(new Error('same')), new Error('same'));
    refuses(
      () =>
        assertThrows(thrower(new Error('same and more')), new Error('same')),
      'the message',
    );
  });

  it("an Error expectation: message and cause serialised as Jest's createMessageAndCause", () => {
    // Same message, causes that differ: refused on the cause.
    refuses(
      () =>
        assertThrows(
          thrower(new Error('m', { cause: new Error('one') })),
          new Error('m', { cause: new Error('two') }),
        ),
      'message and cause',
    );
    // A cause on one side only: refused.
    refuses(
      () =>
        assertThrows(thrower(new Error('m')), new Error('m', { cause: 'c' })),
      'message and cause',
    );
    // Nested causes, equal: accepted; the stacks differ and are left out.
    assertThrows(
      thrower(new Error('m', { cause: new Error('c', { cause: { k: 1 } }) })),
      new Error('m', { cause: new Error('c', { cause: { k: 1 } }) }),
    );
    // Own properties are sorted: the order they were set in does not count.
    const first = Object.assign(new Error('m', { cause: 'c' }), { a: 1, b: 2 });
    const second = Object.assign(new Error('m', { cause: 'c' }), {
      b: 2,
      a: 1,
    });
    assertThrows(thrower(first), second);
    // fileName and lineNumber are left out like the stack.
    const located = Object.assign(new Error('m', { cause: 'c' }), {
      fileName: 'here.js',
      lineNumber: 3,
    });
    assertThrows(thrower(located), new Error('m', { cause: 'c' }));
    // A circular reference is dropped, not a failure.
    const loop: Record<string, unknown> = { k: 1 };
    loop.self = loop;
    const loopTwin: Record<string, unknown> = { k: 1 };
    loopTwin.self = loopTwin;
    assertThrows(
      thrower(new Error('m', { cause: loop })),
      new Error('m', { cause: loopTwin }),
    );
    // bigint and undefined are serialised as their strings.
    assertThrows(
      thrower(new Error('m', { cause: { n: 10n, u: undefined } })),
      new Error('m', { cause: { n: '10', u: 'undefined' } }),
    );
    refuses(
      () =>
        assertThrows(
          thrower(new Error('m', { cause: { n: 10n } })),
          new Error('m', { cause: { n: 11n } }),
        ),
      'message and cause',
    );
  });

  it('an Error expectation: a non-Error-named constructor requires instanceof', () => {
    assertThrows(thrower(new Custom('m')), new Custom('m'));
    refuses(
      () => assertThrows(thrower(new Other('m')), new Custom('m')),
      'not an instance of Custom',
    );
    // An expected plain Error accepts a subclass with the same message,
    // and an Error of another realm.
    assertThrows(thrower(new Custom('m')), new Error('m'));
    const foreign: unknown = vm.runInNewContext("new Error('m')");
    assertThrows(thrower(foreign), new Error('m'));
    // A thrown value that is not error-like (no name, no stack) is not held
    // to the constructor, as Jest's isError reading leaves it.
    assertThrows(thrower({ message: 'm' }), new Custom('m'));
  });

  it('returns the thrown value', () => {
    const error = new Error('x');
    assert.equal(assertThrows(thrower(error)), error);
    assert.equal(assertThrows(thrower('s')), 's');
  });
});

describe('assertRejects', () => {
  it('a fulfilment fails', async () => {
    await refusesAsync(assertRejects(Promise.resolve('ok')), 'fulfilled');
  });

  it('assertRejects fails on a non-Error reason even when the text matches', async () => {
    await refusesAsync(
      assertRejects(Promise.reject('boom'), 'boom'),
      'not an Error',
    );
    await refusesAsync(
      assertRejects(Promise.reject({ message: 'boom' }), 'boom'),
      'not an Error',
    );
  });

  it('expectations as assertThrows', async () => {
    await assertRejects(Promise.reject(new Custom('the text')), 'text');
    await assertRejects(Promise.reject(new Custom('the text')), /t+ext/);
    await assertRejects(Promise.reject(new Custom('the text')), Custom);
    await assertRejects(
      Promise.reject(new Custom('the text')),
      new Custom('the text'),
    );
    await refusesAsync(assertRejects(Promise.reject(new Error('a')), 'b'), 'b');
    await refusesAsync(
      assertRejects(Promise.reject(new Error('a')), Custom),
      'Custom',
    );
  });

  it('returns the reason', async () => {
    const error = new Error('r');
    assert.equal(await assertRejects(Promise.reject(error)), error);
  });
});

describe('rejectionOf', () => {
  it('returns any reason, primitives included', async () => {
    assert.equal(await rejectionOf(Promise.reject('text')), 'text');
    assert.equal(await rejectionOf(Promise.reject(undefined)), undefined);
    const error = new Error('e');
    assert.equal(await rejectionOf(Promise.reject(error)), error);
  });

  it('a fulfilment fails', async () => {
    await refusesAsync(rejectionOf(Promise.resolve(3)), 'fulfilled');
  });
});

describe('assertNoProperty', () => {
  it('passes for an object without the key', () => {
    assertNoProperty({ a: 1 }, 'b');
  });

  it('fails for an undefined value, as Jest does', () => {
    refuses(() => assertNoProperty(undefined, 'b'), 'undefined');
  });

  it('fails for a null value, as Jest does', () => {
    refuses(() => assertNoProperty(null, 'b'), 'null');
  });

  it('fails for an own key', () => {
    refuses(() => assertNoProperty({ b: 1 }, 'b'), "'b'");
  });

  it('fails for an own key whose value is undefined', () => {
    refuses(() => assertNoProperty({ b: undefined }, 'b'), "'b'");
  });

  it('fails for an inherited key, Object.prototype members included', () => {
    refuses(() => assertNoProperty(Object.create({ b: 1 }), 'b'), "'b'");
    refuses(() => assertNoProperty({}, 'toString'), "'toString'");
  });

  it("reads a primitive's members by bracket access, as Jest does", () => {
    refuses(() => assertNoProperty('abc', 'length'), "'length'");
    assertNoProperty('abc', 'b');
  });
});
