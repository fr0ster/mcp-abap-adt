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
}

/** The purpose sentence of a tool: what it does, in domain words. */
export function purpose(text: string): Purpose {
  return { [minted]: true, text };
}
