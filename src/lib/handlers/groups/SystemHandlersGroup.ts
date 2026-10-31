import {
  TOOL_DEFINITION as GetATCFindings_Tool,
  handleGetATCFindings,
} from '../../../handlers/atc/high/handleGetATCFindings';
import {
  TOOL_DEFINITION as GetATCRunStatus_Tool,
  handleGetATCRunStatus,
} from '../../../handlers/atc/high/handleGetATCRunStatus';
import {
  handleRunATC,
  TOOL_DEFINITION as RunATC_Tool,
} from '../../../handlers/atc/high/handleRunATC';
import {
  TOOL_DEFINITION as GetPackageTree_Tool,
  handleGetPackageTree,
} from '../../../handlers/system/high/handleGetPackageTree';
import { TOOL_DEFINITION as DescribeByList_Tool } from '../../../handlers/system/readonly/handleDescribeByList';
import { handleDescribeByList } from '../../../handlers/system/readonly/handleDescribeByList.js';
import {
  TOOL_DEFINITION as GetAbapAST_Tool,
  handleGetAbapAST,
} from '../../../handlers/system/readonly/handleGetAbapAST';
import {
  TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool,
  handleGetAbapSemanticAnalysis,
} from '../../../handlers/system/readonly/handleGetAbapSemanticAnalysis';
import {
  TOOL_DEFINITION as GetAbapSystemSymbols_Tool,
  handleGetAbapSystemSymbols,
} from '../../../handlers/system/readonly/handleGetAbapSystemSymbols';
import {
  TOOL_DEFINITION as GetAdtTypes_Tool,
  handleGetAdtTypes,
} from '../../../handlers/system/readonly/handleGetAllTypes';
import {
  TOOL_DEFINITION as GetInactiveObjects_Tool,
  handleGetInactiveObjects,
} from '../../../handlers/system/readonly/handleGetInactiveObjects';
import {
  TOOL_DEFINITION as GetObjectInfo_Tool,
  handleGetObjectInfo,
} from '../../../handlers/system/readonly/handleGetObjectInfo';
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from '../../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetObjectNodeFromCache } from '../../../handlers/system/readonly/handleGetObjectNodeFromCache.js';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure.js';
import {
  TOOL_DEFINITION as GetServiceBindingPreviewUrl_Tool,
  handleGetServiceBindingPreviewUrl,
} from '../../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import {
  TOOL_DEFINITION as GetSqlQuery_Tool,
  handleGetSqlQuery,
} from '../../../handlers/system/readonly/handleGetSqlQuery';
import {
  TOOL_DEFINITION as GetTransaction_Tool,
  handleGetTransaction,
} from '../../../handlers/system/readonly/handleGetTransaction';
// Import system handlers
// Import TOOL_DEFINITION from handlers
import {
  TOOL_DEFINITION as GetTypeInfo_Tool,
  handleGetTypeInfo,
} from '../../../handlers/system/readonly/handleGetTypeInfo';
import {
  TOOL_DEFINITION as GetWhereUsed_Tool,
  handleGetWhereUsed,
} from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  handleRuntimeAnalyzeProfilerTrace,
  TOOL_DEFINITION as RuntimeAnalyzeProfilerTrace_Tool,
} from '../../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace';
import {
  handleRuntimeGetDumpById,
  TOOL_DEFINITION as RuntimeGetDumpById_Tool,
} from '../../../handlers/system/readonly/handleRuntimeGetDumpById';
import {
  handleRuntimeGetGatewayErrorLog,
  TOOL_DEFINITION as RuntimeGetGatewayErrorLog_Tool,
} from '../../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import {
  handleRuntimeGetProfilerTraceData,
  TOOL_DEFINITION as RuntimeGetProfilerTraceData_Tool,
} from '../../../handlers/system/readonly/handleRuntimeGetProfilerTraceData';
import {
  handleRuntimeListFeeds,
  TOOL_DEFINITION as RuntimeListFeeds_Tool,
} from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  handleRuntimeListProfilerTraceFiles,
  TOOL_DEFINITION as RuntimeListProfilerTraceFiles_Tool,
} from '../../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles';
import {
  handleRuntimeListSystemMessages,
  TOOL_DEFINITION as RuntimeListSystemMessages_Tool,
} from '../../../handlers/system/readonly/handleRuntimeListSystemMessages';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerContext, HandlerEntry } from '../interfaces.js';

/**
 * Handler group for all system-related handlers
 * Contains handlers for system information, analysis, and metadata operations:
 * reads and checks that change nothing in the system. The tools that run code
 * or schedule a trace are `RuntimeRunHandlersGroup`'s.
 */
