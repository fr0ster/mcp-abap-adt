/**
 * Reading a free-form `properties` argument — a low-level update's bag of
 * changes, the model's own object, from outside the type system — member by
 * member, as the patch it feeds writes each one.
 */
import { child, type Element, isElement, isList } from './xml/tree';

/** The first of `names` the bag carries (neither `undefined` nor `null`), as given. */
export function given(bag: unknown, ...names: string[]): unknown {
  for (const name of names) {
    const value = child(bag, name);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** A scalar written out: a string as it is, a number or a boolean as text; else none. */
export function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** The first of `names` the bag carries, as text ({@link scalarText}). */
export function givenText(
  bag: unknown,
  ...names: string[]
): string | undefined {
  return scalarText(given(bag, ...names));
}

/** The first of `names` the bag carries, a number as it is, else as text. */
export function givenCount(
  bag: unknown,
  ...names: string[]
): number | string | undefined {
  const value = given(bag, ...names);
  return typeof value === 'number' ? value : scalarText(value);
}

/**
 * The member `name` of the bag where `null` is a value of its own — "clear
 * it": `''` for `null`, text for a scalar, none when absent or not a scalar.
 */
export function clearableText(bag: unknown, name: string): string | undefined {
  const value = child(bag, name);
  return value === null ? '' : scalarText(value);
}

/**
 * The member `name` of the bag as the elements of its list — none when it is
 * not a list (`null` included); `undefined` when absent.
 */
export function givenElements(
  bag: unknown,
  name: string,
): Element[] | undefined {
  const value = child(bag, name);
  if (value === undefined) return undefined;
  return isList(value) ? value.filter(isElement) : [];
}
