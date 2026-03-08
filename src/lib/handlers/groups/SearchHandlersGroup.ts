import {
  TOOL_DEFINITION as GetObjectsByType_Tool,
  handleGetObjectsByType,
} from '../../../handlers/search/readonly/handleGetObjectsByType';
import {
  TOOL_DEFINITION as GetObjectsList_Tool,
  handleGetObjectsList,
} from '../../../handlers/search/readonly/handleGetObjectsList';
// Import search handlers
// Import TOOL_DEFINITION from handlers
import {
  handleSearchObject,
  TOOL_DEFINITION as SearchObject_Tool,
} from '../../../handlers/search/readonly/handleSearchObject';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * Handler group for all search-related handlers
 * Contains handlers for searching and listing objects in the ABAP system
 */
export class SearchHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'SearchHandlers';

  /**
   * Gets all search handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: SearchObject_Tool,
        handler: (args: any) => handleSearchObject(this.context, args),
      },
      // Dynamic import handlers
      {
        toolDefinition: GetObjectsList_Tool,
        handler: (args: any) => {
          return handleGetObjectsList(
            this.context,
            args as { object_type: string },
          );
        },
      },
      {
        toolDefinition: GetObjectsByType_Tool,
        handler: (args: any) => {
          return handleGetObjectsByType(
            this.context,
            args as { object_type: string },
          );
        },
      },
    ];
  }
}
