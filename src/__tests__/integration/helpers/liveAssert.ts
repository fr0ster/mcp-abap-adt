/**
 * The two comparisons the live suites made with Jest's `toEqual` and
 * `toMatchObject`, kept as they were when the suites moved to
 * `node:assert/strict` (D27): a moved test asserts what it asserted before.
 *
 * - `assertEquals(actual, expected)` — Jest's `toEqual`: recursive
 *   equality, a property whose value is `undefined` counts as absent, and an
 *   object's class is not compared.
 * - `assertMatches(actual, expected)` — Jest's `toMatchObject`: every
 *   property `expected` names is equal in `actual` (objects compared the
 *   same way, recursively; an array element by element, its length too), and
 *   `actual` may hold more.
 *
 * `isUpperHex` replaces the one pattern the suites matched a value with
 * (`/^[0-9A-F]{32}$/`, a state handle), in plain code.
 *
 * Uses no test runner.
 */
import assert from 'node:assert/strict';

/** A value's own enumerable properties whose value is not `undefined`. */
function definedEntries(value: object): Array<[string, unknown]> {
  return Object.entries(value).filter(([, member]) => member !== undefined);
}

/** Whether `actual` equals `expected`, `toEqual`'s way (`subset`: `toMatchObject`'s). */
function equals(actual: unknown, expected: unknown, subset: boolean): boolean {
  if (Object.is(actual, expected)) return true;
  if (
    typeof actual !== 'object' ||
    typeof expected !== 'object' ||
    actual === null ||
    expected === null
  ) {
    return false;
  }
  if (actual instanceof Date || expected instanceof Date) {
    return (
      actual instanceof Date &&
      expected instanceof Date &&
      actual.getTime() === expected.getTime()
    );
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((item, at) => equals(item, expected[at], subset))
    );
  }
  const wanted = definedEntries(expected);
  if (!subset && definedEntries(actual).length !== wanted.length) return false;
  return wanted.every(
    ([key, member]) =>
      key in actual && equals(Reflect.get(actual, key), member, subset),
  );
}

/** `actual` equals `expected` as Jest's `toEqual` compared them. */
export function assertEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  if (!equals(actual, expected, false)) {
    assert.fail(
      `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}${message === undefined ? '' : `\n${message}`}`,
    );
  }
}

/** `actual` holds `expected` as Jest's `toMatchObject` compared them. */
export function assertMatches(actual: unknown, expected: unknown): void {
  if (!equals(actual, expected, true)) {
    assert.fail(
      `expected ${JSON.stringify(actual)} to match ${JSON.stringify(expected)}`,
    );
  }
}

/** The hexadecimal digits of a state handle, upper case. */
const UPPER_HEX = '0123456789ABCDEF';

/** Whether `text` is `length` upper-case hexadecimal digits (a state handle's form). */
export function isUpperHex(text: unknown, length: number): boolean {
  return (
    typeof text === 'string' &&
    text.length === length &&
    [...text].every((character) => UPPER_HEX.includes(character))
  );
}

/** A value's text member `key`; `undefined` when it holds no text there. */
export function memberText(value: unknown, key: string): string | undefined {
  const member: unknown =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, key)
      : undefined;
  return typeof member === 'string' ? member : undefined;
}
