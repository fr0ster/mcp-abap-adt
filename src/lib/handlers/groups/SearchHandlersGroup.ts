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
import { defineTool, type HandlerEntry } from '../interfaces.js';

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
      defineTool(SearchObject_Tool, handleSearchObject),
      defineTool(SearchSource_Tool, handleSearchSource),
      // Dynamic import handlers
      defineTool(GetObjectsList_Tool, handleGetObjectsList),
      defineTool(GetObjectsByType_Tool, handleGetObjectsByType),
    ];
  }
}
