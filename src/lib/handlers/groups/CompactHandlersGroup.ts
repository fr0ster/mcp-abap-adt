/**
 * The whole compact facade: the read-only half plus the modifying half.
 *
 * Kept as one group because that is what a local server offers —
 * `--exposition=compact` gives every access, and choosing less is the CONSUMER's
 * act, made by importing `CompactReadOnlyHandlersGroup` alone rather than by a
 * flag. The tool order is the read-only tools first, then the modifying ones, so a
 * tool list reads in the order of increasing consequence.
 *
 * **It composes the two ENTRY BUILDERS, not two group instances.** `BaseMcpServer`
 * sets the context on the group that owns an entry, once per request; a child group
 * constructed here would hold the context that existed when this list was built,
 * and its handlers would run against a stale connection or the initial `null`
 * (found in review on PR #240). Passing `() => this.context` makes every handler
 * read THIS group's context at call time, which is the one the server updates.
 */
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';
import { compactModifyEntries } from './CompactModifyHandlersGroup.js';
import { compactReadOnlyEntries } from './CompactReadOnlyHandlersGroup.js';

export class CompactHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactHandlers';

  getHandlers(): HandlerEntry[] {
    const context = () => this.context;
    return [
      ...compactReadOnlyEntries(context),
      ...compactModifyEntries(context),
    ];
  }
}
