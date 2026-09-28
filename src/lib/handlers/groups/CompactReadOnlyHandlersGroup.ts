/**
 * The compact tools that change nothing — thirteen of the twenty-two.
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
 * would be admissible and `HandlerCheckRun` runs a syntax check; both answer
 * without writing, so both are here.
 */
import {
  TOOL_DEFINITION as HandlerCdsUnitTestResult_Tool,
  handleHandlerCdsUnitTestResult,
} from '../../../handlers/compact/high/handleHandlerCdsUnitTestResult';
import {
  TOOL_DEFINITION as HandlerCdsUnitTestStatus_Tool,
  handleHandlerCdsUnitTestStatus,
} from '../../../handlers/compact/high/handleHandlerCdsUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerCheckRun_Tool,
  handleHandlerCheckRun,
} from '../../../handlers/compact/high/handleHandlerCheckRun';
import {
  TOOL_DEFINITION as HandlerDumpList_Tool,
  handleHandlerDumpList,
} from '../../../handlers/compact/high/handleHandlerDumpList';
import {
  TOOL_DEFINITION as HandlerDumpView_Tool,
  handleHandlerDumpView,
} from '../../../handlers/compact/high/handleHandlerDumpView';
import {
  TOOL_DEFINITION as HandlerGet_Tool,
  handleHandlerGet,
} from '../../../handlers/compact/high/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerProfileList_Tool,
  handleHandlerProfileList,
} from '../../../handlers/compact/high/handleHandlerProfileList';
import {
  TOOL_DEFINITION as HandlerProfileView_Tool,
  handleHandlerProfileView,
} from '../../../handlers/compact/high/handleHandlerProfileView';
import {
  TOOL_DEFINITION as HandlerServiceBindingListTypes_Tool,
  handleHandlerServiceBindingListTypes,
} from '../../../handlers/compact/high/handleHandlerServiceBindingListTypes';
import {
  TOOL_DEFINITION as HandlerServiceBindingValidate_Tool,
  handleHandlerServiceBindingValidate,
} from '../../../handlers/compact/high/handleHandlerServiceBindingValidate';
import {
  TOOL_DEFINITION as HandlerUnitTestResult_Tool,
  handleHandlerUnitTestResult,
} from '../../../handlers/compact/high/handleHandlerUnitTestResult';
import {
  TOOL_DEFINITION as HandlerUnitTestStatus_Tool,
  handleHandlerUnitTestStatus,
} from '../../../handlers/compact/high/handleHandlerUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerValidate_Tool,
  handleHandlerValidate,
} from '../../../handlers/compact/high/handleHandlerValidate';
import type { HandlerContext } from '../../../handlers/interfaces.js';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * The entries, built against a LIVE context rather than a snapshot.
 *
 * `BaseMcpServer` sets the context on the group that OWNS an entry, once per
 * request — a fresh connection each time. So an entry must read the context when
 * it is CALLED, never capture the one that existed when the list was built: a
 * composed group that instantiated this one with a snapshot handed its handlers a
 * stale connection, or the initial `null` (found in review on PR #240). Taking a
 * getter means the owning group can be this class or the composed facade, and
 * either way the handler sees that group's current context.
 */
export function compactReadOnlyEntries(
  getContext: () => HandlerContext,
): HandlerEntry[] {
  const withContext = <TArgs, TResult>(
    handler: (context: HandlerContext, args: TArgs) => TResult,
  ) => {
    return (args: unknown) => handler(getContext(), args as TArgs);
  };

  return [
    {
      toolDefinition: HandlerGet_Tool,
      handler: withContext(handleHandlerGet),
    },
    {
      toolDefinition: HandlerValidate_Tool,
      handler: withContext(handleHandlerValidate),
    },
    {
      toolDefinition: HandlerCheckRun_Tool,
      handler: withContext(handleHandlerCheckRun),
    },
    {
      toolDefinition: HandlerUnitTestStatus_Tool,
      handler: withContext(handleHandlerUnitTestStatus),
    },
    {
      toolDefinition: HandlerUnitTestResult_Tool,
      handler: withContext(handleHandlerUnitTestResult),
    },
    {
      toolDefinition: HandlerCdsUnitTestStatus_Tool,
      handler: withContext(handleHandlerCdsUnitTestStatus),
    },
    {
      toolDefinition: HandlerCdsUnitTestResult_Tool,
      handler: withContext(handleHandlerCdsUnitTestResult),
    },
    {
      toolDefinition: HandlerProfileList_Tool,
      handler: withContext(handleHandlerProfileList),
    },
    {
      toolDefinition: HandlerProfileView_Tool,
      handler: withContext(handleHandlerProfileView),
    },
    {
      toolDefinition: HandlerDumpList_Tool,
      handler: withContext(handleHandlerDumpList),
    },
    {
      toolDefinition: HandlerDumpView_Tool,
      handler: withContext(handleHandlerDumpView),
    },
    {
      toolDefinition: HandlerServiceBindingListTypes_Tool,
      handler: withContext(handleHandlerServiceBindingListTypes),
    },
    {
      toolDefinition: HandlerServiceBindingValidate_Tool,
      handler: withContext(handleHandlerServiceBindingValidate),
    },
  ];
}

export class CompactReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactReadOnlyHandlers';

  getHandlers(): HandlerEntry[] {
    return compactReadOnlyEntries(() => this.context);
  }
}
