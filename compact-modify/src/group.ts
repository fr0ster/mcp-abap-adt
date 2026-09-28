/**
 * The compact tools that change the system, or run code on it — nine of the
 * twenty-two.
 *
 * The other half of the capability split described in
 * `CompactReadOnlyHandlersGroup`. Everything here either writes to the repository
 * (`HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerActivate`,
 * `HandlerTransportCreate`), takes an enqueue (`HandlerLock`, `HandlerUnlock` — a
 * lock changes state and blocks other users), or executes ABAP and leaves traces
 * (`HandlerUnitTestRun`, `HandlerProfileRun`).
 *
 * A consumer that wants the whole compact surface takes this group beside the
 * read-only one, which is what `CompactHandlersGroup` does and what
 * `--exposition=compact` serves.
 */

import type { HandlerContext, HandlerEntry } from '@mcp-abap-adt/lib/handlers';
import { BaseHandlerGroup } from '@mcp-abap-adt/lib/handlers';
import {
  TOOL_DEFINITION as HandlerActivate_Tool,
  handleHandlerActivate,
} from './handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as HandlerCreate_Tool,
  handleHandlerCreate,
} from './handlers/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerDelete_Tool,
  handleHandlerDelete,
} from './handlers/handleHandlerDelete';
import {
  TOOL_DEFINITION as HandlerLock_Tool,
  handleHandlerLock,
} from './handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerProfileRun_Tool,
  handleHandlerProfileRun,
} from './handlers/handleHandlerProfileRun';
import {
  TOOL_DEFINITION as HandlerTransportCreate_Tool,
  handleHandlerTransportCreate,
} from './handlers/handleHandlerTransportCreate';
import {
  TOOL_DEFINITION as HandlerUnitTestRun_Tool,
  handleHandlerUnitTestRun,
} from './handlers/handleHandlerUnitTestRun';
import {
  TOOL_DEFINITION as HandlerUnlock_Tool,
  handleHandlerUnlock,
} from './handlers/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate_Tool,
  handleHandlerUpdate,
} from './handlers/handleHandlerUpdate';

/**
 * The entries, built against a LIVE context rather than a snapshot.
 *
 * Same contract as the read-only half: the context is read per call, from
 * whichever group owns the entry. See `compactReadOnlyEntries` for why a snapshot
 * is wrong.
 */
export function compactModifyEntries(
  getContext: () => HandlerContext,
): HandlerEntry[] {
  const withContext = <TArgs, TResult>(
    handler: (context: HandlerContext, args: TArgs) => TResult,
  ) => {
    return (args: unknown) => handler(getContext(), args as TArgs);
  };

  return [
    {
      toolDefinition: HandlerCreate_Tool,
      handler: withContext(handleHandlerCreate),
    },
    {
      toolDefinition: HandlerUpdate_Tool,
      handler: withContext(handleHandlerUpdate),
    },
    {
      toolDefinition: HandlerDelete_Tool,
      handler: withContext(handleHandlerDelete),
    },
    {
      toolDefinition: HandlerActivate_Tool,
      handler: withContext(handleHandlerActivate),
    },
    {
      toolDefinition: HandlerTransportCreate_Tool,
      handler: withContext(handleHandlerTransportCreate),
    },
    {
      toolDefinition: HandlerLock_Tool,
      handler: withContext(handleHandlerLock),
    },
    {
      toolDefinition: HandlerUnlock_Tool,
      handler: withContext(handleHandlerUnlock),
    },
    {
      toolDefinition: HandlerUnitTestRun_Tool,
      handler: withContext(handleHandlerUnitTestRun),
    },
    {
      toolDefinition: HandlerProfileRun_Tool,
      handler: withContext(handleHandlerProfileRun),
    },
  ];
}

export class CompactModifyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactModifyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactModifyEntries(() => this.context);
  }
}
