/**
 * Jest's object and throw matchers on `node:assert` (spec §3.8): what the
 * node:test move puts in place of `toMatchObject`, `toThrow`,
 * `.rejects.toThrow` and a bare `.rejects`. Runner-neutral: it imports only
 * `node:assert` and `node:util`, and a failure is an `AssertionError`.
 *
 * Each clause follows Jest 30.5.2's own code (`expect`'s `toThrowMatchers`:
 * `getThrown`, `toThrowExpectedObject`, `createMessageAndCause`; and
 * `toMatchObject`'s subset equality) and is proven by a case of its own in
 * `unit/testHelpers/assertions.test.ts`. A thrown value or a rejection
 * reason comes from outside the type system, so it is `unknown` here and
 * read at run time.
 */
import assert from 'node:assert/strict';
import { inspect, isDeepStrictEqual } from 'node:util';

/** What a thrown value is checked against: Jest's `toThrow` argument. */
export type ThrowExpectation =
  | string
  | RegExp
  | (abstract new (
      ...a: never[]
    ) => unknown)
  | Error;

/** A value's text in a failure message. */
const shown = (value: unknown): string => inspect(value, { depth: 4 });

function fail(
  message: string,
  actual: unknown,
  expected: unknown,
  operator: string,
): never {
  throw new assert.AssertionError({ message, actual, expected, operator });
}

/**
 * Jest's `expect(value).not.toHaveProperty(key)` for a one-segment key
 * (`@jest/expect-utils` `getPath`).
 * - An undefined or null value is refused outright, as Jest refuses it, so
 *   an absent value never passes.
 * - Otherwise the value has the key when `value[key]` is not undefined, or,
 *   for a non-primitive value, when `key in value`. Inherited members count,
 *   and so does an own key whose value is undefined.
 */
export function assertNoProperty(value: unknown, key: string): void {
  if (value === undefined || value === null) {
    fail(
      `expected a value without the property ${shown(key)}, received ${shown(value)}`,
      value,
      key,
      'not.toHaveProperty',
    );
  }
  const boxed: object = Object(value);
  const primitive = typeof value !== 'object' && typeof value !== 'function';
  if (
    Reflect.get(boxed, key) !== undefined ||
    (!primitive && Reflect.has(boxed, key))
  ) {
    fail(
      `expected no property ${shown(key)}, received ${shown(value)}`,
      value,
      key,
      'not.toHaveProperty',
    );
  }
}

/**
 * The message of a thrown value, as Jest reads it (`getThrown`): its
 * `message` when that is a string — an own or an inherited one —, else
 * `String(value)`.
 */
export function messageOf(value: unknown): string {
  if (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
  ) {
    if ('message' in value && typeof value.message === 'string') {
      return value.message;
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// assertMatchObject

/** Whether `key` reads as a plain name after a `.`. */
function isPlainName(key: string): boolean {
  if (key === '') return false;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    const letter =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
    const digit = c >= 48 && c <= 57;
    if (!letter && !(i > 0 && digit)) return false;
  }
  return true;
}

function memberPath(path: string, key: string | symbol): string {
  if (typeof key === 'symbol') return `${path}[${String(key)}]`;
  return isPlainName(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

/** An object made by an object literal (or `Object.create(null)`). */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mismatch(path: string, actual: unknown, expected: unknown): never {
  return fail(
    `${path}: expected ${shown(expected)}, received ${shown(actual)}`,
    actual,
    expected,
    'matchObject',
  );
}

function matchAt(path: string, actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    const want: readonly unknown[] = expected;
    if (!Array.isArray(actual) || actual.length !== want.length) {
      mismatch(path, actual, expected);
    }
    const got: readonly unknown[] = actual;
    for (let i = 0; i < want.length; i += 1) {
      matchAt(`${path}[${i}]`, got[i], want[i]);
    }
    return;
  }
  if (expected instanceof Date) {
    if (
      !(actual instanceof Date) ||
      !Object.is(actual.getTime(), expected.getTime())
    ) {
      mismatch(path, actual, expected);
    }
    return;
  }
  if (expected instanceof RegExp) {
    if (
      !(actual instanceof RegExp) ||
      actual.source !== expected.source ||
      actual.flags !== expected.flags
    ) {
      mismatch(path, actual, expected);
    }
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    if (!isPlainObject(expected)) {
      if (!isDeepStrictEqual(actual, expected))
        mismatch(path, actual, expected);
      return;
    }
    if (typeof actual !== 'object' || actual === null) {
      mismatch(path, actual, expected);
    }
    for (const key of Reflect.ownKeys(expected)) {
      if (!Object.prototype.propertyIsEnumerable.call(expected, key)) continue;
      const at = memberPath(path, key);
      if (!(key in actual)) {
        fail(
          `${at}: expected key missing (expected ${shown(Reflect.get(expected, key))}), in ${shown(actual)}`,
          actual,
          expected,
          'matchObject',
        );
      }
      matchAt(at, Reflect.get(actual, key), Reflect.get(expected, key));
    }
    return;
  }
  if (!Object.is(actual, expected)) mismatch(path, actual, expected);
}

/**
 * Jest's `toMatchObject`: every own enumerable key of a plain `expected` is
 * present in `actual` (`in`, the prototype chain included) and matches
 * recursively, other keys of `actual` ignored; an array matches an array of
 * the same length element by element; a `Date` or a `RegExp` by value; any
 * other non-plain object by `isDeepStrictEqual`; a primitive by `Object.is`.
 * A failure names the path (`$.a[2].b`) and both values.
 */
export function assertMatchObject(actual: unknown, expected: unknown): void {
  matchAt('$', actual, expected);
}

// ---------------------------------------------------------------------------
// assertThrows / assertRejects / rejectionOf

/** Jest's `getThrown(…).isError`: a string `message`, `name` and `stack`. */
function looksLikeError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'stack' in value &&
    typeof value.stack === 'string'
  );
}

const isObject = (value: unknown): value is object =>
  value !== null && value !== undefined && typeof value === 'object';

/** Jest's `buildSerializeError`. */
function serializeError(error: unknown): unknown {
  if (!isObject(error)) return error;
  const result: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(error).sort()) {
    if (name === 'stack' || name === 'fileName' || name === 'lineNumber') {
      continue;
    }
    const value: unknown = Reflect.get(error, name);
    result[name] = name === 'cause' ? serializeError(value) : value;
  }
  return result;
}

