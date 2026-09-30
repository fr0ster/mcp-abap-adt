import type { HandlerEntry } from '../../interfaces.js';
import type { IReadOnlyDedupStrategy } from './IReadOnlyDedupStrategy.js';

/**
 * Null strategy — never excludes anything. Useful when the caller wants to
 * expose the readonly group as-is regardless of other groups present.
 *
 * A readonly tool that shares its exact name with a tool of another exposed
 * group is still withheld — by `ReadOnlyHandlersGroup` itself, not by a
 * strategy — because one server cannot register two tools under one name.
 */
export class NoDedupStrategy implements IReadOnlyDedupStrategy {
  shouldExclude(
    _entry: HandlerEntry,
    _overridingToolNames: ReadonlySet<string>,
  ): boolean {
    return false;
  }
}
