/**
 * A read parameter's value as its row's kind types it.
 *
 * `readParameters` answers every row's value under its key, as a
 * `ParameterValue` (a text, a number, a flag or a list): the union, since a
 * table is data. Each reader narrows it to what its row reads into — a
 * `string` row a text, a `port` row a number, a `flag` row a boolean, a
 * `list` row a list, an `enum` row one of its words — and answers
 * `undefined` for a value of another kind or none.
 */
import type { ParameterValue } from './authParameters.js';

/** A `string` row's value. */
export function textValue(
  value: ParameterValue | undefined,
): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A `port` row's (or a number-reading custom row's) value. */
export function numberValue(
  value: ParameterValue | undefined,
): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** A `flag` row's value. */
export function flagValue(
  value: ParameterValue | undefined,
): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** A `list` row's value, copied. */
export function listValue(
  value: ParameterValue | undefined,
): string[] | undefined {
  return typeof value === 'object' ? [...value] : undefined;
}

/** An `enum` row's value: the word of `words` it is. */
export function wordValue<T extends string>(
  value: ParameterValue | undefined,
  words: readonly T[],
): T | undefined {
  return words.find((word) => word === value);
}
