import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";
import { AbapConnection } from "@mcp-abap-adt/connection";

// Import system handlers
import { handleGetTypeInfo } from "../../../../handlers/system/readonly/handleGetTypeInfo";
import { handleGetTransaction } from "../../../../handlers/system/readonly/handleGetTransaction";
import { handleGetSqlQuery } from "../../../../handlers/system/readonly/handleGetSqlQuery";
import { handleGetWhereUsed } from "../../../../handlers/system/readonly/handleGetWhereUsed";
import { handleGetObjectInfo } from "../../../../handlers/system/readonly/handleGetObjectInfo";
import { handleGetAbapAST } from "../../../../handlers/system/readonly/handleGetAbapAST";
import { handleGetAbapSemanticAnalysis } from "../../../../handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { handleGetAbapSystemSymbols } from "../../../../handlers/system/readonly/handleGetAbapSystemSymbols";
import { handleGetSession } from "../../../../handlers/system/readonly/handleGetSession";
import { handleGetInactiveObjects } from "../../../../handlers/system/readonly/handleGetInactiveObjects";

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetTypeInfo_Tool } from "../../../../handlers/system/readonly/handleGetTypeInfo";
import { TOOL_DEFINITION as GetTransaction_Tool } from "../../../../handlers/system/readonly/handleGetTransaction";
import { TOOL_DEFINITION as GetSqlQuery_Tool } from "../../../../handlers/system/readonly/handleGetSqlQuery";
import { TOOL_DEFINITION as GetWhereUsed_Tool } from "../../../../handlers/system/readonly/handleGetWhereUsed";
import { TOOL_DEFINITION as GetObjectInfo_Tool } from "../../../../handlers/system/readonly/handleGetObjectInfo";
import { TOOL_DEFINITION as GetAbapAST_Tool } from "../../../../handlers/system/readonly/handleGetAbapAST";
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from "../../../../handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from "../../../../handlers/system/readonly/handleGetAbapSystemSymbols";
import { TOOL_DEFINITION as GetSession_Tool } from "../../../../handlers/system/readonly/handleGetSession";
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from "../../../../handlers/system/readonly/handleGetInactiveObjects";

/**
 * Handler group for all system-related handlers
 * Contains handlers for system information, analysis, and metadata operations
 */
export class SystemHandlersGroup extends BaseHandlerGroup {
  protected groupName = "SystemHandlers";

  /**
   * Gets all system handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
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
          name: GetTransaction_Tool.name,
          description: GetTransaction_Tool.description,
          inputSchema: GetTransaction_Tool.inputSchema,
        },
        handler: handleGetTransaction,
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
        handler: async (connection: AbapConnection, args: any) => {
          if (!args || typeof args !== "object") {
            throw new Error("Missing or invalid arguments for GetObjectInfo");
          }
          return await handleGetObjectInfo(connection, args as { parent_type: string; parent_name: string });
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
      // Dynamic import handlers
      {
        toolDefinition: {
          name: "GetAdtTypes",
          description: "Get all ADT types available in the system",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        handler: async (connection: AbapConnection, args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetAllTypes.js")).handleGetAdtTypes(connection, args);
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
        handler: async (connection: AbapConnection, args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetObjectStructure.js")).handleGetObjectStructure(connection, args);
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
        handler: async (connection: AbapConnection, args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleGetObjectNodeFromCache.js")).handleGetObjectNodeFromCache(connection, args);
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
        handler: async (connection: AbapConnection, args: any) => {
          return await (await import("../../../../handlers/system/readonly/handleDescribeByList.js")).handleDescribeByList(connection, args);
        },
      },
    ];
  }
}
