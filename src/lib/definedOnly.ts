/**
 * The entries of `value` whose value is not `undefined`.
 *
 * For options handed to a member that merges them over its own defaults —
 * `{ ...DEFAULTS, ...options }`. There a key present with `undefined` is not
 * "not given": it REPLACES the default. The profiler parameters lost
 * `maxSizeForTraceFile: 30720` exactly that way, the size then left the
 * request altogether, and every trace on E19 (2026-09-25) was recorded in
 * state "Size violation". An option the caller did not give must not reach
 * the member at all.
 */
export function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
