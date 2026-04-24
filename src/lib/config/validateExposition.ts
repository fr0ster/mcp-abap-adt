import type { HandlerSet } from './IServerConfig.js';

/**
 * Validates an exposition array and throws on disallowed combinations.
 *
 * Rules:
 * - `compact` is exposed only by itself. It cannot be combined with any other set.
 * - `high` and `low` are mutually exclusive.
 */
export function validateExposition(exposition: readonly HandlerSet[]): void {
  const set = new Set(exposition);

  if (set.has('compact') && set.size > 1) {
    const others = [...set].filter((s) => s !== 'compact').join(', ');
    throw new Error(
      `Invalid exposition: 'compact' must be exposed alone, but also found: ${others}`,
    );
  }

  if (set.has('high') && set.has('low')) {
    throw new Error(
      `Invalid exposition: 'high' and 'low' are mutually exclusive`,
    );
  }
}
