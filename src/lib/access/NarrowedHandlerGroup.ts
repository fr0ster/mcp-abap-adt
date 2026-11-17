/**
 * A handler group with the deny list applied: the inner group's entries
 * the denied actions leave, narrowed where a value was denied. It is a
 * `BaseHandlerGroup` on the inner group's context, so it states, lists and
 * registers exactly as the inner group does.
 */
import { BaseHandlerGroup } from '../handlers/base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../handlers/interfaces.js';

export class NarrowedHandlerGroup extends BaseHandlerGroup {
  protected groupName: string;
  private readonly entries: HandlerEntry[];

  constructor(inner: BaseHandlerGroup, entries: readonly HandlerEntry[]) {
    super(inner.groupContext());
    this.groupName = inner.getName();
    this.entries = [...entries];
  }

  getHandlers(): HandlerEntry[] {
    return [...this.entries];
  }
}
