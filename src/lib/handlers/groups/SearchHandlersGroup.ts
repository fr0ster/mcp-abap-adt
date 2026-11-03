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
import {
  handleSearchSource,
  TOOL_DEFINITION as SearchSource_Tool,
} from '../../../handlers/system/readonly/handleSearchSource';
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
        call: handleSearchObject,
      },
      {
        toolDefinition: SearchSource_Tool,
        call: handleSearchSource,
      },
      // Dynamic import handlers
      {
        toolDefinition: GetObjectsList_Tool,
        call: handleGetObjectsList,
      },
      {
        toolDefinition: GetObjectsByType_Tool,
        call: handleGetObjectsByType,
      },
    ];
  }
}
