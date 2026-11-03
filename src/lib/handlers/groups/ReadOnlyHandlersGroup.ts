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
  TOOL_DEFINITION as GetTableContents_Tool,
  handleGetTableContents,
} from '../../../handlers/table/readonly/handleGetTableContents';
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
        call: handleGetTableContents,
      },
      {
        toolDefinition: GetPackageContents_Tool,
        call: handleGetPackageContents,
      },
      {
        toolDefinition: GetInclude_Tool,
        call: handleGetInclude,
      },
      {
        toolDefinition: GetIncludesList_Tool,
        call: handleGetIncludesList,
      },
      {
        toolDefinition: GetMainPrograms_Tool,
        call: handleGetMainPrograms,
      },
      {
        toolDefinition: GetEnhancements_Tool,
        call: handleGetEnhancements,
      },
      {
        toolDefinition: GetEnhancementSpot_Tool,
        call: handleGetEnhancementSpot,
      },
      {
        toolDefinition: GetEnhancementImpl_Tool,
        call: handleGetEnhancementImpl,
      },
      {
        toolDefinition: GetTransport_Tool,
        call: handleGetTransport,
      },
      {
        toolDefinition: ListTransports_Tool,
        call: handleListTransports,
      },
      {
        toolDefinition: ReadTransportObjects_Tool,
        call: handleReadTransportObjects,
      },
      {
        toolDefinition: ReadTransportActionLog_Tool,
        call: handleReadTransportActionLog,
      },
      {
        toolDefinition: GetStructuresList_Tool,
        call: handleGetStructuresList,
      },
      {
        toolDefinition: GetObjectVersions_Tool,
        call: handleGetObjectVersions,
      },
      {
        toolDefinition: GetObjectVersionSource_Tool,
        call: handleGetObjectVersionSource,
      },
      {
        toolDefinition: GetObjectVersionDiff_Tool,
        call: handleGetObjectVersionDiff,
      },
      {
        toolDefinition: ListFunctionGroupIncludes_Tool,
        call: handleListFunctionGroupIncludes,
      },
      {
        toolDefinition: ListFunctionModules_Tool,
        call: handleListFunctionModules,
      },
      // The object reads, one Get<Type> per type. All but GetFunctionInclude
      // are copies of high-level tools: same name, schema and handler,
      // withheld by getHandlers() when the high group is exposed alongside.
      {
        toolDefinition: GetBehaviorDefinition_Tool,
        call: handleGetBehaviorDefinition,
      },
      {
        toolDefinition: GetBehaviorImplementation_Tool,
        call: handleGetBehaviorImplementation,
      },
      {
        toolDefinition: GetClass_Tool,
        call: handleGetClass,
      },
      {
        toolDefinition: GetDataElement_Tool,
        call: handleGetDataElement,
      },
      {
        toolDefinition: GetDdl_Tool,
        call: handleGetDdl,
      },
      {
        toolDefinition: GetDomain_Tool,
        call: handleGetDomain,
      },
      {
        toolDefinition: GetTableType_Tool,
        call: handleGetTableType,
      },
      {
        toolDefinition: GetFunctionGroup_Tool,
        call: handleGetFunctionGroup,
      },
      {
        toolDefinition: GetFunctionInclude_Tool,
        call: handleGetFunctionInclude,
      },
      {
        toolDefinition: GetFunctionModule_Tool,
        call: handleGetFunctionModule,
      },
      {
        toolDefinition: GetInterface_Tool,
        call: handleGetInterface,
      },
      {
        toolDefinition: GetMessageClass_Tool,
        call: handleGetMessageClass,
      },
      {
        toolDefinition: GetMessageClassMessage_Tool,
        call: handleGetMessageClassMessage,
      },
      {
        toolDefinition: GetMetadataExtension_Tool,
        call: handleGetMetadataExtension,
      },
      {
        toolDefinition: GetPackage_Tool,
        call: handleGetPackage,
      },
      {
        toolDefinition: GetProgram_Tool,
        call: handleGetProgram,
      },
      {
        toolDefinition: GetServiceBinding_Tool,
        call: handleGetServiceBinding,
      },
      {
        toolDefinition: GetServiceDefinition_Tool,
        call: handleGetServiceDefinition,
      },
      {
        toolDefinition: GetStructure_Tool,
        call: handleGetStructure,
      },
      {
        toolDefinition: GetTable_Tool,
        call: handleGetTable,
      },
      // Copies of high-level tools: same name, schema and handler. Withheld
      // by getHandlers() when the high group is exposed alongside.
      {
        toolDefinition: GetUnitTestResult_Tool,
        call: handleGetUnitTestResult,
      },
    ];
  }
}
