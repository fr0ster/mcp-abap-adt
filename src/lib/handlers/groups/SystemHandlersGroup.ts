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
import {
  TOOL_DEFINITION as GetObjectOutline_Tool,
  handleGetObjectOutline,
} from '../../../handlers/system/readonly/handleGetObjectOutline';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure.js';
import {
  TOOL_DEFINITION as GetServiceBindingPreviewUrl_Tool,
  handleGetServiceBindingPreviewUrl,
} from '../../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
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
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

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
      defineTool(
        GetServiceBindingPreviewUrl_Tool,
        handleGetServiceBindingPreviewUrl,
      ),
      defineTool(GetTypeInfo_Tool, handleGetTypeInfo),
      defineTool(GetTransaction_Tool, handleGetTransaction),
      defineTool(RuntimeListProfilerTraceFiles_Tool, (context) =>
        handleRuntimeListProfilerTraceFiles(context),
      ),
      defineTool(
        RuntimeGetProfilerTraceData_Tool,
        handleRuntimeGetProfilerTraceData,
      ),
      defineTool(RuntimeGetDumpById_Tool, handleRuntimeGetDumpById),
      // ATC — the run is three calls and the composite is this repository's,
      // which is what `AdtAtc` says in as many words when it explains why it
      // stopped being `IAdtRunnable`. A check run changes nothing in the
      // system (the owner's decision), so the read-only binaries serve it.
      defineTool(RunATC_Tool, handleRunATC),
      defineTool(GetATCRunStatus_Tool, handleGetATCRunStatus),
      defineTool(GetATCFindings_Tool, handleGetATCFindings),
      defineTool(ListATCResults_Tool, handleListATCResults),
      defineTool(GetATCResult_Tool, handleGetATCResult),
      defineTool(
        RuntimeAnalyzeProfilerTrace_Tool,
        handleRuntimeAnalyzeProfilerTrace,
      ),
      defineTool(RuntimeListFeeds_Tool, handleRuntimeListFeeds),
      defineTool(
        RuntimeListSystemMessages_Tool,
        handleRuntimeListSystemMessages,
      ),
      defineTool(
        RuntimeGetGatewayErrorLog_Tool,
        handleRuntimeGetGatewayErrorLog,
      ),
      // GetSqlQuery is a data tool: DataHandlersGroup's, served only when
      // asked for.
      defineTool(GetWhereUsed_Tool, handleGetWhereUsed),
      defineTool(GetObjectInfo_Tool, handleGetObjectInfo),
      defineTool(GetInactiveObjects_Tool, handleGetInactiveObjects),
      // Dynamic import handlers
      defineTool(GetAdtTypes_Tool, handleGetAdtTypes),
      defineTool(GetObjectStructure_Tool, handleGetObjectStructure),
      defineTool(GetObjectOutline_Tool, handleGetObjectOutline),
      defineTool(GetObjectNodeFromCache_Tool, handleGetObjectNodeFromCache),
      defineTool(DescribeByList_Tool, handleDescribeByList),
      // High-level handler for package tree
      defineTool(GetPackageTree_Tool, handleGetPackageTree),
    ];
  }
}
