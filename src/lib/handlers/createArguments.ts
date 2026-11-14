/**
 * A create tool's arguments (the owner, 24.0.0): a strict object, so an
 * argument the schema does not declare is refused by the parse — before any
 * request — and the refusal names it as not an argument of the tool, where a
 * plain object would drop it without a word. The create tools only: every
 * other tool keeps the default, which drops an undeclared key.
 */
import * as z from 'zod';

/** The refusal of `keys`, which `tool` does not take. */
export function notArgumentsOf(keys: readonly string[], tool: string): string {
  return keys.length === 1
    ? `${keys[0]} is not an argument of ${tool}`
    : `${keys.join(', ')} are not arguments of ${tool}`;
}

/** `shape` as `tool`'s strict arguments: an undeclared key refused, named. */
export function createArguments<T extends z.core.$ZodShape>(
  tool: string,
  shape: T,
) {
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? notArgumentsOf(issue.keys, tool)
        : undefined,
  });
}
