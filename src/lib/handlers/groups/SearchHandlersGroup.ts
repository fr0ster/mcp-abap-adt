import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

// Import search handlers
import { handleSearchObject } from "../../../handlers/search/readonly/handleSearchObject";
import { handleGetObjectsList } from "../../../handlers/search/readonly/handleGetObjectsList";
import { handleGetObjectsByType } from "../../../handlers/search/readonly/handleGetObjectsByType";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as SearchObject_Tool } from "../../../handlers/search/readonly/handleSearchObject";
import { TOOL_DEFINITION as GetObjectsList_Tool } from "../../../handlers/search/readonly/handleGetObjectsList";
import { TOOL_DEFINITION as GetObjectsByType_Tool } from "../../../handlers/search/readonly/handleGetObjectsByType";

/**
 * Handler group for all search-related handlers
 * Contains handlers for searching and listing objects in the ABAP system
 */
export class SearchHandlersGroup extends BaseHandlerGroup {
  protected groupName = "SearchHandlers";

  /**
   * Gets all search handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: SearchObject_Tool.name,
          description: SearchObject_Tool.description,
          inputSchema: SearchObject_Tool.inputSchema,
        },
        handler: (args: any) => handleSearchObject(this.context, args),
      },
      // Dynamic import handlers
      {
        toolDefinition: {
          name: GetObjectsList_Tool.name,
          description: GetObjectsList_Tool.description,
          inputSchema: GetObjectsList_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleGetObjectsList(this.context, args as { object_type: string });
        },
      },
      {
        toolDefinition: {
          name: GetObjectsByType_Tool.name,
          description: GetObjectsByType_Tool.description,
          inputSchema: GetObjectsByType_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleGetObjectsByType(this.context, args as { object_type: string });
        },
      },
    ];
  }
}
