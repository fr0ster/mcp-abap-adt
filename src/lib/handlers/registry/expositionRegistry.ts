/**
 * The groups of the object-oriented handler sets: `fullToolSet`
 * (`@mcp-abap-adt/lib/tool-set`) builds core's, http's and sse's from
 * `readonly,high,debug`, so none copies it and none imports another's; an
 * embedder may build any other combination.
 */

import type { HandlerSet } from '../../config/IServerConfig.js';
import { BackgroundRunHandlersGroup } from '../groups/BackgroundRunHandlersGroup.js';
import { DebugHandlersGroup } from '../groups/DebugHandlersGroup.js';
import { HighLevelHandlersGroup } from '../groups/HighLevelHandlersGroup.js';
import { LeftoverSessionHandlersGroup } from '../groups/LeftoverSessionHandlersGroup.js';
import { ReadOnlyHandlersGroup } from '../groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from '../groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from '../groups/SystemHandlersGroup.js';
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
 * groups first, so their tool names feed the readonly dedup (a readonly
 * copy of a tool they serve under the same name is withheld), then the readonly and system groups (with the
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
      new ReadOnlyHandlersGroup(baseContext, overridingToolNames),
    );
    handlerGroups.push(new SystemHandlersGroup(baseContext));
    // Beside the run tools (RuntimeRunClass, RuntimeRunProgram): their
    // background runs, read, listed and discarded.
    handlerGroups.push(new BackgroundRunHandlersGroup(baseContext));
  }
  handlerGroups.push(...overridingGroups);
  handlerGroups.push(new SearchHandlersGroup(baseContext));
  // Every exposition: the user's own leftover sessions, listed and logged
  // off.
  handlerGroups.push(new LeftoverSessionHandlersGroup(baseContext));
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
