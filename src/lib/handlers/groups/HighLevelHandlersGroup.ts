import {
  TOOL_DEFINITION as CreateBdef_Tool,
  handleCreateBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import {
  handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionHigh,
  TOOL_DEFINITION as UpdateBdef_Tool,
} from '../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import {
  TOOL_DEFINITION as CreateBehaviorImplementation_Tool,
  handleCreateBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import {
  handleUpdateBehaviorImplementation,
  TOOL_DEFINITION as UpdateBehaviorImplementation_Tool,
} from '../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import {
  TOOL_DEFINITION as CreateClass_Tool,
  handleCreateClass,
} from '../../../handlers/class/high/handleCreateClass';
import {
  handleUpdateClass as handleUpdateClassHigh,
  TOOL_DEFINITION as UpdateClassHigh_Tool,
} from '../../../handlers/class/high/handleUpdateClass';
import {
  TOOL_DEFINITION as CreateDataElement_Tool,
  handleCreateDataElement,
} from '../../../handlers/data_element/high/handleCreateDataElement';
import {
  handleUpdateDataElement as handleUpdateDataElementHigh,
  TOOL_DEFINITION as UpdateDataElementHigh_Tool,
} from '../../../handlers/data_element/high/handleUpdateDataElement';
import {
  TOOL_DEFINITION as CreateDdlx_Tool,
  handleCreateMetadataExtension,
} from '../../../handlers/ddlx/high/handleCreateMetadataExtension';
import {
  handleUpdateMetadataExtension as handleUpdateMetadataExtensionHigh,
  TOOL_DEFINITION as UpdateDdlx_Tool,
} from '../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import {
  TOOL_DEFINITION as CreateDomain_Tool,
  handleCreateDomain,
} from '../../../handlers/domain/high/handleCreateDomain';
import {
  handleUpdateDomain as handleUpdateDomainHigh,
  TOOL_DEFINITION as UpdateDomainHigh_Tool,
} from '../../../handlers/domain/high/handleUpdateDomain';
import {
  TOOL_DEFINITION as CreateFunctionGroup_Tool,
  handleCreateFunctionGroup,
} from '../../../handlers/function/high/handleCreateFunctionGroup';
import {
  TOOL_DEFINITION as CreateFunctionModule_Tool,
  handleCreateFunctionModule,
} from '../../../handlers/function/high/handleCreateFunctionModule';
import {
  handleUpdateFunctionGroup,
  TOOL_DEFINITION as UpdateFunctionGroup_Tool,
} from '../../../handlers/function/high/handleUpdateFunctionGroup';
import {
  handleUpdateFunctionModule as handleUpdateFunctionModuleHigh,
  TOOL_DEFINITION as UpdateFunctionModuleHigh_Tool,
} from '../../../handlers/function/high/handleUpdateFunctionModule';
import {
  TOOL_DEFINITION as CreateInterface_Tool,
  handleCreateInterface,
} from '../../../handlers/interface/high/handleCreateInterface';
import {
  handleUpdateInterface as handleUpdateInterfaceHigh,
  TOOL_DEFINITION as UpdateInterfaceHigh_Tool,
} from '../../../handlers/interface/high/handleUpdateInterface';
// Import high-level handlers
// Import TOOL_DEFINITION from handlers
import {
  TOOL_DEFINITION as CreatePackage_Tool,
  handleCreatePackage,
} from '../../../handlers/package/high/handleCreatePackage';
import {
  TOOL_DEFINITION as CreateProgram_Tool,
  handleCreateProgram,
} from '../../../handlers/program/high/handleCreateProgram';
import {
  handleUpdateProgram as handleUpdateProgramHigh,
  TOOL_DEFINITION as UpdateProgramHigh_Tool,
} from '../../../handlers/program/high/handleUpdateProgram';
import {
  TOOL_DEFINITION as CreateServiceDefinition_Tool,
  handleCreateServiceDefinition,
} from '../../../handlers/service_definition/high/handleCreateServiceDefinition';
import {
  handleUpdateServiceDefinition,
  TOOL_DEFINITION as UpdateServiceDefinition_Tool,
} from '../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import {
  TOOL_DEFINITION as CreateStructure_Tool,
  handleCreateStructure,
} from '../../../handlers/structure/high/handleCreateStructure';
import {
  handleUpdateStructure as handleUpdateStructureHigh,
  TOOL_DEFINITION as UpdateStructureHigh_Tool,
} from '../../../handlers/structure/high/handleUpdateStructure';
import {
  TOOL_DEFINITION as CreateTable_Tool,
  handleCreateTable,
} from '../../../handlers/table/high/handleCreateTable';
import {
  handleUpdateTable as handleUpdateTableHigh,
  TOOL_DEFINITION as UpdateTableHigh_Tool,
} from '../../../handlers/table/high/handleUpdateTable';
import {
  TOOL_DEFINITION as CreateTransport_Tool,
  handleCreateTransport,
} from '../../../handlers/transport/high/handleCreateTransport';
import {
  TOOL_DEFINITION as CreateView_Tool,
  handleCreateView,
} from '../../../handlers/view/high/handleCreateView';
import {
  handleUpdateView as handleUpdateViewHigh,
  TOOL_DEFINITION as UpdateViewHigh_Tool,
} from '../../../handlers/view/high/handleUpdateView';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * Handler group for all high-level handlers
 * Contains handlers that perform CRUD operations using high-level APIs
 */
