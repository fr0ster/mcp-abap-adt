import type { HandlerEntry } from '../../interfaces.js';

/**
 * Strategy that decides whether a readonly handler entry should be deduped
 * (excluded) from the ReadOnly group when overriding handler groups
 * (high / low / compact) are also exposed.
 *
 * A strategy decides about DIFFERENTLY named tools (e.g. Read<X> vs Get<X>).
 * An identically named tool is not its decision: `ReadOnlyHandlersGroup`
 * always withholds it, so the overriding group's copy is the one exposed.
 */
export interface IReadOnlyDedupStrategy {
  /**
   * @param entry readonly handler entry being considered
   * @param overridingToolNames tool names contributed by non-readonly groups
   * @returns true if the entry should be excluded from the readonly group
   */
  shouldExclude(
    entry: HandlerEntry,
    overridingToolNames: ReadonlySet<string>,
  ): boolean;
}
