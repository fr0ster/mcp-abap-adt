/**
 * A capability a value may have beyond its declared type.
 *
 * The server holds a connection as `IAbapConnection`, the contract every
 * embedder's connection meets; the connections this server builds also have
 * members the contract does not declare (`disconnect`, `sessionCookies`,
 * `getConfig`, …). Whether a given connection has one is not something the
 * compiler can see — an embedder's may not — so it is read here, at run time,
 * and nowhere by assertion.
 */

/** A method as JavaScript calls one: any arguments, an answer of unknown shape. */
export type Method = (...args: unknown[]) => unknown;

/**
 * Whether `value` has a method `name`: a value of any type, its own type
 * kept beside the method found.
 */
export function hasMethod<T, K extends string>(
  value: T,
  name: K,
): value is T & Record<K, Method> {
  return (
    typeof value === 'object' &&
    value !== null &&
    name in value &&
    typeof Reflect.get(value, name) === 'function'
  );
}