export class HighLevelHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'HighLevelHandlers';

  /**
   * Gets all high-level handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: CreatePackage_Tool.name,
          description: CreatePackage_Tool.description,
          inputSchema: CreatePackage_Tool.inputSchema,
        },
        handler: (args: any) => handleCreatePackage(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDomain_Tool.name,
          description: CreateDomain_Tool.description,
          inputSchema: CreateDomain_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateDomain(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDomainHigh_Tool.name,
          description: UpdateDomainHigh_Tool.description,
          inputSchema: UpdateDomainHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateDomainHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDataElement_Tool.name,
          description: CreateDataElement_Tool.description,
          inputSchema: CreateDataElement_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateDataElement(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDataElementHigh_Tool.name,
          description: UpdateDataElementHigh_Tool.description,
          inputSchema: UpdateDataElementHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateDataElementHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateTransport_Tool.name,
          description: CreateTransport_Tool.description,
          inputSchema: CreateTransport_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateTransport(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateTable_Tool.name,
          description: CreateTable_Tool.description,
          inputSchema: CreateTable_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateTable(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateTableHigh_Tool.name,
          description: UpdateTableHigh_Tool.description,
          inputSchema: UpdateTableHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateTableHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateStructure_Tool.name,
          description: CreateStructure_Tool.description,
          inputSchema: CreateStructure_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateStructure(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateStructureHigh_Tool.name,
          description: UpdateStructureHigh_Tool.description,
          inputSchema: UpdateStructureHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateStructureHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateView_Tool.name,
          description: CreateView_Tool.description,
          inputSchema: CreateView_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateView(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateViewHigh_Tool.name,
          description: UpdateViewHigh_Tool.description,
          inputSchema: UpdateViewHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateViewHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateServiceDefinition_Tool.name,
          description: CreateServiceDefinition_Tool.description,
          inputSchema: CreateServiceDefinition_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleCreateServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateServiceDefinition_Tool.name,
          description: UpdateServiceDefinition_Tool.description,
          inputSchema: UpdateServiceDefinition_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleUpdateServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateClass_Tool.name,
          description: CreateClass_Tool.description,
          inputSchema: CreateClass_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateClass(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateClassHigh_Tool.name,
          description: UpdateClassHigh_Tool.description,
          inputSchema: UpdateClassHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateClassHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateProgram_Tool.name,
          description: CreateProgram_Tool.description,
          inputSchema: CreateProgram_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateProgram(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateProgramHigh_Tool.name,
          description: UpdateProgramHigh_Tool.description,
          inputSchema: UpdateProgramHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateProgramHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateInterface_Tool.name,
          description: CreateInterface_Tool.description,
          inputSchema: CreateInterface_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateInterface(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateInterfaceHigh_Tool.name,
          description: UpdateInterfaceHigh_Tool.description,
          inputSchema: UpdateInterfaceHigh_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateInterfaceHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateFunctionGroup_Tool.name,
          description: CreateFunctionGroup_Tool.description,
          inputSchema: CreateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateFunctionGroup_Tool.name,
          description: UpdateFunctionGroup_Tool.description,
          inputSchema: UpdateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => handleUpdateFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateFunctionModule_Tool.name,
          description: CreateFunctionModule_Tool.description,
          inputSchema: CreateFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => handleCreateFunctionModule(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateFunctionModuleHigh_Tool.name,
          description: UpdateFunctionModuleHigh_Tool.description,
          inputSchema: UpdateFunctionModuleHigh_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleUpdateFunctionModuleHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateBdef_Tool.name,
          description: CreateBdef_Tool.description,
          inputSchema: CreateBdef_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleCreateBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateBdef_Tool.name,
          description: UpdateBdef_Tool.description,
          inputSchema: UpdateBdef_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleUpdateBehaviorDefinitionHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateBehaviorImplementation_Tool.name,
          description: CreateBehaviorImplementation_Tool.description,
          inputSchema: CreateBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleCreateBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateBehaviorImplementation_Tool.name,
          description: UpdateBehaviorImplementation_Tool.description,
          inputSchema: UpdateBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleUpdateBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDdlx_Tool.name,
          description: CreateDdlx_Tool.description,
          inputSchema: CreateDdlx_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleCreateMetadataExtension(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDdlx_Tool.name,
          description: UpdateDdlx_Tool.description,
          inputSchema: UpdateDdlx_Tool.inputSchema,
        },
        handler: (args: any) =>
          handleUpdateMetadataExtensionHigh(this.context, args),
      },
    ];
  }
}
