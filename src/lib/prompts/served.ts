/**
 * The types a prompt serves, and the match of a user's `object_type` against
 * them: in any case, through the served map alone.
 */
import type { CompactObjectType } from '../compact/compactObjectTypes.js';

/** A type an operation serves, and the row it is served by. */
export interface ServedType {
  readonly type: CompactObjectType;
  readonly row: 'full' | 'compact';
}

/**
 * The served value `value` names, matched in lowercase through `served`
 * (lowercase keys): `undefined` for anything the map does not hold.
 */
export function matchServed<T extends string>(
  value: string,
  served: ReadonlyMap<string, T>,
): T | undefined {
  return served.get(value.toLowerCase());
}

/**
 * `values` keyed by their lowercase form: the map `matchServed` reads, so a
 * closed set of values is accepted in any case and answered as listed.
 */
export function lowercaseKeyed<T extends string>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.toLowerCase(), value]));
}

/**
 * An argument as given: `undefined` when absent, empty or blank, else its
 * value trimmed.
 */
export function requiredArgument(
  args: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  const value = args[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}
