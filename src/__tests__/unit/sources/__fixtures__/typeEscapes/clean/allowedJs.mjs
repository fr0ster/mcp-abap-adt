// JSDoc that types a declaration, and a const assertion: no claim on a value.
/** @param {string} value */
export function lengthOf(value) {
  /** @type {number} */
  const length = value.length;
  return length;
}

export const MODES = /** @type {const} */ (['a', 'b']);
