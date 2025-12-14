import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

// Import readonly handlers
import { handleGetProgram } from "../../../../handlers/program/readonly/handleGetProgram";
import { handleGetClass } from "../../../../handlers/class/readonly/handleGetClass";
import { handleGetFunctionGroup } from "../../../../handlers/function/readonly/handleGetFunctionGroup";
import { handleGetFunction } from "../../../../handlers/function/readonly/handleGetFunction";
import { handleGetTable } from "../../../../handlers/table/readonly/handleGetTable";
import { handleGetStructure } from "../../../../handlers/structure/readonly/handleGetStructure";
import { handleGetTableContents } from "../../../../handlers/table/readonly/handleGetTableContents";
import { handleGetPackage } from "../../../../handlers/package/readonly/handleGetPackage";
import { handleGetInclude } from "../../../../handlers/include/readonly/handleGetInclude";
import { handleGetIncludesList } from "../../../../handlers/include/readonly/handleGetIncludesList";
import { handleGetTypeInfo } from "../../../../handlers/system/readonly/handleGetTypeInfo";
import { handleGetInterface } from "../../../../handlers/interface/readonly/handleGetInterface";
import { handleGetTransaction } from "../../../../handlers/system/readonly/handleGetTransaction";
import { handleSearchObject } from "../../../../handlers/search/readonly/handleSearchObject";
import { handleGetEnhancements } from "../../../../handlers/enhancement/readonly/handleGetEnhancements";
import { handleGetEnhancementImpl } from "../../../../handlers/enhancement/readonly/handleGetEnhancementImpl";
import { handleGetEnhancementSpot } from "../../../../handlers/enhancement/readonly/handleGetEnhancementSpot";
import { handleGetBdef } from "../../../../handlers/behavior_definition/readonly/handleGetBdef";
import { handleGetSqlQuery } from "../../../../handlers/system/readonly/handleGetSqlQuery";
import { handleGetWhereUsed } from "../../../../handlers/system/readonly/handleGetWhereUsed";
import { handleGetObjectInfo } from "../../../../handlers/system/readonly/handleGetObjectInfo";
import { handleGetAbapAST } from "../../../../handlers/system/readonly/handleGetAbapAST";
import { handleGetAbapSemanticAnalysis } from "../../../../handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { handleGetAbapSystemSymbols } from "../../../../handlers/system/readonly/handleGetAbapSystemSymbols";
import { handleGetDomain } from "../../../../handlers/domain/readonly/handleGetDomain";
import { handleGetDataElement } from "../../../../handlers/data_element/readonly/handleGetDataElement";
import { handleGetTransport } from "../../../../handlers/transport/readonly/handleGetTransport";
import { handleGetView } from "../../../../handlers/view/readonly/handleGetView";
import { handleGetServiceDefinition } from "../../../../handlers/service_definition/readonly/handleGetServiceDefinition";
import { handleGetSession } from "../../../../handlers/system/readonly/handleGetSession";
import { handleGetInactiveObjects } from "../../../../handlers/system/readonly/handleGetInactiveObjects";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetProgram_Tool } from "../../../../handlers/program/readonly/handleGetProgram";
import { TOOL_DEFINITION as GetClass_Tool } from "../../../../handlers/class/readonly/handleGetClass";
import { TOOL_DEFINITION as GetFunction_Tool } from "../../../../handlers/function/readonly/handleGetFunction";
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from "../../../../handlers/function/readonly/handleGetFunctionGroup";
import { TOOL_DEFINITION as GetTable_Tool } from "../../../../handlers/table/readonly/handleGetTable";
import { TOOL_DEFINITION as GetStructure_Tool } from "../../../../handlers/structure/readonly/handleGetStructure";
import { TOOL_DEFINITION as GetTableContents_Tool } from "../../../../handlers/table/readonly/handleGetTableContents";
import { TOOL_DEFINITION as GetPackage_Tool } from "../../../../handlers/package/readonly/handleGetPackage";
import { TOOL_DEFINITION as GetInclude_Tool } from "../../../../handlers/include/readonly/handleGetInclude";
import { TOOL_DEFINITION as GetIncludesList_Tool } from "../../../../handlers/include/readonly/handleGetIncludesList";
import { TOOL_DEFINITION as GetTypeInfo_Tool } from "../../../../handlers/system/readonly/handleGetTypeInfo";
import { TOOL_DEFINITION as GetInterface_Tool } from "../../../../handlers/interface/readonly/handleGetInterface";
import { TOOL_DEFINITION as GetTransaction_Tool } from "../../../../handlers/system/readonly/handleGetTransaction";
import { TOOL_DEFINITION as SearchObject_Tool } from "../../../../handlers/search/readonly/handleSearchObject";
import { TOOL_DEFINITION as GetEnhancements_Tool } from "../../../../handlers/enhancement/readonly/handleGetEnhancements";
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from "../../../../handlers/enhancement/readonly/handleGetEnhancementSpot";
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from "../../../../handlers/enhancement/readonly/handleGetEnhancementImpl";
import { TOOL_DEFINITION as GetBdef_Tool } from "../../../../handlers/behavior_definition/readonly/handleGetBdef";
import { TOOL_DEFINITION as GetSqlQuery_Tool } from "../../../../handlers/system/readonly/handleGetSqlQuery";
import { TOOL_DEFINITION as GetWhereUsed_Tool } from "../../../../handlers/system/readonly/handleGetWhereUsed";
import { TOOL_DEFINITION as GetObjectInfo_Tool } from "../../../../handlers/system/readonly/handleGetObjectInfo";
import { TOOL_DEFINITION as GetAbapAST_Tool } from "../../../../handlers/system/readonly/handleGetAbapAST";
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from "../../../../handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from "../../../../handlers/system/readonly/handleGetAbapSystemSymbols";
import { TOOL_DEFINITION as GetDomain_Tool } from "../../../../handlers/domain/readonly/handleGetDomain";
import { TOOL_DEFINITION as GetDataElement_Tool } from "../../../../handlers/data_element/readonly/handleGetDataElement";
import { TOOL_DEFINITION as GetTransport_Tool } from "../../../../handlers/transport/readonly/handleGetTransport";
import { TOOL_DEFINITION as GetView_Tool } from "../../../../handlers/view/readonly/handleGetView";
import { TOOL_DEFINITION as GetServiceDefinition_Tool } from "../../../../handlers/service_definition/readonly/handleGetServiceDefinition";
import { TOOL_DEFINITION as GetSession_Tool } from "../../../../handlers/system/readonly/handleGetSession";
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from "../../../../handlers/system/readonly/handleGetInactiveObjects";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Handler group for all readonly (read-only) handlers
 * Contains handlers that only read data without modifying the ABAP system
 */
