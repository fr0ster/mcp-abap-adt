/**
 * Reading a thrown value — what a `catch` binding or a rejection handler
 * holds, or a failure slot keeps beside our own `Error` — by its members:
 * outside the type system, read field by field. Each reader is a reader of
 * thrown values (`THROWN_READERS`, `docs/development/CODE_GATES.md`); a value
 * of any other source is read by its own type. Each predicate checks what
 * it claims: `Array.isArray` and `Object.entries` are read here, never on
 * `unknown` elsewhere.
 */

/** An object a thrown value holds: never an array, keyed by name. */
export interface Element {
  readonly [name: string]: unknown;
}

/** Whether `value` is an element: a non-null object that is not an array. */
export function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `value` is an array. */
export function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** `value` as a list: an array as it is, `undefined` and `null` as none, anything else alone. */
export function listOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** The member `name` of `value` when it is an element, else `undefined`. */
export function child(value: unknown, name: string): unknown {
  return isElement(value) ? value[name] : undefined;
}

/** The member at `path` under `value`: each step a {@link child}. */
export function childAt(value: unknown, ...path: string[]): unknown {
  let node = value;
  for (const name of path) node = child(node, name);
  return node;
}

/**
 * The attribute `name` of `value`: the member so named (the caller's parser
 * decides its prefix) when it is a string, a number or a boolean, written
 * out; else `undefined`.
 */
export function attr(value: unknown, name: string): string | undefined {
  const member = child(value, name);
  if (typeof member === 'string') return member;
  if (typeof member === 'number' || typeof member === 'boolean') {
    return String(member);
  }
  return undefined;
}

/** The members of `value` when it is an element, in their order; else none. */
export function entries(value: unknown): Array<[string, unknown]> {
  return isElement(value) ? Object.entries(value) : [];
}
