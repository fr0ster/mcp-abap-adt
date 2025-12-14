import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

// Import search handlers
import { handleSearchObject } from "../../../../handlers/search/readonly/handleSearchObject";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as SearchObject_Tool } from "../../../../handlers/search/readonly/handleSearchObject";

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
        handler: handleSearchObject,
      },
      // Dynamic import handlers
      {
        toolDefinition: {
          name: "GetObjectsList",
          description: "Get list of objects by package",
          inputSchema: {
            type: "object",
            properties: {
              package_name: { type: "string" },
            },
            required: ["package_name"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/search/readonly/handleGetObjectsList.js")).handleGetObjectsList(args);
        },
      },
      {
        toolDefinition: {
          name: "GetObjectsByType",
          description: "Get objects by type",
          inputSchema: {
            type: "object",
            properties: {
              object_type: { type: "string" },
              package_name: { type: "string" },
            },
            required: ["object_type"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/search/readonly/handleGetObjectsByType.js")).handleGetObjectsByType(args);
        },
      },
    ];
  }
}
