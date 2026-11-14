/**
 * Reading parsed documents: the typed nodes `xml/node` checked at the parse.
 * A reader takes a node, or none ({@link XmlRead}): a member that is absent
 * (`undefined`), a document that did not parse (`null`). Narrowing is by the
 * union's form, statically: a text value by `typeof`, a list by
 * {@link isList}, an element by {@link isElement}.
 */
import type { XmlElement, XmlList, XmlNode } from './node';

export type { XmlElement, XmlList, XmlNode, XmlText } from './node';

/** A node read from a document, or none: absent (`undefined`), or no document (`null`). */
export type XmlRead = XmlNode | null | undefined;

/** An element of a parsed document ({@link XmlElement}). */
export type Element = XmlElement;

/** Whether `value` is an element: a node that is neither a text value nor a list. */
export function isElement(value: XmlRead): value is XmlElement {
  return typeof value === 'object' && value !== null && !isList(value);
}

/** Whether `value` is a list. */
export function isList(value: XmlRead): value is XmlList {
  return Array.isArray(value);
}

/** `value` as a list: a list as it is, none as none, any other node alone. */
export function listOf(value: XmlRead): XmlList {
  if (value === undefined || value === null) return [];
  if (isList(value)) return value;
  return [value];
}

/** The elements of `value` read as a list ({@link listOf}); members that are not elements are left out. */
export function elements(value: XmlRead): XmlElement[] {
  return listOf(value).filter(isElement);
}

/** The member `name` of `value` when it is an element, else `undefined`. */
export function child(value: XmlRead, name: string): XmlNode | undefined {
  return isElement(value) ? value[name] : undefined;
}

/** The member at `path` under `value`: each step a {@link child}. */
export function childAt(value: XmlRead, ...path: string[]): XmlRead {
  let node = value;
  for (const name of path) node = child(node, name);
  return node;
}

/**
 * `value`'s text: a string as it is, a number or a boolean written out, an
 * element's text node (`textNode`, `#text` by default) read so; else
 * `undefined`.
 */
export function text(value: XmlRead, textNode = '#text'): string | undefined {
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
export function attr(value: XmlRead, name: string): string | undefined {
  const member = child(value, name);
  if (typeof member === 'string') return member;
  if (typeof member === 'number' || typeof member === 'boolean') {
    return String(member);
  }
  return undefined;
}

/** The members of `value` when it is an element, in their order; else none. */
export function entries(value: XmlRead): Array<[string, XmlNode]> {
  return isElement(value) ? Object.entries(value) : [];
}

/** A qualified name's local part: what follows its prefix, the name itself without one. */
export function localName(qualified: string): string {
  return qualified.slice(qualified.lastIndexOf(':') + 1);
}

/** A member met by {@link walk}: its name, its value, and the members it sits in, outermost first. */
export interface Visit {
  readonly name: string;
  readonly node: XmlNode;
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
  value: XmlRead,
  leaves: ReadonlySet<string> = new Set<string>(),
): Visit[] {
  const met: Visit[] = [];
  const enter = (node: XmlRead, path: readonly Visit[]): void => {
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
