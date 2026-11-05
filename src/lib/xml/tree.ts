/**
 * Reading parsed documents: what fast-xml-parser or `JSON.parse` answered,
 * which comes from outside the type system and is `unknown` here.
 *
 * Each predicate checks what it claims, and every reader of such a value goes
 * through this module (spec §4): `Array.isArray` and `Object.entries` are read
 * here, never on `unknown` elsewhere.
 */

/** An element of a parsed document: an object (never an array), keyed by name. */
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

/** The elements of `value` read as a list ({@link listOf}); members that are not elements are left out. */
export function elements(value: unknown): Element[] {
  return listOf(value).filter(isElement);
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
 * `value`'s text: a string as it is, a number or a boolean written out, an
 * element's text node (`textNode`, `#text` by default) read so; else
 * `undefined`.
 */
export function text(value: unknown, textNode = '#text'): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isElement(value)) {
    const inner = value[textNode];
    return isElement(inner) ? undefined : text(inner, textNode);
  }
  return undefined;
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

/** A qualified name's local part: what follows its prefix, the name itself without one. */
export function localName(qualified: string): string {
  return qualified.slice(qualified.lastIndexOf(':') + 1);
}

/** A member met by {@link walk}: its name, its value, and the members it sits in, outermost first. */
export interface Visit {
  readonly name: string;
  readonly node: unknown;
  readonly path: readonly Visit[];
}

/**
 * Every member at any depth under `value`, in the order of the value's own
 * members: a member before what it holds, each item of a repeated member on
 * its own. That is document order only as far as the parse kept it — a
 * grouped parse puts same-named siblings together. Members named in `leaves`
 * (an attribute group, say) are met but not entered.
 */
export function walk(
  value: unknown,
  leaves: ReadonlySet<string> = new Set(),
): Visit[] {
  const met: Visit[] = [];
  const enter = (node: unknown, path: readonly Visit[]): void => {
    for (const [name, member] of entries(node)) {
      for (const item of listOf(member)) {
        const visit: Visit = { name, node: item, path };
        met.push(visit);
        if (!leaves.has(name)) enter(item, [...path, visit]);
      }
    }
  };
  enter(value, []);
  return met;
}
