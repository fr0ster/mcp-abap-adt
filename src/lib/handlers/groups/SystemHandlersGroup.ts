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
  TOOL_DEFINITION as GetSession_Tool,
  handleGetSession,
} from '../../../handlers/system/readonly/handleGetSession';
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
  handleRuntimeCreateProfilerTraceParameters,
  TOOL_DEFINITION as RuntimeCreateProfilerTraceParameters_Tool,
} from '../../../handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters';
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
import {
  handleRuntimeRunClass,
  TOOL_DEFINITION as RuntimeRunClass_Tool,
} from '../../../handlers/system/readonly/handleRuntimeRunClass';
import {
  handleRuntimeRunProgram,
  TOOL_DEFINITION as RuntimeRunProgram_Tool,
} from '../../../handlers/system/readonly/handleRuntimeRunProgram';
import { withoutBackgroundParameter } from '../../backgroundRuns/tools.js';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerContext, HandlerEntry } from '../interfaces.js';

/** Which form of the system tools a binary serves. */
export interface SystemHandlersOptions {
  /**
   * Whether the run tools (`RuntimeRunClass`, `RuntimeRunProgram`) offer
   * `background`. Default: offered. A read-only binary serves them without
   * it (C23): it keeps no background run, so the parameter does not exist
   * there — not offered, not read, not refused.
   */
  background?: boolean;
}

/**
 * Handler group for all system-related handlers
 * Contains handlers for system information, analysis, and metadata operations
 */
export class SystemHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'SystemHandlers';

  constructor(
    context: HandlerContext,
    private readonly options: SystemHandlersOptions = {},
  ) {
    super(context);
  }

  /**
   * Gets all system handler entries
   */
  getHandlers(): HandlerEntry[] {
    const entries = this.entries();
    return this.options.background === false
      ? entries.map((entry) => ({
          ...entry,
          toolDefinition: withoutBackgroundParameter(entry.toolDefinition),
        }))
      : entries;
  }

  private entries(): HandlerEntry[] {
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
        toolDefinition: RuntimeCreateProfilerTraceParameters_Tool,
        handler: (args: any) =>
          handleRuntimeCreateProfilerTraceParameters(this.context, args),
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
      {
        toolDefinition: RuntimeRunClass_Tool,
        handler: (args: any) => handleRuntimeRunClass(this.context, args),
      },
      {
        toolDefinition: RuntimeRunProgram_Tool,
        handler: (args: any) => handleRuntimeRunProgram(this.context, args),
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
        toolDefinition: GetSession_Tool,
        handler: (args: any) => handleGetSession(this.context, args),
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
