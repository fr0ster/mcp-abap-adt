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
  TOOL_DEFINITION as GetTableContents_Tool,
  handleGetTableContents,
} from '../../../handlers/table/readonly/handleGetTableContents';
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
import {
  handleRunAbapUnit,
  TOOL_DEFINITION as RunAbapUnit_Tool,
} from '../../../handlers/unit_test/readonly/handleRunAbapUnit';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerContext, HandlerEntry } from '../interfaces.js';
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
      // Existing readonly handlers
      {
        toolDefinition: GetTableContents_Tool,
        handler: (args: any) => handleGetTableContents(this.context, args),
      },
      {
        toolDefinition: GetPackageContents_Tool,
        handler: (args: any) => handleGetPackageContents(this.context, args),
      },
      {
        toolDefinition: GetInclude_Tool,
        handler: (args: any) => handleGetInclude(this.context, args),
      },
      {
        toolDefinition: GetIncludesList_Tool,
        handler: (args: any) => handleGetIncludesList(this.context, args),
      },
      {
        toolDefinition: GetEnhancements_Tool,
        handler: (args: any) => handleGetEnhancements(this.context, args),
      },
      {
        toolDefinition: GetEnhancementSpot_Tool,
        handler: (args: any) => handleGetEnhancementSpot(this.context, args),
      },
      {
        toolDefinition: GetEnhancementImpl_Tool,
        handler: (args: any) => handleGetEnhancementImpl(this.context, args),
      },
      {
        toolDefinition: GetTransport_Tool,
        handler: (args: any) => handleGetTransport(this.context, args),
      },
      {
        toolDefinition: ListTransports_Tool,
        handler: (args: any) => handleListTransports(this.context, args),
      },
      {
        toolDefinition: ReadTransportObjects_Tool,
        handler: (args: any) => handleReadTransportObjects(this.context, args),
      },
      {
        toolDefinition: ReadTransportActionLog_Tool,
        handler: (args: any) =>
          handleReadTransportActionLog(this.context, args),
      },
      {
        toolDefinition: GetStructuresList_Tool,
        handler: (args: any) => handleGetStructuresList(this.context, args),
      },
      {
        toolDefinition: GetObjectVersions_Tool,
        handler: (args: any) => handleGetObjectVersions(this.context, args),
      },
      {
        toolDefinition: GetObjectVersionSource_Tool,
        handler: (args: any) =>
          handleGetObjectVersionSource(this.context, args),
      },
      {
        toolDefinition: GetObjectVersionDiff_Tool,
        handler: (args: any) => handleGetObjectVersionDiff(this.context, args),
      },
      {
        toolDefinition: ListFunctionGroupIncludes_Tool,
        handler: (args: any) =>
          handleListFunctionGroupIncludes(this.context, args),
      },
      {
        toolDefinition: ListFunctionModules_Tool,
        handler: (args: any) => handleListFunctionModules(this.context, args),
      },
      // The object reads, one Get<Type> per type. All but GetFunctionInclude
      // are copies of high-level tools: same name, schema and handler,
      // withheld by getHandlers() when the high group is exposed alongside.
      {
        toolDefinition: GetBehaviorDefinition_Tool,
        handler: (args: any) => handleGetBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: GetBehaviorImplementation_Tool,
        handler: (args: any) =>
          handleGetBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: GetClass_Tool,
        handler: (args: any) => handleGetClass(this.context, args),
      },
      {
        toolDefinition: GetDataElement_Tool,
        handler: (args: any) => handleGetDataElement(this.context, args),
      },
      {
        toolDefinition: GetDdl_Tool,
        handler: (args: any) => handleGetDdl(this.context, args),
      },
      {
        toolDefinition: GetDomain_Tool,
        handler: (args: any) => handleGetDomain(this.context, args),
      },
      {
        toolDefinition: GetFunctionGroup_Tool,
        handler: (args: any) => handleGetFunctionGroup(this.context, args),
      },
      {
        toolDefinition: GetFunctionInclude_Tool,
        handler: (args: any) => handleGetFunctionInclude(this.context, args),
      },
      {
        toolDefinition: GetFunctionModule_Tool,
        handler: (args: any) => handleGetFunctionModule(this.context, args),
      },
      {
        toolDefinition: GetInterface_Tool,
        handler: (args: any) => handleGetInterface(this.context, args),
      },
      {
        toolDefinition: GetMessageClass_Tool,
        handler: (args: any) => handleGetMessageClass(this.context, args),
      },
      {
        toolDefinition: GetMessageClassMessage_Tool,
        handler: (args: any) =>
          handleGetMessageClassMessage(this.context, args),
      },
      {
        toolDefinition: GetMetadataExtension_Tool,
        handler: (args: any) => handleGetMetadataExtension(this.context, args),
      },
      {
        toolDefinition: GetPackage_Tool,
        handler: (args: any) => handleGetPackage(this.context, args),
      },
      {
        toolDefinition: GetProgram_Tool,
        handler: (args: any) => handleGetProgram(this.context, args),
      },
      {
        toolDefinition: GetServiceBinding_Tool,
        handler: (args: any) => handleGetServiceBinding(this.context, args),
      },
      {
        toolDefinition: GetServiceDefinition_Tool,
        handler: (args: any) => handleGetServiceDefinition(this.context, args),
      },
      {
        toolDefinition: GetStructure_Tool,
        handler: (args: any) => handleGetStructure(this.context, args),
      },
      {
        toolDefinition: GetTable_Tool,
        handler: (args: any) => handleGetTable(this.context, args),
      },
      // ABAP Unit by a run target: a test run changes no object, so the
      // read-only binaries serve it too.
      {
        toolDefinition: RunAbapUnit_Tool,
        handler: (args: unknown) => handleRunAbapUnit(this.context, args),
      },
      // Copies of high-level tools: same name, schema and handler. Withheld
      // by getHandlers() when the high group is exposed alongside.
      {
        toolDefinition: GetUnitTestResult_Tool,
        handler: (args: any) => handleGetUnitTestResult(this.context, args),
      },
    ];
  }
}