/**
 * Jest's `createMessageAndCause`: with a truthy `cause`, the error's own
 * properties sorted (`stack`, `fileName`, `lineNumber` left out), `cause`
 * the same way, a circular reference dropped, a `bigint` or `undefined` as
 * its string; without one, its `message`.
 */
function messageAndCause(error: unknown): unknown {
  if (!isObject(error)) return undefined;
  const cause: unknown = Reflect.get(error, 'cause');
  if (cause) {
    const seen = new WeakSet<object>();
    return JSON.stringify(serializeError(error), (_key, value: unknown) => {
      if (isObject(value)) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      if (typeof value === 'bigint' || value === undefined) {
        return String(value);
      }
      return value;
    });
  }
  const message: unknown = Reflect.get(error, 'message');
  return message;
}

function checkThrown(
  value: unknown,
  expected: ThrowExpectation | undefined,
  what: string,
): void {
  if (expected === undefined) return;
  const message = messageOf(value);
  if (typeof expected === 'string') {
    if (!message.includes(expected)) {
      fail(
        `${what} a message without ${shown(expected)}: ${shown(message)}`,
        message,
        expected,
        'includes',
      );
    }
    return;
  }
  if (typeof expected === 'function') {
    if (!(value instanceof expected)) {
      fail(
        `${what} ${shown(value)}, not an instance of ${expected.name}`,
        value,
        expected,
        'instanceof',
      );
    }
    return;
  }
  if (expected instanceof RegExp) {
    if (!expected.test(message)) {
      fail(
        `${what} a message ${shown(expected)} does not match: ${shown(message)}`,
        message,
        expected,
        'match',
      );
    }
    return;
  }
  // An Error: what Jest's `toThrowExpectedObject` compares, all three.
  if (message !== expected.message) {
    fail(
      `${what} the message ${shown(message)}, expected ${shown(expected.message)}`,
      message,
      expected.message,
      'message',
    );
  }
  const thrownMessageAndCause = messageAndCause(value);
  const expectedMessageAndCause = messageAndCause(expected);
  if (thrownMessageAndCause !== expectedMessageAndCause) {
    fail(
      `${what} a message and cause ${shown(thrownMessageAndCause)}, expected ${shown(expectedMessageAndCause)}`,
      thrownMessageAndCause,
      expectedMessageAndCause,
      'messageAndCause',
    );
  }
  const custom = expected.constructor.name !== Error.name;
  if (
    looksLikeError(value) &&
    custom &&
    !(value instanceof expected.constructor)
  ) {
    fail(
      `${what} ${shown(value)}, not an instance of ${expected.constructor.name}`,
      value,
      expected,
      'instanceof',
    );
  }
}

/**
 * Jest's `toThrow`: calls `fn`, fails when it does not throw, checks the
 * thrown value against `expected` and returns it. `expected` absent — any
 * throw; a string — the message includes it; a RegExp — it matches the
 * message (never `String(error)`); a class — `instanceof`; an `Error` —
 * equal messages, equal message and cause, and, for an `Error` of a
 * constructor not named `Error`, an instance of that constructor.
 */
export function assertThrows(
  fn: () => unknown,
  expected?: ThrowExpectation,
): unknown {
  let threw = false;
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    threw = true;
    thrown = error;
  }
  if (!threw) {
    fail('the function did not throw', undefined, expected, 'throws');
  }
  checkThrown(thrown, expected, 'the function threw');
  return thrown;
}

/** Jest's `isError` (`@jest/expect-utils`): what `.rejects.toThrow` accepts. */
function isJestError(value: unknown): value is Error {
  switch (Object.prototype.toString.call(value)) {
    case '[object Error]':
    case '[object Exception]':
    case '[object DOMException]':
      return true;
    default:
      return value instanceof Error;
  }
}

/** The settled outcome of `promise`, its rejection caught. */
async function outcomeOf(
  promise: Promise<unknown>,
): Promise<
  { rejected: true; reason: unknown } | { rejected: false; value: unknown }
> {
  try {
    return { rejected: false, value: await promise };
  } catch (reason) {
    return { rejected: true, reason };
  }
}

/**
 * Jest's bare `.rejects`: the rejection reason, whatever it is; a
 * fulfilment fails.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  const outcome = await outcomeOf(promise);
  if (!outcome.rejected) {
    fail(
      `the promise fulfilled with ${shown(outcome.value)}`,
      outcome.value,
      undefined,
      'rejects',
    );
  }
  return outcome.reason;
}

/**
 * Jest's `.rejects.toThrow`: a fulfilment fails, a reason that is not an
 * `Error` fails (whatever its text), and the reason is checked as
 * `assertThrows` checks a thrown value; returns the reason.
 */
export async function assertRejects(
  promise: Promise<unknown>,
  expected?: ThrowExpectation,
): Promise<Error> {
  const reason = await rejectionOf(promise);
  if (!isJestError(reason)) {
    fail(
      `the promise rejected with ${shown(reason)}, not an Error`,
      reason,
      expected,
      'rejects',
    );
  }
  checkThrown(reason, expected, 'the promise rejected with');
  return reason;
}
