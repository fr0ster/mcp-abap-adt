/**
 * The compact tools that change nothing — seventeen of the twenty-nine: the
 * sixteen of `compactReadOnlyEntries`, and the data tool `HandlerGetData`,
 * opt-in, of `compactDataEntries`.
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

import {
  BaseHandlerGroup,
  defineTool,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
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
    defineTool(HandlerGet_Tool, handleHandlerGet),
    defineTool(HandlerSearch_Tool, handleHandlerSearch),
    defineTool(HandlerWhereUsed_Tool, handleHandlerWhereUsed),
    defineTool(HandlerValidate_Tool, handleHandlerValidate),
    defineTool(HandlerCheckRun_Tool, handleHandlerCheckRun),
    defineTool(HandlerDeletionCheck_Tool, handleHandlerDeletionCheck),
    defineTool(HandlerUnitTestStatus_Tool, handleHandlerUnitTestStatus),
    defineTool(HandlerUnitTestResult_Tool, handleHandlerUnitTestResult),
    defineTool(HandlerCdsUnitTestStatus_Tool, handleHandlerCdsUnitTestStatus),
    defineTool(HandlerCdsUnitTestResult_Tool, handleHandlerCdsUnitTestResult),
    defineTool(HandlerProfileList_Tool, handleHandlerProfileList),
    defineTool(HandlerProfileView_Tool, handleHandlerProfileView),
    defineTool(HandlerDumpList_Tool, handleHandlerDumpList),
    defineTool(HandlerDumpView_Tool, handleHandlerDumpView),
    defineTool(
      HandlerServiceBindingListTypes_Tool,
      handleHandlerServiceBindingListTypes,
    ),
    defineTool(
      HandlerServiceBindingValidate_Tool,
      handleHandlerServiceBindingValidate,
    ),
  ];
}

export class CompactReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactReadOnlyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactReadOnlyEntries();
  }
}

/**
 * The compact data tool, `HandlerGetData`: the rows of a table or CDS view,
 * or of a freestyle `SELECT`, through ADT's data preview — the compact form
 * of `GetTableContents` and `GetSqlQuery`.
 *
 * **Opt-in**, and so not among {@link compactReadOnlyEntries}: a compact
 * binary serves it only with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`,
 * `enable-data-tools`), handed in as the set's `data` builder; an embedder
 * only by using this builder or {@link CompactDataHandlersGroup}. SAP API
 * Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for
 * reading application tables, exporting business data or running SQL against
 * SAP systems; whether to serve it is the customer's decision.
 */
export function compactDataEntries(): HandlerEntry[] {
  return [defineTool(HandlerGetData_Tool, handleHandlerGetData)];
}

/** {@link compactDataEntries} as a group: the compact data tool, opt-in. */
export class CompactDataHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactDataHandlers';

  getHandlers(): HandlerEntry[] {
    return compactDataEntries();
  }
}
