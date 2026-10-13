/**
 * The groups of the full tool set for an exposition: the group building every
 * launcher shares (core, http, sse) through `fullToolSet`
 * (`@mcp-abap-adt/lib/tool-set`), so none copies it and none imports another's.
 */

import type { HandlerSet } from '../../config/IServerConfig.js';
import { BackgroundRunHandlersGroup } from '../groups/BackgroundRunHandlersGroup.js';
import { DebugHandlersGroup } from '../groups/DebugHandlersGroup.js';
import { HighLevelHandlersGroup } from '../groups/HighLevelHandlersGroup.js';
import { LeftoverSessionHandlersGroup } from '../groups/LeftoverSessionHandlersGroup.js';
import { ReadOnlyHandlersGroup } from '../groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from '../groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from '../groups/SystemHandlersGroup.js';
import { ReadVsGetDedupStrategy } from '../groups/strategies/index.js';
import type { HandlerContext, IHandlerGroup } from '../interfaces.js';
import { CompositeHandlersRegistry } from './CompositeHandlersRegistry.js';

/** The context a registry is built against before any connection exists. */
export function noConnectionContext(): HandlerContext {
  return {
    connection: undefined as never,
    logger: undefined,
  } satisfies HandlerContext;
}

/**
 * The groups for `exposition`, built against `baseContext`: the non-readonly
 * groups first, so their tool names feed the readonly dedup
 * (`ReadVsGetDedupStrategy`), then the readonly and system groups (with the
 * background-run tools beside the run tools), the others, search, and the
 * leftover-session tools — in registration order.
 */
export function expositionGroups(
  exposition: readonly string[],
  baseContext: HandlerContext,
): IHandlerGroup[] {
  const overridingGroups: IHandlerGroup[] = [];
  if (exposition.includes('high')) {
    overridingGroups.push(new HighLevelHandlersGroup(baseContext));
  }
  if (exposition.includes('debug')) {
    overridingGroups.push(new DebugHandlersGroup(baseContext));
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
    // Beside the run tools (RuntimeRunClass, RuntimeRunProgram): their
    // background runs, read, listed and discarded.
    handlerGroups.push(new BackgroundRunHandlersGroup(baseContext));
  }
  handlerGroups.push(...overridingGroups);
  handlerGroups.push(new SearchHandlersGroup(baseContext));
  // Every exposition: the user's own leftover sessions, listed and logged
  // off; resumed only where writes are served (high).
  handlerGroups.push(
    new LeftoverSessionHandlersGroup(baseContext, {
      resume: exposition.includes('high'),
    }),
  );
  return handlerGroups;
}

/** The registry of {@link expositionGroups}, against a context with no connection. */
export function registryForExposition(
  exposition: readonly HandlerSet[],
): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry(
    expositionGroups(exposition, noConnectionContext()),
  );
}
