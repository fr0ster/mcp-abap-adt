/**
 * The whole compact facade: the read-only half plus the modifying half.
 *
 * Kept as one group because that is what a local server offers —
 * `--exposition=compact` gives every access, and choosing less is the CONSUMER's
 * act, made by importing `CompactReadOnlyHandlersGroup` alone rather than by a
 * flag. The tool order is the read-only tools first, then the modifying ones, so
 * a tool list reads in the order of increasing consequence.
 *
 * The two halves exist so that the read-only one can be imported WITHOUT the
 * write routes in its module graph; this class deliberately has both, and that is
 * the difference between a server and a capability.
 */
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';
import { CompactModifyHandlersGroup } from './CompactModifyHandlersGroup.js';
import { CompactReadOnlyHandlersGroup } from './CompactReadOnlyHandlersGroup.js';

export class CompactHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactHandlers';

  getHandlers(): HandlerEntry[] {
    const readOnly = new CompactReadOnlyHandlersGroup(this.context);
    const modifying = new CompactModifyHandlersGroup(this.context);
    return [...readOnly.getHandlers(), ...modifying.getHandlers()];
  }
}
