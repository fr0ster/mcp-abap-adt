/**
 * A tool's purpose: one sentence of what the tool does, the description's
 * main part and its only free text. Made only by {@link purpose}; the purpose
 * test (`src/__tests__/unit/descriptions/purpose.test.ts`) holds every
 * registered purpose to its rules (one sentence, its length, no word of the
 * answer's form or of how the tool works).
 */

/** Only this module mints a purpose. */
const minted: unique symbol = Symbol('purpose');

/** A tool's purpose sentence; only {@link purpose} makes one. */
export interface Purpose {
  readonly [minted]: true;
  readonly text: string;
  /**
   * The object types the sentence names, as generated from a compact tool's
   * schema enum: not free text, so the length rule counts them as one word.
   */
  readonly types?: string | undefined;
}

/** The purpose sentence of a tool: what it does, in domain words. */
export function purpose(text: string): Purpose {
  return { [minted]: true, text };
}

/**
 * A purpose naming the object types a compact tool works on, in words —
 * `before`, the types joined with `or`, then `after`: `Updates an ABAP class,
 * program or table, under its lock.`
 */
export function typesPurpose(
  before: string,
  types: readonly string[],
  after: string,
): Purpose {
  const named =
    types.length <= 1
      ? types.join('')
      : `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`;
  return { [minted]: true, text: `${before}${named}${after}`, types: named };
}
