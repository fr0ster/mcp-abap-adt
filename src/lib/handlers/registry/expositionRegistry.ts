/**
 * The tool list a standalone binary serves for an exposition: the group
 * building every launcher shares (core, http, sse), so none copies it and
 * none imports another's. A7 turns it into the `ToolSet` contract.
 */

import type { HandlerSet } from '../../config/IServerConfig.js';
import { DebugHandlersGroup } from '../groups/DebugHandlersGroup.js';
import { HighLevelHandlersGroup } from '../groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from '../groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from '../groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from '../groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from '../groups/SystemHandlersGroup.js';
import { ReadVsGetDedupStrategy } from '../groups/strategies/index.js';
import type { HandlerContext, IHandlerGroup } from '../interfaces.js';
import { CompositeHandlersRegistry } from './CompositeHandlersRegistry.js';

export interface ExpositionRegistryOptions {
  /** Groups a command adds to the list (compact's halves), built against the base context. */
  extraGroups?: (context: HandlerContext) => IHandlerGroup[];
  /** Whether the search tools join the list; default yes. */
  includeSearch?: boolean;
}

/**
 * The registry for `exposition`: the non-readonly groups first, so their
 * tool names feed the readonly dedup (`ReadVsGetDedupStrategy`), then the
 * readonly and system groups, the others, and search unless refused.
 */
export function registryForExposition(
  exposition: readonly HandlerSet[],
  options: ExpositionRegistryOptions = {},
): CompositeHandlersRegistry {
  const baseContext = {
    connection: undefined as never,
    logger: undefined,
  } satisfies HandlerContext;

  const overridingGroups: IHandlerGroup[] = [];
  if (exposition.includes('high')) {
    overridingGroups.push(new HighLevelHandlersGroup(baseContext));
  }
  if (exposition.includes('low')) {
    overridingGroups.push(new LowLevelHandlersGroup(baseContext));
  }
  if (exposition.includes('debug')) {
    overridingGroups.push(new DebugHandlersGroup(baseContext));
  }
  for (const group of options.extraGroups?.(baseContext) ?? []) {
    overridingGroups.push(group);
  }

  const overridingToolNames = new Set<string>();
  for (const group of overridingGroups) {
    for (const entry of group.getHandlers()) {
      overridingToolNames.add(entry.toolDefinition.name);
    }
  }

  const handlerGroups: IHandlerGroup[] = [];
  if (exposition.includes('readonly')) {
    handlerGroups.push(
      new ReadOnlyHandlersGroup(
        baseContext,
        overridingToolNames,
        new ReadVsGetDedupStrategy(),
      ),
    );
    handlerGroups.push(new SystemHandlersGroup(baseContext));
  }
  handlerGroups.push(...overridingGroups);
  if (options.includeSearch !== false) {
    handlerGroups.push(new SearchHandlersGroup(baseContext));
  }
  return new CompositeHandlersRegistry(handlerGroups);
}