export class SystemHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'SystemHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Gets all system handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: GetServiceBindingPreviewUrl_Tool,
        handler: (args: any) =>
          handleGetServiceBindingPreviewUrl(this.context, args),
      },
      {
        toolDefinition: GetTypeInfo_Tool,
        handler: (args: any) => handleGetTypeInfo(this.context, args),
      },
      {
        toolDefinition: GetTransaction_Tool,
        handler: (args: any) => handleGetTransaction(this.context, args),
      },
      {
        toolDefinition: RuntimeListProfilerTraceFiles_Tool,
        handler: () => handleRuntimeListProfilerTraceFiles(this.context),
      },
      {
        toolDefinition: RuntimeGetProfilerTraceData_Tool,
        handler: (args: any) =>
          handleRuntimeGetProfilerTraceData(this.context, args),
      },
      {
        toolDefinition: RuntimeGetDumpById_Tool,
        handler: (args: any) => handleRuntimeGetDumpById(this.context, args),
      },
      // ATC — the run is three calls and the composite is this repository's,
      // which is what `AdtAtc` says in as many words when it explains why it
      // stopped being `IAdtRunnable`. A check run changes nothing in the
      // system (the owner's decision), so the read-only binaries serve it.
      {
        toolDefinition: RunATC_Tool,
        handler: (args: any) => handleRunATC(this.context, args),
      },
      {
        toolDefinition: GetATCRunStatus_Tool,
        handler: (args: any) => handleGetATCRunStatus(this.context, args),
      },
      {
        toolDefinition: GetATCFindings_Tool,
        handler: (args: any) => handleGetATCFindings(this.context, args),
      },
      {
        toolDefinition: RuntimeAnalyzeProfilerTrace_Tool,
        handler: (args: any) =>
          handleRuntimeAnalyzeProfilerTrace(this.context, args),
      },
      {
        toolDefinition: RuntimeListFeeds_Tool,
        handler: (args: any) => handleRuntimeListFeeds(this.context, args),
      },
      {
        toolDefinition: RuntimeListSystemMessages_Tool,
        handler: (args: any) =>
          handleRuntimeListSystemMessages(this.context, args),
      },
      {
        toolDefinition: RuntimeGetGatewayErrorLog_Tool,
        handler: (args: any) =>
          handleRuntimeGetGatewayErrorLog(this.context, args),
      },
      {
        toolDefinition: GetSqlQuery_Tool,
        handler: (args: any) => handleGetSqlQuery(this.context, args),
      },
      {
        toolDefinition: GetWhereUsed_Tool,
        handler: (args: any) => handleGetWhereUsed(this.context, args),
      },
      {
        toolDefinition: GetObjectInfo_Tool,
        handler: async (args: any) => {
          if (!args || typeof args !== 'object') {
            throw new Error('Missing or invalid arguments for GetObjectInfo');
          }
          return await handleGetObjectInfo(
            this.context,
            args as { parent_type: string; parent_name: string },
          );
        },
      },
      {
        toolDefinition: GetAbapAST_Tool,
        handler: (args: any) => handleGetAbapAST(this.context, args),
      },
      {
        toolDefinition: GetAbapSemanticAnalysis_Tool,
        handler: (args: any) =>
          handleGetAbapSemanticAnalysis(this.context, args),
      },
      {
        toolDefinition: GetAbapSystemSymbols_Tool,
        handler: (args: any) => handleGetAbapSystemSymbols(this.context, args),
      },
      {
        toolDefinition: GetInactiveObjects_Tool,
        handler: (args: any) => handleGetInactiveObjects(this.context, args),
      },
      // Dynamic import handlers
      {
        toolDefinition: GetAdtTypes_Tool,
        handler: (args: any) => {
          return handleGetAdtTypes(
            this.context,
            args as { detail?: 'terse' | 'full' | 'raw' },
          );
        },
      },
      {
        toolDefinition: GetObjectStructure_Tool,
        handler: (args: any) => {
          return handleGetObjectStructure(
            this.context,
            args as { object_type: string; object_name: string },
          );
        },
      },
      {
        toolDefinition: GetObjectNodeFromCache_Tool,
        handler: (args: any) => {
          return handleGetObjectNodeFromCache(
            this.context,
            args as
              | { object_type: string; object_name: string }
              | {
                  object_type: string;
                  object_name: string;
                  cache_type: string;
                },
          );
        },
      },
      {
        toolDefinition: DescribeByList_Tool,
        handler: (args: any) => {
          return handleDescribeByList(
            this.context,
            args as
              | { object_type: string; object_name: string }
              | {
                  object_type: string;
                  object_name: string;
                  cache_type: string;
                },
          );
        },
      },
      // High-level handler for package tree
      {
        toolDefinition: GetPackageTree_Tool,
        handler: (args: any) => {
          return handleGetPackageTree(
            this.context,
            args as {
              package_name: string;
              include_subpackages?: boolean;
              max_depth?: number;
              include_descriptions?: boolean;
            },
          );
        },
      },
    ];
  }
}
