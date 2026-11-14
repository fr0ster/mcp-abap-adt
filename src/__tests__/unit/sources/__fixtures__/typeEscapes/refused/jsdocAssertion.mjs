// A JSDoc type assertion in JavaScript: the compiler takes the author's word
// for the type, as `as` does in TypeScript.
export function lengthOf(value) {
  return /** @type {string} */ (value).length;
}
