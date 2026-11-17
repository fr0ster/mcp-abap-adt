/**
 * The texts of a compact tool that name its members, rendered from the
 * members a deny list left (spec §3.1): a member is left out of a text only
 * when the deny list removed it — the removed members are the variant's full
 * set minus those given — so with nothing removed every text is as written.
 */

/** What is left of a tool's members after the deny list. */
export interface Left {
  /** Whether `member` was not removed. */
  has(member: string): boolean;
  /** The members of `list` not removed, in its order. */
  of<T extends string>(list: readonly T[]): T[];
}

/** The members of `full` the deny list left, given those `left`. */
export function leftOf(full: readonly string[], left: readonly string[]): Left {
  const removed = new Set(full.filter((member) => !left.includes(member)));
  return {
    has: (member) => !removed.has(member),
    of: (list) => list.filter((member) => !removed.has(member)),
  };
}

/** Nothing removed. */
export const NOTHING_REMOVED: Left = leftOf([], []);

/** `A, B and C`. */
export function listed(members: readonly string[]): string {
  if (members.length <= 1) return members.join('');
  return `${members.slice(0, -1).join(', ')} and ${members[members.length - 1]}`;
}

/** `A, B or C`. */
export function either(members: readonly string[]): string {
  if (members.length <= 1) return members.join('');
  return `${members.slice(0, -1).join(', ')} or ${members[members.length - 1]}`;
}

/** `text` when `kept`, else nothing. */
export function when(kept: boolean, text: string): string {
  return kept ? text : '';
}

/**
 * The example codes a text names, of `wanted` those `codes` holds; when it
 * holds none of them, its first `count` codes in table order.
 */
export function exampleCodes(
  wanted: readonly string[],
  codes: readonly string[],
  count: number,
): string[] {
  const kept = wanted.filter((code) => codes.includes(code));
  return kept.length > 0 ? kept : codes.slice(0, count);
}

/** Of `texts` (each a value and its text), the texts of the values `values` holds. */
export function textsOf<V extends string>(
  values: readonly V[],
  texts: ReadonlyArray<readonly [V, string]>,
): string[] {
  return texts
    .filter(([value]) => values.includes(value))
    .map(([, text]) => text);
}
