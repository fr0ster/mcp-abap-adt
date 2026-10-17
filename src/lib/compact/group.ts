/**
 * The compact facade, composed of its halves' entry builders.
 *
 * The halves are packages of their own — `@mcp-abap-adt/compact-readonly-entries` and
 * `@mcp-abap-adt/compact-modify` — so that a consumer can import the capability
 * it means to hand out, and they depend on lib. So lib cannot import them: the
 * group takes their ENTRY BUILDERS (`compactReadOnlyEntries`,
 * `compactModifyEntries`), and each compact package hands them in through
 * `compactToolSetOf` (`@mcp-abap-adt/lib/tool-set`). One implementation
 * for the three compact binaries, none of which may take it from another.
 *
 * **It composes the entry builders, not group instances.** The launcher sets the
 * context on the group that owns an entry, once per request; a child group
 * constructed here would hold the context that existed when the list was built,
 * and its handlers would run against a stale connection or the `null` a server
 * holds before it has connected. Passing `() => this.context` makes every
 * handler read THIS group's context at call time.
 */
import { BaseHandlerGroup } from '../handlers/base/BaseHandlerGroup';
import type { HandlerContext, HandlerEntry } from '../handlers/interfaces';

/** A half's entry builder: its tools, each reading the context at call time. */
export type CompactEntryBuilder = (
  getContext: () => HandlerContext,
) => HandlerEntry[];

export class CompactHandlersGroup extends BaseHandlerGroup {
  protected groupName: string;

  /**
   * @param builders the halves served, in order
   * @param groupName `CompactHandlers` for both halves (the compact
   *   binaries), `CompactReadOnlyHandlers` for the read-only one (the
   *   compact `-ro` binaries)
   */
  constructor(
    context: HandlerContext,
    private readonly builders: readonly CompactEntryBuilder[],
    groupName = 'CompactHandlers',
  ) {
    super(context);
    this.groupName = groupName;
  }

  getHandlers(): HandlerEntry[] {
    const context = () => this.context;
    return this.builders.flatMap((build) => build(context));
  }
}
