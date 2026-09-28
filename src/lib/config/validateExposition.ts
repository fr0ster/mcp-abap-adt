import type { HandlerSet } from './IServerConfig.js';

/**
 * Validates an exposition array and throws on disallowed combinations.
 *
 * Rules:
 * - `compact` is no longer served from here. The compact facade is a package of
 *   its own (`@mcp-abap-adt/compact`), so the value is recognised and refused with
 *   that pointer rather than silently ignored — a configuration that asks for a
 *   tool list it will not get should say so at startup.
 * - `high` and `low` are mutually exclusive.
 */
export function validateExposition(exposition: readonly HandlerSet[]): void {
  const set = new Set(exposition);

  if (set.has('compact')) {
    throw new Error(
      "Invalid exposition: 'compact' is served by @mcp-abap-adt/compact, which is " +
        'its own command with the compact tool list as its default. Install it and ' +
        'run `mcp-abap-adt-compact`, or drop `compact` from this exposition.',
    );
  }

  if (set.has('high') && set.has('low')) {
    throw new Error(
      `Invalid exposition: 'high' and 'low' are mutually exclusive`,
    );
  }
}
