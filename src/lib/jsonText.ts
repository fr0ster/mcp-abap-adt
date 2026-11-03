/**
 * A text read as JSON: a value from outside the type system, `unknown` until
 * it is read by its shape (`isElement`, `isList`, `child`), and `undefined`
 * when the text is no JSON.
 */
export function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