export class ReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = "ReadOnlyHandlers";

  /**
   * Gets all readonly handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: GetProgram_Tool.name,
          description: GetProgram_Tool.description,
          inputSchema: GetProgram_Tool.inputSchema,
        },
        handler: handleGetProgram,
      },
      {
        toolDefinition: {
          name: GetClass_Tool.name,
          description: GetClass_Tool.description,
          inputSchema: GetClass_Tool.inputSchema,
        },
        handler: handleGetClass,
      },
      {
        toolDefinition: {
          name: GetFunction_Tool.name,
          description: GetFunction_Tool.description,
          inputSchema: GetFunction_Tool.inputSchema,
        },
        handler: handleGetFunction,
      },
      {
        toolDefinition: {
          name: GetFunctionGroup_Tool.name,
          description: GetFunctionGroup_Tool.description,
          inputSchema: GetFunctionGroup_Tool.inputSchema,
        },
        handler: handleGetFunctionGroup,
      },
      {
        toolDefinition: {
          name: GetTable_Tool.name,
          description: GetTable_Tool.description,
          inputSchema: GetTable_Tool.inputSchema,
        },
        handler: handleGetTable,
      },
      {
        toolDefinition: {
          name: GetStructure_Tool.name,
          description: GetStructure_Tool.description,
          inputSchema: GetStructure_Tool.inputSchema,
        },
        handler: handleGetStructure,
      },
      {
        toolDefinition: {
          name: GetTableContents_Tool.name,
          description: GetTableContents_Tool.description,
          inputSchema: GetTableContents_Tool.inputSchema,
        },
        handler: handleGetTableContents,
      },
      {
        toolDefinition: {
          name: GetPackage_Tool.name,
          description: GetPackage_Tool.description,
          inputSchema: GetPackage_Tool.inputSchema,
        },
        handler: handleGetPackage,
      },
      {
        toolDefinition: {
          name: GetInclude_Tool.name,
          description: GetInclude_Tool.description,
          inputSchema: GetInclude_Tool.inputSchema,
        },
        handler: handleGetInclude,
      },
      {
        toolDefinition: {
          name: GetIncludesList_Tool.name,
          description: GetIncludesList_Tool.description,
          inputSchema: GetIncludesList_Tool.inputSchema,
        },
        handler: handleGetIncludesList,
      },
      {
        toolDefinition: {
          name: GetTypeInfo_Tool.name,
          description: GetTypeInfo_Tool.description,
          inputSchema: GetTypeInfo_Tool.inputSchema,
        },
        handler: handleGetTypeInfo,
      },
      {
        toolDefinition: {
          name: GetInterface_Tool.name,
          description: GetInterface_Tool.description,
          inputSchema: GetInterface_Tool.inputSchema,
        },
        handler: handleGetInterface,
      },
      {
        toolDefinition: {
          name: GetTransaction_Tool.name,
          description: GetTransaction_Tool.description,
          inputSchema: GetTransaction_Tool.inputSchema,
        },
        handler: handleGetTransaction,
      },
      {
        toolDefinition: {
          name: SearchObject_Tool.name,
          description: SearchObject_Tool.description,
          inputSchema: SearchObject_Tool.inputSchema,
        },
        handler: handleSearchObject,
      },
      {
        toolDefinition: {
          name: GetEnhancements_Tool.name,
          description: GetEnhancements_Tool.description,
          inputSchema: GetEnhancements_Tool.inputSchema,
        },
        handler: handleGetEnhancements,
      },
      {
        toolDefinition: {
          name: GetEnhancementSpot_Tool.name,
          description: GetEnhancementSpot_Tool.description,
          inputSchema: GetEnhancementSpot_Tool.inputSchema,
        },
        handler: handleGetEnhancementSpot,
      },
      {
        toolDefinition: {
          name: GetEnhancementImpl_Tool.name,
          description: GetEnhancementImpl_Tool.description,
          inputSchema: GetEnhancementImpl_Tool.inputSchema,
        },
        handler: handleGetEnhancementImpl,
      },
      {
        toolDefinition: {
          name: GetBdef_Tool.name,
          description: GetBdef_Tool.description,
          inputSchema: GetBdef_Tool.inputSchema,
        },
        handler: handleGetBdef,
      },
      {
        toolDefinition: {
          name: GetSqlQuery_Tool.name,
          description: GetSqlQuery_Tool.description,
          inputSchema: GetSqlQuery_Tool.inputSchema,
        },
        handler: handleGetSqlQuery,
      },
      {
        toolDefinition: {
          name: GetWhereUsed_Tool.name,
          description: GetWhereUsed_Tool.description,
          inputSchema: GetWhereUsed_Tool.inputSchema,
        },
        handler: handleGetWhereUsed,
      },
      {
        toolDefinition: {
          name: GetObjectInfo_Tool.name,
          description: GetObjectInfo_Tool.description,
          inputSchema: GetObjectInfo_Tool.inputSchema,
        },
        handler: async (args: any) => {
          if (!args || typeof args !== "object") {
            throw new McpError(ErrorCode.InvalidParams, "Missing or invalid arguments for GetObjectInfo");
          }
          return await handleGetObjectInfo(args as { parent_type: string; parent_name: string });
        },
      },
      {
        toolDefinition: {
          name: GetAbapAST_Tool.name,
          description: GetAbapAST_Tool.description,
          inputSchema: GetAbapAST_Tool.inputSchema,
        },
        handler: handleGetAbapAST,
      },
      {
        toolDefinition: {
          name: GetAbapSemanticAnalysis_Tool.name,
          description: GetAbapSemanticAnalysis_Tool.description,
          inputSchema: GetAbapSemanticAnalysis_Tool.inputSchema,
        },
        handler: handleGetAbapSemanticAnalysis,
      },
      {
        toolDefinition: {
          name: GetAbapSystemSymbols_Tool.name,
          description: GetAbapSystemSymbols_Tool.description,
          inputSchema: GetAbapSystemSymbols_Tool.inputSchema,
        },
        handler: handleGetAbapSystemSymbols,
      },
      {
        toolDefinition: {
          name: GetDomain_Tool.name,
          description: GetDomain_Tool.description,
          inputSchema: GetDomain_Tool.inputSchema,
        },
        handler: handleGetDomain,
      },
      {
        toolDefinition: {
          name: GetDataElement_Tool.name,
          description: GetDataElement_Tool.description,
          inputSchema: GetDataElement_Tool.inputSchema,
        },
        handler: handleGetDataElement,
      },
      {
        toolDefinition: {
          name: GetTransport_Tool.name,
          description: GetTransport_Tool.description,
          inputSchema: GetTransport_Tool.inputSchema,
        },
        handler: handleGetTransport,
      },
      {
        toolDefinition: {
          name: GetView_Tool.name,
          description: GetView_Tool.description,
          inputSchema: GetView_Tool.inputSchema,
        },
        handler: handleGetView,
      },
      {
        toolDefinition: {
          name: GetServiceDefinition_Tool.name,
          description: GetServiceDefinition_Tool.description,
          inputSchema: GetServiceDefinition_Tool.inputSchema,
        },
        handler: handleGetServiceDefinition,
      },
      {
        toolDefinition: {
          name: GetSession_Tool.name,
          description: GetSession_Tool.description,
          inputSchema: GetSession_Tool.inputSchema,
        },
        handler: handleGetSession,
      },
      {
        toolDefinition: {
          name: GetInactiveObjects_Tool.name,
          description: GetInactiveObjects_Tool.description,
          inputSchema: GetInactiveObjects_Tool.inputSchema,
        },
        handler: handleGetInactiveObjects,
      },
      // Dynamic import tools
      {
        toolDefinition: {
          name: "GetAdtTypes",
          description: "Get all ADT types available in the system",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetAllTypes.js")).handleGetAdtTypes(args);
        },
      },
      {
        toolDefinition: {
          name: "GetObjectStructure",
          description: "Get object structure with includes hierarchy",
          inputSchema: {
            type: "object",
            properties: {
              object_name: { type: "string" },
              object_type: { type: "string" },
            },
            required: ["object_name", "object_type"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetObjectStructure.js")).handleGetObjectStructure(args);
        },
      },
      {
        toolDefinition: {
          name: "GetObjectsList",
          description: "Get list of objects by package",
          inputSchema: {
            type: "object",
            properties: { package_name: { type: "string" } },
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
      {
        toolDefinition: {
          name: "GetProgFullCode",
          description: "Get full program code with includes",
          inputSchema: {
            type: "object",
            properties: { program_name: { type: "string" } },
            required: ["program_name"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/program/readonly/handleGetProgFullCode.js")).handleGetProgFullCode(args);
        },
      },
      {
        toolDefinition: {
          name: "GetObjectNodeFromCache",
          description: "Get object node from cache",
          inputSchema: {
            type: "object",
            properties: {
              object_name: { type: "string" },
              object_type: { type: "string" },
            },
            required: ["object_name", "object_type"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetObjectNodeFromCache.js")).handleGetObjectNodeFromCache(args);
        },
      },
      {
        toolDefinition: {
          name: "DescribeByList",
          description: "Describe objects by list",
          inputSchema: {
            type: "object",
            properties: {
              objects: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["objects"],
          },
        },
        handler: async (args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleDescribeByList.js")).handleDescribeByList(args);
        },
      },
    ];
  }
}
