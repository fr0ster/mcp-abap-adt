import {
  TOOL_DEFINITION as HandlerActivate_Tool,
  handleHandlerActivate,
} from '../../../handlers/compact/high/handleHandlerActivate';
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
  TOOL_DEFINITION as HandlerCreate_Tool,
  handleHandlerCreate,
} from '../../../handlers/compact/high/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerDelete_Tool,
  handleHandlerDelete,
} from '../../../handlers/compact/high/handleHandlerDelete';
import {
  TOOL_DEFINITION as HandlerDumpList_Tool,
  handleHandlerDumpList,
} from '../../../handlers/compact/high/handleHandlerDumpList';
import {
  TOOL_DEFINITION as HandlerDumpView_Tool,
  handleHandlerDumpView,
} from '../../../handlers/compact/high/handleHandlerDumpView';
import {
  TOOL_DEFINITION as HandlerFeedList_Tool,
  handleHandlerFeedList,
} from '../../../handlers/compact/high/handleHandlerFeedList';
import {
  TOOL_DEFINITION as HandlerGatewayErrorList_Tool,
  handleHandlerGatewayErrorList,
} from '../../../handlers/compact/high/handleHandlerGatewayErrorList';
import {
  TOOL_DEFINITION as HandlerGet_Tool,
  handleHandlerGet,
} from '../../../handlers/compact/high/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerLock_Tool,
  handleHandlerLock,
} from '../../../handlers/compact/high/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerProfileList_Tool,
  handleHandlerProfileList,
} from '../../../handlers/compact/high/handleHandlerProfileList';
import {
  TOOL_DEFINITION as HandlerProfileRun_Tool,
  handleHandlerProfileRun,
} from '../../../handlers/compact/high/handleHandlerProfileRun';
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
  TOOL_DEFINITION as HandlerSystemMessageList_Tool,
  handleHandlerSystemMessageList,
} from '../../../handlers/compact/high/handleHandlerSystemMessageList';
import {
  TOOL_DEFINITION as HandlerTransportCreate_Tool,
  handleHandlerTransportCreate,
} from '../../../handlers/compact/high/handleHandlerTransportCreate';
import {
  TOOL_DEFINITION as HandlerUnitTestResult_Tool,
  handleHandlerUnitTestResult,
} from '../../../handlers/compact/high/handleHandlerUnitTestResult';
import {
  TOOL_DEFINITION as HandlerUnitTestRun_Tool,
  handleHandlerUnitTestRun,
} from '../../../handlers/compact/high/handleHandlerUnitTestRun';
import {
  TOOL_DEFINITION as HandlerUnitTestStatus_Tool,
  handleHandlerUnitTestStatus,
} from '../../../handlers/compact/high/handleHandlerUnitTestStatus';
import {
  TOOL_DEFINITION as HandlerUnlock_Tool,
  handleHandlerUnlock,
} from '../../../handlers/compact/high/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate_Tool,
  handleHandlerUpdate,
} from '../../../handlers/compact/high/handleHandlerUpdate';
import {
  TOOL_DEFINITION as HandlerValidate_Tool,
  handleHandlerValidate,
} from '../../../handlers/compact/high/handleHandlerValidate';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * Handler group for compact facade handlers.
 * Provides unified CRUD router tools by object_type.
 */
export class CompactHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactHandlers';

  getHandlers(): HandlerEntry[] {
    const withContext = <TArgs, TResult>(
      handler: (context: typeof this.context, args: TArgs) => TResult,
    ) => {
      return (args: unknown) => handler(this.context, args as TArgs);
    };

    return [
      {
        toolDefinition: HandlerValidate_Tool,
        handler: withContext(handleHandlerValidate),
      },
      {
        toolDefinition: HandlerActivate_Tool,
        handler: withContext(handleHandlerActivate),
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
        toolDefinition: HandlerCheckRun_Tool,
        handler: withContext(handleHandlerCheckRun),
      },
      {
        toolDefinition: HandlerUnitTestRun_Tool,
        handler: withContext(handleHandlerUnitTestRun),
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
        toolDefinition: HandlerProfileRun_Tool,
        handler: withContext(handleHandlerProfileRun),
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
        toolDefinition: HandlerFeedList_Tool,
        handler: withContext(handleHandlerFeedList),
      },
      {
        toolDefinition: HandlerSystemMessageList_Tool,
        handler: withContext(handleHandlerSystemMessageList),
      },
      {
        toolDefinition: HandlerGatewayErrorList_Tool,
        handler: withContext(handleHandlerGatewayErrorList),
      },
      {
        toolDefinition: HandlerServiceBindingListTypes_Tool,
        handler: withContext(handleHandlerServiceBindingListTypes),
      },
      {
        toolDefinition: HandlerServiceBindingValidate_Tool,
        handler: withContext(handleHandlerServiceBindingValidate),
      },
      {
        toolDefinition: HandlerTransportCreate_Tool,
        handler: withContext(handleHandlerTransportCreate),
      },
      {
        toolDefinition: HandlerCreate_Tool,
        handler: withContext(handleHandlerCreate),
      },
      {
        toolDefinition: HandlerGet_Tool,
        handler: withContext(handleHandlerGet),
      },
      {
        toolDefinition: HandlerUpdate_Tool,
        handler: withContext(handleHandlerUpdate),
      },
      {
        toolDefinition: HandlerDelete_Tool,
        handler: withContext(handleHandlerDelete),
      },
    ];
  }
}
