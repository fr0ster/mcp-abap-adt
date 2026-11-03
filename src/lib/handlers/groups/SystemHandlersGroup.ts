import {
  TOOL_DEFINITION as GetATCFindings_Tool,
  handleGetATCFindings,
} from '../../../handlers/atc/high/handleGetATCFindings';
import {
  TOOL_DEFINITION as GetATCResult_Tool,
  handleGetATCResult,
} from '../../../handlers/atc/high/handleGetATCResult';
import {
  TOOL_DEFINITION as GetATCRunStatus_Tool,
  handleGetATCRunStatus,
} from '../../../handlers/atc/high/handleGetATCRunStatus';
import {
  handleListATCResults,
  TOOL_DEFINITION as ListATCResults_Tool,
} from '../../../handlers/atc/high/handleListATCResults';
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
        call: handleGetServiceBindingPreviewUrl,
      },
      {
        toolDefinition: GetTypeInfo_Tool,
        call: handleGetTypeInfo,
      },
      {
        toolDefinition: GetTransaction_Tool,
        call: handleGetTransaction,
      },
      {
        toolDefinition: RuntimeListProfilerTraceFiles_Tool,
        call: (context) => handleRuntimeListProfilerTraceFiles(context),
      },
      {
        toolDefinition: RuntimeGetProfilerTraceData_Tool,
        call: handleRuntimeGetProfilerTraceData,
      },
      {
        toolDefinition: RuntimeGetDumpById_Tool,
        call: handleRuntimeGetDumpById,
      },
      // ATC — the run is three calls and the composite is this repository's,
      // which is what `AdtAtc` says in as many words when it explains why it
      // stopped being `IAdtRunnable`. A check run changes nothing in the
      // system (the owner's decision), so the read-only binaries serve it.
      {
        toolDefinition: RunATC_Tool,
        call: handleRunATC,
      },
      {
        toolDefinition: GetATCRunStatus_Tool,
        call: handleGetATCRunStatus,
      },
      {
        toolDefinition: GetATCFindings_Tool,
        call: handleGetATCFindings,
      },
      {
        toolDefinition: ListATCResults_Tool,
        call: handleListATCResults,
      },
      {
        toolDefinition: GetATCResult_Tool,
        call: handleGetATCResult,
      },
      {
        toolDefinition: RuntimeAnalyzeProfilerTrace_Tool,
        call: handleRuntimeAnalyzeProfilerTrace,
      },
      {
        toolDefinition: RuntimeListFeeds_Tool,
        call: handleRuntimeListFeeds,
      },
      {
        toolDefinition: RuntimeListSystemMessages_Tool,
        call: handleRuntimeListSystemMessages,
      },
      {
        toolDefinition: RuntimeGetGatewayErrorLog_Tool,
        call: handleRuntimeGetGatewayErrorLog,
      },
      {
        toolDefinition: GetSqlQuery_Tool,
        call: handleGetSqlQuery,
      },
      {
        toolDefinition: GetWhereUsed_Tool,
        call: handleGetWhereUsed,
      },
      {
        toolDefinition: GetObjectInfo_Tool,
        call: handleGetObjectInfo,
      },
      {
        toolDefinition: GetAbapAST_Tool,
        call: handleGetAbapAST,
      },
      {
        toolDefinition: GetAbapSemanticAnalysis_Tool,
        call: handleGetAbapSemanticAnalysis,
      },
      {
        toolDefinition: GetAbapSystemSymbols_Tool,
        call: handleGetAbapSystemSymbols,
      },
      {
        toolDefinition: GetInactiveObjects_Tool,
        call: handleGetInactiveObjects,
      },
      // Dynamic import handlers
      {
        toolDefinition: GetAdtTypes_Tool,
        call: handleGetAdtTypes,
      },
      {
        toolDefinition: GetObjectStructure_Tool,
        call: handleGetObjectStructure,
      },
      {
        toolDefinition: GetObjectNodeFromCache_Tool,
        call: handleGetObjectNodeFromCache,
      },
      {
        toolDefinition: DescribeByList_Tool,
        call: handleDescribeByList,
      },
      // High-level handler for package tree
      {
        toolDefinition: GetPackageTree_Tool,
        call: handleGetPackageTree,
      },
    ];
  }
}
