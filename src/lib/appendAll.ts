/**
 * Appends every item of `items` to `target`, one by one. `target.push(...items)`
 * passes the items as arguments, and past the engine's argument limit (about
 * 120 000 in V8) it throws `RangeError`, so a list of no fixed size is never
 * spread into a call.
 */
export function appendAll<T>(
  target: T[],
  items: Iterable<T, void, undefined>,
): void {
  for (const item of items) target.push(item);
}
