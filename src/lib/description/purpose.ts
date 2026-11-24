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

/** `word` with its article: `a class`, `an include`. */
export function withArticle(word: string): string {
  return `${'aeiou'.includes(word.charAt(0).toLowerCase()) ? 'an' : 'a'} ${word}`;
}

/**
 * A compact tool's purpose built from its action and object pairs, one per
 * object type, action or part its schema takes (owner): `Locks or unlocks a
 * class, locks or unlocks a program, … for editing.` — the pairs joined,
 * the first capitalised, then `after`. The pairs are generated from the
 * schema, so the length rule counts them as one word.
 */
export function pairsPurpose(pairs: readonly string[], after = '.'): Purpose {
  const joined = pairs.join(', ');
  const text = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${after}`;
  return { [minted]: true, text, types: joined };
}
