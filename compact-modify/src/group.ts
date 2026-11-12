/**
 * The compact tools that change the system, or run code on it — twelve of the
 * twenty-nine.
 *
 * The other half of the capability split described in
 * `CompactReadOnlyHandlersGroup`. Everything here either writes to the repository
 * (`HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerActivate`,
 * `HandlerTransportCreate`, `HandlerTransportSortAndCompress`,
 * `HandlerTransportMoveObjects`), takes an enqueue (`HandlerLock`, `HandlerUnlock` — a
 * lock changes state and blocks other users), or schedules a trace or
 * executes ABAP and leaves traces (`HandlerProfileSchedule`,
 * `HandlerUnitTestRun`, `HandlerProfileRun`).
 *
 * A consumer that wants the whole compact surface takes this group beside the
 * read-only one, which is what `CompactHandlersGroup` does and what the compact
 * binaries serve.
 */

import {
  BaseHandlerGroup,
  defineTool,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
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
  TOOL_DEFINITION as HandlerProfileSchedule_Tool,
  handleHandlerProfileSchedule,
} from './handlers/handleHandlerProfileSchedule';
import {
  TOOL_DEFINITION as HandlerTransportCreate_Tool,
  handleHandlerTransportCreate,
} from './handlers/handleHandlerTransportCreate';
import {
  TOOL_DEFINITION as HandlerTransportMoveObjects_Tool,
  handleHandlerTransportMoveObjects,
} from './handlers/handleHandlerTransportMoveObjects';
import {
  TOOL_DEFINITION as HandlerTransportSortAndCompress_Tool,
  handleHandlerTransportSortAndCompress,
} from './handlers/handleHandlerTransportSortAndCompress';
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
import {
  deleteHeldLockOf,
  unlockHeldLockOf,
  updateHeldLockOf,
} from './handlers/heldLockOf';

/**
 * The entries: each takes the call's context at the call, as the read-only
 * half's do.
 */
export function compactModifyEntries(): HandlerEntry[] {
  return [
    defineTool(HandlerCreate_Tool, handleHandlerCreate),
    {
      ...defineTool(HandlerUpdate_Tool, handleHandlerUpdate),
      heldLockOf: updateHeldLockOf,
    },
    {
      ...defineTool(HandlerDelete_Tool, handleHandlerDelete),
      heldLockOf: deleteHeldLockOf,
    },
    defineTool(HandlerActivate_Tool, handleHandlerActivate),
    defineTool(HandlerTransportCreate_Tool, handleHandlerTransportCreate),
    defineTool(
      HandlerTransportSortAndCompress_Tool,
      handleHandlerTransportSortAndCompress,
    ),
    defineTool(
      HandlerTransportMoveObjects_Tool,
      handleHandlerTransportMoveObjects,
    ),
    defineTool(HandlerLock_Tool, handleHandlerLock),
    {
      ...defineTool(HandlerUnlock_Tool, handleHandlerUnlock),
      heldLockOf: unlockHeldLockOf,
    },
    defineTool(HandlerUnitTestRun_Tool, handleHandlerUnitTestRun),
    defineTool(HandlerProfileSchedule_Tool, handleHandlerProfileSchedule),
    defineTool(HandlerProfileRun_Tool, handleHandlerProfileRun),
  ];
}

export class CompactModifyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactModifyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactModifyEntries();
  }
}
