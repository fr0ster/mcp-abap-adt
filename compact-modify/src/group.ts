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

import type { HandlerEntry } from '@mcp-abap-adt/lib/handlers';
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

/**
 * The entries: each takes the call's context at the call, as the read-only
 * half's do.
 */
export function compactModifyEntries(): HandlerEntry[] {
  return [
    {
      toolDefinition: HandlerCreate_Tool,
      call: handleHandlerCreate,
    },
    {
      toolDefinition: HandlerUpdate_Tool,
      call: handleHandlerUpdate,
    },
    {
      toolDefinition: HandlerDelete_Tool,
      call: handleHandlerDelete,
    },
    {
      toolDefinition: HandlerActivate_Tool,
      call: handleHandlerActivate,
    },
    {
      toolDefinition: HandlerTransportCreate_Tool,
      call: handleHandlerTransportCreate,
    },
    {
      toolDefinition: HandlerTransportSortAndCompress_Tool,
      call: handleHandlerTransportSortAndCompress,
    },
    {
      toolDefinition: HandlerTransportMoveObjects_Tool,
      call: handleHandlerTransportMoveObjects,
    },
    {
      toolDefinition: HandlerLock_Tool,
      call: handleHandlerLock,
    },
    {
      toolDefinition: HandlerUnlock_Tool,
      call: handleHandlerUnlock,
    },
    {
      toolDefinition: HandlerUnitTestRun_Tool,
      call: handleHandlerUnitTestRun,
    },
    {
      toolDefinition: HandlerProfileSchedule_Tool,
      call: handleHandlerProfileSchedule,
    },
    {
      toolDefinition: HandlerProfileRun_Tool,
      call: handleHandlerProfileRun,
    },
  ];
}

export class CompactModifyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactModifyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactModifyEntries();
  }
}
