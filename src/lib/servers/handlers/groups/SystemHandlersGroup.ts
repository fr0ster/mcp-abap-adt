import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

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
import { handleGetAdtTypes } from "../../../../handlers/system/readonly/handleGetAllTypes";
import { handleGetObjectStructure } from "../../../../handlers/system/readonly/handleGetObjectStructure.js";
import { handleGetObjectNodeFromCache } from "../../../../handlers/system/readonly/handleGetObjectNodeFromCache.js";
import { handleDescribeByList } from "../../../../handlers/system/readonly/handleDescribeByList.js";


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
import { TOOL_DEFINITION as GetAdtTypes_Tool } from "../../../../handlers/system/readonly/handleGetAllTypes";
import { TOOL_DEFINITION as GetObjectStructure_Tool } from "../../../../handlers/system/readonly/handleGetObjectStructure";
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from "../../../../handlers/system/readonly/handleGetObjectNodeFromCache";
import { TOOL_DEFINITION as DescribeByList_Tool } from "../../../../handlers/system/readonly/handleDescribeByList";

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
        handler: (args: any) => handleGetTypeInfo(this.context, args),
      },
      {
        toolDefinition: {
          name: GetTransaction_Tool.name,
          description: GetTransaction_Tool.description,
          inputSchema: GetTransaction_Tool.inputSchema,
        },
        handler: (args: any) => handleGetTransaction(this.context, args),
      },
      {
        toolDefinition: {
          name: GetSqlQuery_Tool.name,
          description: GetSqlQuery_Tool.description,
          inputSchema: GetSqlQuery_Tool.inputSchema,
        },
        handler: (args: any) => handleGetSqlQuery(this.context, args),
      },
      {
        toolDefinition: {
          name: GetWhereUsed_Tool.name,
          description: GetWhereUsed_Tool.description,
          inputSchema: GetWhereUsed_Tool.inputSchema,
        },
        handler: (args: any) => handleGetWhereUsed(this.context, args),
      },
      {
        toolDefinition: {
          name: GetObjectInfo_Tool.name,
          description: GetObjectInfo_Tool.description,
          inputSchema: GetObjectInfo_Tool.inputSchema,
        },
        handler: async (args: any) => {
          if (!args || typeof args !== "object") {
            throw new Error("Missing or invalid arguments for GetObjectInfo");
          }
          return await handleGetObjectInfo(this.context, args as { parent_type: string; parent_name: string });
        },
      },
      {
        toolDefinition: {
          name: GetAbapAST_Tool.name,
          description: GetAbapAST_Tool.description,
          inputSchema: GetAbapAST_Tool.inputSchema,
        },
        handler: (args: any) => handleGetAbapAST(this.context, args),
      },
      {
        toolDefinition: {
          name: GetAbapSemanticAnalysis_Tool.name,
          description: GetAbapSemanticAnalysis_Tool.description,
          inputSchema: GetAbapSemanticAnalysis_Tool.inputSchema,
        },
        handler: (args: any) => handleGetAbapSemanticAnalysis(this.context, args),
      },
      {
        toolDefinition: {
          name: GetAbapSystemSymbols_Tool.name,
          description: GetAbapSystemSymbols_Tool.description,
          inputSchema: GetAbapSystemSymbols_Tool.inputSchema,
        },
        handler: (args: any) => handleGetAbapSystemSymbols(this.context, args),
      },
      {
        toolDefinition: {
          name: GetSession_Tool.name,
          description: GetSession_Tool.description,
          inputSchema: GetSession_Tool.inputSchema,
        },
        handler: (args: any) => handleGetSession(this.context, args),
      },
      {
        toolDefinition: {
          name: GetInactiveObjects_Tool.name,
          description: GetInactiveObjects_Tool.description,
          inputSchema: GetInactiveObjects_Tool.inputSchema,
        },
        handler: (args: any) => handleGetInactiveObjects(this.context, args),
      },
      // Dynamic import handlers
      {
        toolDefinition: {
          name: GetAdtTypes_Tool.name,
          description: GetAdtTypes_Tool.description,
          inputSchema: GetAdtTypes_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleGetAdtTypes(this.context, args as { type_name: string });
        },
      },
      {
        toolDefinition: {
          name: GetObjectStructure_Tool.name,
          description: GetObjectStructure_Tool.description,
          inputSchema: GetObjectStructure_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleGetObjectStructure(this.context, args as { object_type: string; object_name: string });
        },
      },
      {
        toolDefinition: {
          name: GetObjectNodeFromCache_Tool.name,
          description: GetObjectNodeFromCache_Tool.description,
          inputSchema: GetObjectNodeFromCache_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleGetObjectNodeFromCache(this.context, args as { object_type: string; object_name: string } | { object_type: string; object_name: string; cache_type: string } );
        },
      },
      {
        toolDefinition: {
          name: DescribeByList_Tool.name,
          description: DescribeByList_Tool.description,
          inputSchema: DescribeByList_Tool.inputSchema,
        },
        handler: (args: any) => {
          return handleDescribeByList(this.context, args as { object_type: string; object_name: string } | { object_type: string; object_name: string; cache_type: string } );
        },
      },
    ];
  }
}
