import {
  TOOL_DEFINITION as GetBehaviorDefinition_Tool,
  handleGetBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import {
  TOOL_DEFINITION as GetBehaviorImplementation_Tool,
  handleGetBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import {
  TOOL_DEFINITION as GetClass_Tool,
  handleGetClass,
} from '../../../handlers/class/high/handleGetClass';
import {
  TOOL_DEFINITION as GetObjectDraft_Tool,
  handleGetObjectDraft,
} from '../../../handlers/common/readonly/handleGetObjectDraft';
import {
  TOOL_DEFINITION as GetObjectVersionDiff_Tool,
  handleGetObjectVersionDiff,
} from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import {
  TOOL_DEFINITION as GetObjectVersionSource_Tool,
  handleGetObjectVersionSource,
} from '../../../handlers/common/readonly/handleGetObjectVersionSource';
import {
  TOOL_DEFINITION as GetObjectVersions_Tool,
  handleGetObjectVersions,
} from '../../../handlers/common/readonly/handleGetObjectVersions';
import {
  TOOL_DEFINITION as GetDataElement_Tool,
  handleGetDataElement,
} from '../../../handlers/data_element/high/handleGetDataElement';
import {
  TOOL_DEFINITION as GetDdl_Tool,
  handleGetDdl,
} from '../../../handlers/ddl/high/handleGetDdl';
import {
  TOOL_DEFINITION as GetDomain_Tool,
  handleGetDomain,
} from '../../../handlers/domain/high/handleGetDomain';
import {
  TOOL_DEFINITION as GetEnhancementImpl_Tool,
  handleGetEnhancementImpl,
} from '../../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import {
  TOOL_DEFINITION as GetEnhancementSpot_Tool,
  handleGetEnhancementSpot,
} from '../../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import {
  TOOL_DEFINITION as GetEnhancements_Tool,
  handleGetEnhancements,
} from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import {
  TOOL_DEFINITION as GetFunctionGroup_Tool,
  handleGetFunctionGroup,
} from '../../../handlers/function_group/high/handleGetFunctionGroup';
import {
  TOOL_DEFINITION as GetFunctionInclude_Tool,
  handleGetFunctionInclude,
} from '../../../handlers/function_include/readonly/handleGetFunctionInclude';
import {
  handleListFunctionGroupIncludes,
  TOOL_DEFINITION as ListFunctionGroupIncludes_Tool,
} from '../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import {
  handleListFunctionModules,
  TOOL_DEFINITION as ListFunctionModules_Tool,
} from '../../../handlers/function_include/readonly/handleListFunctionModules';
import {
  TOOL_DEFINITION as GetFunctionModule_Tool,
  handleGetFunctionModule,
} from '../../../handlers/function_module/high/handleGetFunctionModule';
import {
  TOOL_DEFINITION as GetInclude_Tool,
  handleGetInclude,
} from '../../../handlers/include/readonly/handleGetInclude';
import {
  TOOL_DEFINITION as GetIncludesList_Tool,
  handleGetIncludesList,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import {
  TOOL_DEFINITION as GetMainPrograms_Tool,
  handleGetMainPrograms,
} from '../../../handlers/include/readonly/handleGetMainPrograms';
import {
  TOOL_DEFINITION as GetInterface_Tool,
  handleGetInterface,
} from '../../../handlers/interface/high/handleGetInterface';
import {
  TOOL_DEFINITION as GetMessageClass_Tool,
  handleGetMessageClass,
} from '../../../handlers/message_class/high/handleGetMessageClass';
import {
  TOOL_DEFINITION as GetMessageClassMessage_Tool,
  handleGetMessageClassMessage,
} from '../../../handlers/message_class/high/handleGetMessageClassMessage';
import {
  TOOL_DEFINITION as GetMetadataExtension_Tool,
  handleGetMetadataExtension,
} from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
import {
  TOOL_DEFINITION as GetPackage_Tool,
  handleGetPackage,
} from '../../../handlers/package/high/handleGetPackage';
import {
  TOOL_DEFINITION as GetPackageContents_Tool,
  handleGetPackageContents,
} from '../../../handlers/package/readonly/handleGetPackageContents';
import {
  TOOL_DEFINITION as GetProgram_Tool,
  handleGetProgram,
} from '../../../handlers/program/high/handleGetProgram';
import {
  TOOL_DEFINITION as GetServiceBinding_Tool,
  handleGetServiceBinding,
} from '../../../handlers/service_binding/high/handleGetServiceBinding';
import {
  TOOL_DEFINITION as GetServiceDefinition_Tool,
  handleGetServiceDefinition,
} from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import {
  TOOL_DEFINITION as GetStructure_Tool,
  handleGetStructure,
} from '../../../handlers/structure/high/handleGetStructure';
import {
  TOOL_DEFINITION as GetStructuresList_Tool,
  handleGetStructuresList,
} from '../../../handlers/structure/readonly/handleGetStructuresList';
import {
  TOOL_DEFINITION as GetTable_Tool,
  handleGetTable,
} from '../../../handlers/table/high/handleGetTable';
import {
  TOOL_DEFINITION as GetTableType_Tool,
  handleGetTableType,
} from '../../../handlers/table_type/high/handleGetTableType';
import {
  TOOL_DEFINITION as GetTransport_Tool,
  handleGetTransport,
} from '../../../handlers/transport/readonly/handleGetTransport';
import {
  handleListTransports,
  TOOL_DEFINITION as ListTransports_Tool,
} from '../../../handlers/transport/readonly/handleListTransports';
import {
  handleReadTransportActionLog,
  TOOL_DEFINITION as ReadTransportActionLog_Tool,
} from '../../../handlers/transport/readonly/handleReadTransportActionLog';
import {
  handleReadTransportObjects,
  TOOL_DEFINITION as ReadTransportObjects_Tool,
} from '../../../handlers/transport/readonly/handleReadTransportObjects';
import {
  TOOL_DEFINITION as GetUnitTestResult_Tool,
  handleGetUnitTestResult,
} from '../../../handlers/unit_test/high/handleGetUnitTestResult';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';
import {
  type IReadOnlyDedupStrategy,
  NoDedupStrategy,
} from './strategies/index.js';

/**
 * Handler group for all readonly (read-only) handlers.
 * Contains handlers that only read data without modifying the ABAP system.
 *
 * Some tools are a COPY of a high-level tool under the same name, handler and
 * schema (the object reads `Get<Type>`, GetUnitTestResult — purely reads, so
 * a read-only caller may use them too). Two tools cannot share one name on one server, so a readonly
 * entry whose exact name another exposed group contributes is always
 * withheld, whatever the strategy: a caller granted both groups gets the tool
 * once, from that other group (high). An injected strategy may withhold
 * further entries by its own rule.
 */
export class ReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'ReadOnlyHandlers';
  private readonly overridingToolNames: ReadonlySet<string>;
  private readonly dedupStrategy: IReadOnlyDedupStrategy;

  constructor(
    context: HandlerContext,
    overridingToolNames: ReadonlySet<string> = new Set(),
    dedupStrategy: IReadOnlyDedupStrategy = new NoDedupStrategy(),
  ) {
    super(context);
    this.overridingToolNames = overridingToolNames;
    this.dedupStrategy = dedupStrategy;
  }

  /**
   * Gets all readonly handler entries, filtered by the dedup strategy.
   */
  getHandlers(): HandlerEntry[] {
    return this.getAllEntries().filter(
      (e) =>
        !this.overridingToolNames.has(e.toolDefinition.name) &&
        !this.dedupStrategy.shouldExclude(e, this.overridingToolNames),
    );
  }

  private getAllEntries(): HandlerEntry[] {
    return [
      // Existing readonly handlers. GetTableContents is a data tool:
      // DataHandlersGroup's, served only when asked for.
      defineTool(GetPackageContents_Tool, handleGetPackageContents),
      defineTool(GetInclude_Tool, handleGetInclude),
      defineTool(GetIncludesList_Tool, handleGetIncludesList),
      defineTool(GetMainPrograms_Tool, handleGetMainPrograms),
      defineTool(GetEnhancements_Tool, handleGetEnhancements),
      defineTool(GetEnhancementSpot_Tool, handleGetEnhancementSpot),
      defineTool(GetEnhancementImpl_Tool, handleGetEnhancementImpl),
      defineTool(GetTransport_Tool, handleGetTransport),
      defineTool(ListTransports_Tool, handleListTransports),
      defineTool(ReadTransportObjects_Tool, handleReadTransportObjects),
      defineTool(ReadTransportActionLog_Tool, handleReadTransportActionLog),
      defineTool(GetStructuresList_Tool, handleGetStructuresList),
      defineTool(GetObjectVersions_Tool, handleGetObjectVersions),
      defineTool(GetObjectDraft_Tool, handleGetObjectDraft),
      defineTool(GetObjectVersionSource_Tool, handleGetObjectVersionSource),
      defineTool(GetObjectVersionDiff_Tool, handleGetObjectVersionDiff),
      defineTool(
        ListFunctionGroupIncludes_Tool,
        handleListFunctionGroupIncludes,
      ),
      defineTool(ListFunctionModules_Tool, handleListFunctionModules),
      // The object reads, one Get<Type> per type. All but GetFunctionInclude
      // are copies of high-level tools: same name, schema and handler,
      // withheld by getHandlers() when the high group is exposed alongside.
      defineTool(GetBehaviorDefinition_Tool, handleGetBehaviorDefinition),
      defineTool(
        GetBehaviorImplementation_Tool,
        handleGetBehaviorImplementation,
      ),
      defineTool(GetClass_Tool, handleGetClass),
      defineTool(GetDataElement_Tool, handleGetDataElement),
      defineTool(GetDdl_Tool, handleGetDdl),
      defineTool(GetDomain_Tool, handleGetDomain),
      defineTool(GetTableType_Tool, handleGetTableType),
      defineTool(GetFunctionGroup_Tool, handleGetFunctionGroup),
      defineTool(GetFunctionInclude_Tool, handleGetFunctionInclude),
      defineTool(GetFunctionModule_Tool, handleGetFunctionModule),
      defineTool(GetInterface_Tool, handleGetInterface),
      defineTool(GetMessageClass_Tool, handleGetMessageClass),
      defineTool(GetMessageClassMessage_Tool, handleGetMessageClassMessage),
      defineTool(GetMetadataExtension_Tool, handleGetMetadataExtension),
      defineTool(GetPackage_Tool, handleGetPackage),
      defineTool(GetProgram_Tool, handleGetProgram),
      defineTool(GetServiceBinding_Tool, handleGetServiceBinding),
      defineTool(GetServiceDefinition_Tool, handleGetServiceDefinition),
      defineTool(GetStructure_Tool, handleGetStructure),
      defineTool(GetTable_Tool, handleGetTable),
      // Copies of high-level tools: same name, schema and handler. Withheld
      // by getHandlers() when the high group is exposed alongside.
      defineTool(GetUnitTestResult_Tool, handleGetUnitTestResult),
    ];
  }
}
