/**
 * What is wrong with an exposition of the full tool set, in fixed words, or
 * undefined when nothing is.
 *
 * Rules:
 * - `compact` is no longer served from here. The compact facade is a package of
 *   its own (`@mcp-abap-adt/compact`), so the value is recognised and refused with
 *   that pointer rather than silently ignored — a configuration that asks for a
 *   tool list it will not get should say so at startup.
 * - `high` and `low` are mutually exclusive.
 */
export function expositionProblem(
  exposition: readonly string[],
): string | undefined {
  const set = new Set(exposition);

  if (set.has('compact')) {
    return (
      "Invalid exposition: 'compact' is served by @mcp-abap-adt/compact, which is " +
      'its own command with the compact tool list as its default. Install it and ' +
      'run `mcp-abap-adt-compact`, or drop `compact` from this exposition.'
    );
  }

  if (set.has('high') && set.has('low')) {
    return `Invalid exposition: 'high' and 'low' are mutually exclusive`;
  }
  return undefined;
}

/** Validates an exposition array and throws on disallowed combinations ({@link expositionProblem}). */
export function validateExposition(exposition: readonly string[]): void {
  const problem = expositionProblem(exposition);
  if (problem !== undefined) throw new Error(problem);
}
