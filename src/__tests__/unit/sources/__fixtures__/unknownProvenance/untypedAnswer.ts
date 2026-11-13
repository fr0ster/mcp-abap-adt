// A library call answering `any` (`JSON.parse`, an XML parser's `parse`):
// taken as `unknown` where it is made, never typed by a claim.
export interface Named {
  readonly name: string;
}

/** Refused: the parse is typed by the declaration it lands in, unchecked. */
export function claimed(text: string): Named {
  return JSON.parse(text);
}

/** Refused: held untyped, its members read as `any`. */
export function heldUntyped(text: string): string {
  const parsed = JSON.parse(text);
  return parsed.name;
}

/** Passes: taken as `unknown`, then read in plain code. */
export function taken(text: string): string {
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'string' ? parsed : '';
}

function describe(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Passes: handed to a parameter typed `unknown`. */
export function handed(text: string): string {
  return describe(JSON.parse(text));
}

/** Refused: `satisfies` checks against `unknown` but leaves the parse `any`. */
export function satisfied(text: string): string {
  const parsed = JSON.parse(text) satisfies unknown;
  return parsed.name;
}

/** Passes: `satisfies` inside a declaration typed `unknown`. */
export function satisfiedAndTaken(text: string): string {
  const parsed: unknown = JSON.parse(text) satisfies unknown;
  return typeof parsed === 'string' ? parsed : '';
}
