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
        toolDefinition: {
          name: HandlerValidate_Tool.name,
          description: HandlerValidate_Tool.description,
          inputSchema: HandlerValidate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerValidate),
      },
      {
        toolDefinition: {
          name: HandlerActivate_Tool.name,
          description: HandlerActivate_Tool.description,
          inputSchema: HandlerActivate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerActivate),
      },
      {
        toolDefinition: {
          name: HandlerLock_Tool.name,
          description: HandlerLock_Tool.description,
          inputSchema: HandlerLock_Tool.inputSchema,
        },
        handler: withContext(handleHandlerLock),
      },
      {
        toolDefinition: {
          name: HandlerUnlock_Tool.name,
          description: HandlerUnlock_Tool.description,
          inputSchema: HandlerUnlock_Tool.inputSchema,
        },
        handler: withContext(handleHandlerUnlock),
      },
      {
        toolDefinition: {
          name: HandlerCheckRun_Tool.name,
          description: HandlerCheckRun_Tool.description,
          inputSchema: HandlerCheckRun_Tool.inputSchema,
        },
        handler: withContext(handleHandlerCheckRun),
      },
      {
        toolDefinition: {
          name: HandlerUnitTestRun_Tool.name,
          description: HandlerUnitTestRun_Tool.description,
          inputSchema: HandlerUnitTestRun_Tool.inputSchema,
        },
        handler: withContext(handleHandlerUnitTestRun),
      },
      {
        toolDefinition: {
          name: HandlerUnitTestStatus_Tool.name,
          description: HandlerUnitTestStatus_Tool.description,
          inputSchema: HandlerUnitTestStatus_Tool.inputSchema,
        },
        handler: withContext(handleHandlerUnitTestStatus),
      },
      {
        toolDefinition: {
          name: HandlerUnitTestResult_Tool.name,
          description: HandlerUnitTestResult_Tool.description,
          inputSchema: HandlerUnitTestResult_Tool.inputSchema,
        },
        handler: withContext(handleHandlerUnitTestResult),
      },
      {
        toolDefinition: {
          name: HandlerCdsUnitTestStatus_Tool.name,
          description: HandlerCdsUnitTestStatus_Tool.description,
          inputSchema: HandlerCdsUnitTestStatus_Tool.inputSchema,
        },
        handler: withContext(handleHandlerCdsUnitTestStatus),
      },
      {
        toolDefinition: {
          name: HandlerCdsUnitTestResult_Tool.name,
          description: HandlerCdsUnitTestResult_Tool.description,
          inputSchema: HandlerCdsUnitTestResult_Tool.inputSchema,
        },
        handler: withContext(handleHandlerCdsUnitTestResult),
      },
      {
        toolDefinition: {
          name: HandlerProfileRun_Tool.name,
          description: HandlerProfileRun_Tool.description,
          inputSchema: HandlerProfileRun_Tool.inputSchema,
        },
        handler: withContext(handleHandlerProfileRun),
      },
      {
        toolDefinition: {
          name: HandlerProfileList_Tool.name,
          description: HandlerProfileList_Tool.description,
          inputSchema: HandlerProfileList_Tool.inputSchema,
        },
        handler: withContext(handleHandlerProfileList),
      },
      {
        toolDefinition: {
          name: HandlerProfileView_Tool.name,
          description: HandlerProfileView_Tool.description,
          inputSchema: HandlerProfileView_Tool.inputSchema,
        },
        handler: withContext(handleHandlerProfileView),
      },
      {
        toolDefinition: {
          name: HandlerDumpList_Tool.name,
          description: HandlerDumpList_Tool.description,
          inputSchema: HandlerDumpList_Tool.inputSchema,
        },
        handler: withContext(handleHandlerDumpList),
      },
      {
        toolDefinition: {
          name: HandlerDumpView_Tool.name,
          description: HandlerDumpView_Tool.description,
          inputSchema: HandlerDumpView_Tool.inputSchema,
        },
        handler: withContext(handleHandlerDumpView),
      },
      {
        toolDefinition: {
          name: HandlerServiceBindingListTypes_Tool.name,
          description: HandlerServiceBindingListTypes_Tool.description,
          inputSchema: HandlerServiceBindingListTypes_Tool.inputSchema,
        },
        handler: withContext(handleHandlerServiceBindingListTypes),
      },
      {
        toolDefinition: {
          name: HandlerServiceBindingValidate_Tool.name,
          description: HandlerServiceBindingValidate_Tool.description,
          inputSchema: HandlerServiceBindingValidate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerServiceBindingValidate),
      },
      {
        toolDefinition: {
          name: HandlerTransportCreate_Tool.name,
          description: HandlerTransportCreate_Tool.description,
          inputSchema: HandlerTransportCreate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerTransportCreate),
      },
      {
        toolDefinition: {
          name: HandlerCreate_Tool.name,
          description: HandlerCreate_Tool.description,
          inputSchema: HandlerCreate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerCreate),
      },
      {
        toolDefinition: {
          name: HandlerGet_Tool.name,
          description: HandlerGet_Tool.description,
          inputSchema: HandlerGet_Tool.inputSchema,
        },
        handler: withContext(handleHandlerGet),
      },
      {
        toolDefinition: {
          name: HandlerUpdate_Tool.name,
          description: HandlerUpdate_Tool.description,
          inputSchema: HandlerUpdate_Tool.inputSchema,
        },
        handler: withContext(handleHandlerUpdate),
      },
      {
        toolDefinition: {
          name: HandlerDelete_Tool.name,
          description: HandlerDelete_Tool.description,
          inputSchema: HandlerDelete_Tool.inputSchema,
        },
        handler: withContext(handleHandlerDelete),
      },
    ];
  }
}
