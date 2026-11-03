/**
 * The compact tools that change nothing — seventeen of the twenty-nine.
 *
 * **Why a group of its own, and why it matters what it imports.** Compact is a
 * different decomposition of the same surface: the operation is the tool and the
 * object moves into `object_type`. That makes the tool list small, which is the
 * point when an LLM's context is tight — but it also puts create, update and
 * delete one argument away from a read. A consumer that means to hand an agent a
 * surface which cannot change the system therefore needs more than a flag: it
 * needs a tool list assembled from modules that carry no write route at all.
 *
 * This group is that list. Its module graph reaches `compactReadRoutes` and never
 * `compactWriteRoutes`, and `compactCapabilitySplit.test.ts` asserts that of the
 * imports rather than of the intention.
 *
 * **Where the line is: whether the call changes the system.** A lock is an
 * enqueue, so it is not here. `HandlerUnitTestRun` and `HandlerProfileRun` change
 * no repository object but they EXECUTE ABAP and leave traces, which is not
 * something a read-only surface may offer. `HandlerValidate` asks whether a name
 * would be admissible, `HandlerCheckRun` runs a syntax check and
 * `HandlerDeletionCheck` asks whether an object can be deleted; they answer
 * without writing, so they are here.
 */

import type { HandlerEntry } from '@mcp-abap-adt/lib/handlers';
import { BaseHandlerGroup } from '@mcp-abap-adt/lib/handlers';
import {
  TOOL_DEFINITION as HandlerCdsUnitTestResult_Tool,
  handleHandlerCdsUnitTestResult,
} from './handlers/handleHandlerCdsUnitTestResult';
import {
  TOOL_DEFINITION as HandlerCdsUnitTestStatus_Tool,
  handleHandlerCdsUnitTestStatus,
} from './handlers/handleHandlerCdsUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerCheckRun_Tool,
  handleHandlerCheckRun,
} from './handlers/handleHandlerCheckRun';
import {
  TOOL_DEFINITION as HandlerDeletionCheck_Tool,
  handleHandlerDeletionCheck,
} from './handlers/handleHandlerDeletionCheck';
import {
  TOOL_DEFINITION as HandlerDumpList_Tool,
  handleHandlerDumpList,
} from './handlers/handleHandlerDumpList';
import {
  TOOL_DEFINITION as HandlerDumpView_Tool,
  handleHandlerDumpView,
} from './handlers/handleHandlerDumpView';
import {
  TOOL_DEFINITION as HandlerGet_Tool,
  handleHandlerGet,
} from './handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerGetData_Tool,
  handleHandlerGetData,
} from './handlers/handleHandlerGetData';
import {
  TOOL_DEFINITION as HandlerProfileList_Tool,
  handleHandlerProfileList,
} from './handlers/handleHandlerProfileList';
import {
  TOOL_DEFINITION as HandlerProfileView_Tool,
  handleHandlerProfileView,
} from './handlers/handleHandlerProfileView';
import {
  TOOL_DEFINITION as HandlerSearch_Tool,
  handleHandlerSearch,
} from './handlers/handleHandlerSearch';
import {
  TOOL_DEFINITION as HandlerServiceBindingListTypes_Tool,
  handleHandlerServiceBindingListTypes,
} from './handlers/handleHandlerServiceBindingListTypes';
import {
  TOOL_DEFINITION as HandlerServiceBindingValidate_Tool,
  handleHandlerServiceBindingValidate,
} from './handlers/handleHandlerServiceBindingValidate';
import {
  TOOL_DEFINITION as HandlerUnitTestResult_Tool,
  handleHandlerUnitTestResult,
} from './handlers/handleHandlerUnitTestResult';
import {
  TOOL_DEFINITION as HandlerUnitTestStatus_Tool,
  handleHandlerUnitTestStatus,
} from './handlers/handleHandlerUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerValidate_Tool,
  handleHandlerValidate,
} from './handlers/handleHandlerValidate';
import {
  TOOL_DEFINITION as HandlerWhereUsed_Tool,
  handleHandlerWhereUsed,
} from './handlers/handleHandlerWhereUsed';

/**
 * The entries: each takes the call's context at the call, from whichever
 * registration path runs it, so no entry holds a context of its own.
 */
export function compactReadOnlyEntries(): HandlerEntry[] {
  return [
    {
      toolDefinition: HandlerGet_Tool,
      call: handleHandlerGet,
    },
    {
      toolDefinition: HandlerSearch_Tool,
      call: handleHandlerSearch,
    },
    {
      toolDefinition: HandlerWhereUsed_Tool,
      call: handleHandlerWhereUsed,
    },
    {
      toolDefinition: HandlerGetData_Tool,
      call: handleHandlerGetData,
    },
    {
      toolDefinition: HandlerValidate_Tool,
      call: handleHandlerValidate,
    },
    {
      toolDefinition: HandlerCheckRun_Tool,
      call: handleHandlerCheckRun,
    },
    {
      toolDefinition: HandlerDeletionCheck_Tool,
      call: handleHandlerDeletionCheck,
    },
    {
      toolDefinition: HandlerUnitTestStatus_Tool,
      call: handleHandlerUnitTestStatus,
    },
    {
      toolDefinition: HandlerUnitTestResult_Tool,
      call: handleHandlerUnitTestResult,
    },
    {
      toolDefinition: HandlerCdsUnitTestStatus_Tool,
      call: handleHandlerCdsUnitTestStatus,
    },
    {
      toolDefinition: HandlerCdsUnitTestResult_Tool,
      call: handleHandlerCdsUnitTestResult,
    },
    {
      toolDefinition: HandlerProfileList_Tool,
      call: handleHandlerProfileList,
    },
    {
      toolDefinition: HandlerProfileView_Tool,
      call: handleHandlerProfileView,
    },
    {
      toolDefinition: HandlerDumpList_Tool,
      call: handleHandlerDumpList,
    },
    {
      toolDefinition: HandlerDumpView_Tool,
      call: handleHandlerDumpView,
    },
    {
      toolDefinition: HandlerServiceBindingListTypes_Tool,
      call: handleHandlerServiceBindingListTypes,
    },
    {
      toolDefinition: HandlerServiceBindingValidate_Tool,
      call: handleHandlerServiceBindingValidate,
    },
  ];
}

export class CompactReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactReadOnlyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactReadOnlyEntries();
  }
}
