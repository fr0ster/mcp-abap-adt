import type { HandlerEntry } from '../../interfaces.js';
import type { IReadOnlyDedupStrategy } from './IReadOnlyDedupStrategy.js';

/**
 * Excludes a readonly `Read<X>` handler when a corresponding `Get<X>` handler
 * is contributed by another group (HighLevel) or when the HighLevel/LowLevel
 * groups otherwise provide a semantic replacement.
 *
 * Standalone `Get*` / `List*` readonly handlers (e.g. GetEnhancements,
 * ListTransports) are never excluded — they have no pair in other groups.
 */
export class ReadVsGetDedupStrategy implements IReadOnlyDedupStrategy {
  shouldExclude(
    entry: HandlerEntry,
    overridingToolNames: ReadonlySet<string>,
  ): boolean {
    const name = entry.toolDefinition.name;
    if (!name.startsWith('Read')) return false;
    const getName = 'Get' + name.slice('Read'.length);
    return overridingToolNames.has(getName);
  }
}
