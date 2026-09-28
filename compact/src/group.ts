/**
 * The whole compact facade, composed of its two halves.
 *
 * This group used to live in `lib`, beside every other handler group. It lives here
 * because the halves do: `@mcp-abap-adt/compact-readonly` and
 * `@mcp-abap-adt/compact-modify` are separate packages so that a consumer can
 * import the capability it means to hand out, and the union is what a local command
 * serves — locally the server gives every access, and choosing less is the
 * consumer's act of importing one half rather than a flag someone can pass.
 *
 * **It composes the two ENTRY BUILDERS, not two group instances.** The launcher
 * sets the context on the group that owns an entry, once per request; a child group
 * constructed here would hold the context that existed when the list was built, and
 * its handlers would run against a stale connection or the `null` a server holds
 * before it has connected. Passing `() => this.context` makes every handler read
 * THIS group's context at call time.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly';
import {
  BaseHandlerGroup,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';

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
