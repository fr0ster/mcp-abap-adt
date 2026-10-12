import { COMPACT_BINARIES, type ServedTransport } from './exposition.js';

const FULL_SETS: readonly string[] = ['readonly', 'high', 'low', 'debug'];

/**
 * What is wrong with an exposition of the full tool set, in fixed words, or
 * undefined when nothing is. The words name the compact binary of
 * `transport` — never another transport's (D49).
 *
 * Rules:
 * - `compact` is not served from here. The compact facade is a package of its
 *   own per transport, so the value is recognised and refused with that pointer
 *   rather than silently ignored — a configuration that asks for a tool list it
 *   will not get should say so at startup.
 * - Any other word outside readonly, high, low, debug is refused, naming the
 *   accepted ones (17.x dropped it: `--exposition=ro` served readonly,high);
 *   compact's `ro` and `rw` also name the compact binary.
 * - `high` and `low` are mutually exclusive.
 */
export function expositionProblem(
  exposition: readonly string[],
  transport: ServedTransport = 'stdio',
): string | undefined {
  const set = new Set(exposition);
  const { bin, pkg } = COMPACT_BINARIES[transport];

  if (set.has('compact')) {
    return (
      `Invalid exposition: 'compact' is served by ${pkg}, which is ` +
      'its own command with the compact tool list as its default. Install it and ' +
      `run \`${bin}\`, or drop \`compact\` from this exposition.`
    );
  }

  for (const word of exposition) {
    if (FULL_SETS.includes(word)) continue;
    const words = `Invalid exposition: '${word}' is not a set of this command, which takes readonly, high, low and debug, comma-separated.`;
    return word === 'ro' || word === 'rw'
      ? `${words} 'ro' and 'rw' are the sets of \`${bin}\` (${pkg}).`
      : words;
  }

  if (set.has('high') && set.has('low')) {
    return `Invalid exposition: 'high' and 'low' are mutually exclusive`;
  }
  return undefined;
}

/** Validates an exposition array and throws on disallowed combinations ({@link expositionProblem}). */
export function validateExposition(
  exposition: readonly string[],
  transport: ServedTransport = 'stdio',
): void {
  const problem = expositionProblem(exposition, transport);
  if (problem !== undefined) throw new Error(problem);
}
