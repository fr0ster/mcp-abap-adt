import {
  TOOL_DEFINITION as HandlerAction_Tool,
  handleHandlerAction,
} from '../../../handlers/compact/high/handleHandlerAction';
import {
  TOOL_DEFINITION as HandlerCreate_Tool,
  handleHandlerCreate,
} from '../../../handlers/compact/high/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerDelete_Tool,
  handleHandlerDelete,
} from '../../../handlers/compact/high/handleHandlerDelete';
import {
  TOOL_DEFINITION as HandlerGet_Tool,
  handleHandlerGet,
} from '../../../handlers/compact/high/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerUpdate_Tool,
  handleHandlerUpdate,
} from '../../../handlers/compact/high/handleHandlerUpdate';
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
          name: HandlerAction_Tool.name,
          description: HandlerAction_Tool.description,
          inputSchema: HandlerAction_Tool.inputSchema,
        },
        handler: withContext(handleHandlerAction),
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
