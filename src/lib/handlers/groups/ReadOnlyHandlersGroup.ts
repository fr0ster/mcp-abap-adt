import {
  handleReadBehaviorDefinition,
  TOOL_DEFINITION as ReadBehaviorDefinition_Tool,
} from '../../../handlers/behavior_definition/readonly/handleReadBehaviorDefinition';
import {
  handleReadBehaviorImplementation,
  TOOL_DEFINITION as ReadBehaviorImplementation_Tool,
} from '../../../handlers/behavior_implementation/readonly/handleReadBehaviorImplementation';
import {
  handleReadClass,
  TOOL_DEFINITION as ReadClass_Tool,
} from '../../../handlers/class/readonly/handleReadClass';
import {
  handleReadDataElement,
  TOOL_DEFINITION as ReadDataElement_Tool,
} from '../../../handlers/data_element/readonly/handleReadDataElement';
import {
  handleReadDomain,
  TOOL_DEFINITION as ReadDomain_Tool,
} from '../../../handlers/domain/readonly/handleReadDomain';
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
  handleReadFunctionGroup,
  TOOL_DEFINITION as ReadFunctionGroup_Tool,
} from '../../../handlers/function_group/readonly/handleReadFunctionGroup';
import {
  handleReadFunctionModule,
  TOOL_DEFINITION as ReadFunctionModule_Tool,
} from '../../../handlers/function_module/readonly/handleReadFunctionModule';
import {
  TOOL_DEFINITION as GetInclude_Tool,
  handleGetInclude,
} from '../../../handlers/include/readonly/handleGetInclude';
import {
  TOOL_DEFINITION as GetIncludesList_Tool,
  handleGetIncludesList,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import {
  handleReadInterface,
  TOOL_DEFINITION as ReadInterface_Tool,
} from '../../../handlers/interface/readonly/handleReadInterface';
import {
  handleReadMetadataExtension,
  TOOL_DEFINITION as ReadMetadataExtension_Tool,
} from '../../../handlers/metadata_extension/readonly/handleReadMetadataExtension';
import {
  TOOL_DEFINITION as GetPackageContents_Tool,
  handleGetPackageContents,
} from '../../../handlers/package/readonly/handleGetPackageContents';
import {
  handleReadPackage,
  TOOL_DEFINITION as ReadPackage_Tool,
} from '../../../handlers/package/readonly/handleReadPackage';
import {
  TOOL_DEFINITION as GetProgFullCode_Tool,
  handleGetProgFullCode,
} from '../../../handlers/program/readonly/handleGetProgFullCode';
import {
  handleReadProgram,
  TOOL_DEFINITION as ReadProgram_Tool,
} from '../../../handlers/program/readonly/handleReadProgram';
import {
  handleReadServiceBinding,
  TOOL_DEFINITION as ReadServiceBinding_Tool,
} from '../../../handlers/service_binding/readonly/handleReadServiceBinding';
import {
  handleReadServiceDefinition,
  TOOL_DEFINITION as ReadServiceDefinition_Tool,
} from '../../../handlers/service_definition/readonly/handleReadServiceDefinition';
import {
  handleReadStructure,
  TOOL_DEFINITION as ReadStructure_Tool,
} from '../../../handlers/structure/readonly/handleReadStructure';
import {
  TOOL_DEFINITION as GetTableContents_Tool,
  handleGetTableContents,
} from '../../../handlers/table/readonly/handleGetTableContents';
import {
  handleReadTable,
  TOOL_DEFINITION as ReadTable_Tool,
} from '../../../handlers/table/readonly/handleReadTable';
import {
  TOOL_DEFINITION as GetTransport_Tool,
  handleGetTransport,
} from '../../../handlers/transport/readonly/handleGetTransport';
import {
  handleListTransports,
  TOOL_DEFINITION as ListTransports_Tool,
} from '../../../handlers/transport/readonly/handleListTransports';
import {
  handleReadView,
  TOOL_DEFINITION as ReadView_Tool,
} from '../../../handlers/view/readonly/handleReadView';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * Handler group for all readonly (read-only) handlers.
 * Contains handlers that only read data without modifying the ABAP system.
 */
export class ReadOnlyHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'ReadOnlyHandlers';

  /**
   * Gets all readonly handler entries
   */
  getHandlers(): HandlerEntry[] {
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
        toolDefinition: GetProgFullCode_Tool,
        handler: (args: any) => handleGetProgFullCode(this.context, args),
      },
      // Read object source + metadata handlers
      {
        toolDefinition: ReadClass_Tool,
        handler: (args: any) => handleReadClass(this.context, args),
      },
      {
        toolDefinition: ReadInterface_Tool,
        handler: (args: any) => handleReadInterface(this.context, args),
      },
      {
        toolDefinition: ReadProgram_Tool,
        handler: (args: any) => handleReadProgram(this.context, args),
      },
      {
        toolDefinition: ReadTable_Tool,
        handler: (args: any) => handleReadTable(this.context, args),
      },
      {
        toolDefinition: ReadStructure_Tool,
        handler: (args: any) => handleReadStructure(this.context, args),
      },
      {
        toolDefinition: ReadView_Tool,
        handler: (args: any) => handleReadView(this.context, args),
      },
      {
        toolDefinition: ReadDomain_Tool,
        handler: (args: any) => handleReadDomain(this.context, args),
      },
      {
        toolDefinition: ReadDataElement_Tool,
        handler: (args: any) => handleReadDataElement(this.context, args),
      },
      {
        toolDefinition: ReadFunctionModule_Tool,
        handler: (args: any) => handleReadFunctionModule(this.context, args),
      },
      {
        toolDefinition: ReadFunctionGroup_Tool,
        handler: (args: any) => handleReadFunctionGroup(this.context, args),
      },
      {
        toolDefinition: ReadPackage_Tool,
        handler: (args: any) => handleReadPackage(this.context, args),
      },
      {
        toolDefinition: ReadServiceDefinition_Tool,
        handler: (args: any) => handleReadServiceDefinition(this.context, args),
      },
      {
        toolDefinition: ReadMetadataExtension_Tool,
        handler: (args: any) => handleReadMetadataExtension(this.context, args),
      },
      {
        toolDefinition: ReadBehaviorDefinition_Tool,
        handler: (args: any) =>
          handleReadBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: ReadBehaviorImplementation_Tool,
        handler: (args: any) =>
          handleReadBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: ReadServiceBinding_Tool,
        handler: (args: any) => handleReadServiceBinding(this.context, args),
      },
    ];
  }
}
