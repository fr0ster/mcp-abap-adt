import type { HandlerEntry } from '../../interfaces.js';
import type { IReadOnlyDedupStrategy } from './IReadOnlyDedupStrategy.js';

/**
 * Null strategy — never excludes anything. Useful when the caller wants to
 * expose the readonly group as-is regardless of other groups present.
 */
export class NoDedupStrategy implements IReadOnlyDedupStrategy {
  shouldExclude(
    _entry: HandlerEntry,
    _overridingToolNames: ReadonlySet<string>,
  ): boolean {
    return false;
  }
}
