/**
 * A name as the server reads and sends it: trimmed and upper-cased; a blank
 * one is not given. The access check reads a call's names through it, and a
 * handler that sends a checked name sends what it returns, so the check and
 * the request name the same object.
 */
export function givenName(value: string): string | undefined {
  const text = value.trim();
  return text.length === 0 ? undefined : text.toUpperCase();
}
