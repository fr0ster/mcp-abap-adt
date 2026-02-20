import {
  TOOL_DEFINITION as CreateBdef_Tool,
  handleCreateBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import {
  TOOL_DEFINITION as DeleteBehaviorDefinition_Tool,
  handleDeleteBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import {
  TOOL_DEFINITION as GetBehaviorDefinition_Tool,
  handleGetBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import {
  handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionHigh,
  TOOL_DEFINITION as UpdateBdef_Tool,
} from '../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import {
  TOOL_DEFINITION as CreateBehaviorImplementation_Tool,
  handleCreateBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import {
  TOOL_DEFINITION as DeleteBehaviorImplementation_Tool,
  handleDeleteBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import {
  TOOL_DEFINITION as GetBehaviorImplementation_Tool,
  handleGetBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import {
  handleUpdateBehaviorImplementation,
  TOOL_DEFINITION as UpdateBehaviorImplementation_Tool,
} from '../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import {
  TOOL_DEFINITION as CreateClass_Tool,
  handleCreateClass,
} from '../../../handlers/class/high/handleCreateClass';
import {
  TOOL_DEFINITION as CreateLocalDefinitions_Tool,
  handleCreateLocalDefinitions,
} from '../../../handlers/class/high/handleCreateLocalDefinitions';
import {
  TOOL_DEFINITION as CreateLocalMacros_Tool,
  handleCreateLocalMacros,
} from '../../../handlers/class/high/handleCreateLocalMacros';
import {
  TOOL_DEFINITION as CreateLocalTestClass_Tool,
  handleCreateLocalTestClass,
} from '../../../handlers/class/high/handleCreateLocalTestClass';
import {
  TOOL_DEFINITION as CreateLocalTypes_Tool,
  handleCreateLocalTypes,
} from '../../../handlers/class/high/handleCreateLocalTypes';
import {
  TOOL_DEFINITION as DeleteClass_Tool,
  handleDeleteClass,
} from '../../../handlers/class/high/handleDeleteClass';
import {
  TOOL_DEFINITION as DeleteLocalDefinitions_Tool,
  handleDeleteLocalDefinitions,
} from '../../../handlers/class/high/handleDeleteLocalDefinitions';
import {
  TOOL_DEFINITION as DeleteLocalMacros_Tool,
  handleDeleteLocalMacros,
} from '../../../handlers/class/high/handleDeleteLocalMacros';
import {
  TOOL_DEFINITION as DeleteLocalTestClass_Tool,
  handleDeleteLocalTestClass,
} from '../../../handlers/class/high/handleDeleteLocalTestClass';
import {
  TOOL_DEFINITION as DeleteLocalTypes_Tool,
  handleDeleteLocalTypes,
} from '../../../handlers/class/high/handleDeleteLocalTypes';
import {
  TOOL_DEFINITION as GetClass_Tool,
  handleGetClass,
} from '../../../handlers/class/high/handleGetClass';
import {
  TOOL_DEFINITION as GetLocalDefinitions_Tool,
  handleGetLocalDefinitions,
} from '../../../handlers/class/high/handleGetLocalDefinitions';
import {
  TOOL_DEFINITION as GetLocalMacros_Tool,
  handleGetLocalMacros,
} from '../../../handlers/class/high/handleGetLocalMacros';
import {
  TOOL_DEFINITION as GetLocalTestClass_Tool,
  handleGetLocalTestClass,
} from '../../../handlers/class/high/handleGetLocalTestClass';
import {
  TOOL_DEFINITION as GetLocalTypes_Tool,
  handleGetLocalTypes,
} from '../../../handlers/class/high/handleGetLocalTypes';
import {
  handleUpdateClass as handleUpdateClassHigh,
  TOOL_DEFINITION as UpdateClassHigh_Tool,
} from '../../../handlers/class/high/handleUpdateClass';
import {
  handleUpdateLocalDefinitions,
  TOOL_DEFINITION as UpdateLocalDefinitions_Tool,
} from '../../../handlers/class/high/handleUpdateLocalDefinitions';
import {
  handleUpdateLocalMacros,
  TOOL_DEFINITION as UpdateLocalMacros_Tool,
} from '../../../handlers/class/high/handleUpdateLocalMacros';
import {
  handleUpdateLocalTestClass,
  TOOL_DEFINITION as UpdateLocalTestClass_Tool,
} from '../../../handlers/class/high/handleUpdateLocalTestClass';
import {
  handleUpdateLocalTypes,
  TOOL_DEFINITION as UpdateLocalTypes_Tool,
} from '../../../handlers/class/high/handleUpdateLocalTypes';
import {
  TOOL_DEFINITION as CreateDataElement_Tool,
  handleCreateDataElement,
} from '../../../handlers/data_element/high/handleCreateDataElement';
import {
  TOOL_DEFINITION as DeleteDataElement_Tool,
  handleDeleteDataElement,
} from '../../../handlers/data_element/high/handleDeleteDataElement';
import {
  TOOL_DEFINITION as GetDataElement_Tool,
  handleGetDataElement,
} from '../../../handlers/data_element/high/handleGetDataElement';
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
  TOOL_DEFINITION as DeleteDomain_Tool,
  handleDeleteDomain,
} from '../../../handlers/domain/high/handleDeleteDomain';
import {
  TOOL_DEFINITION as GetDomain_Tool,
  handleGetDomain,
} from '../../../handlers/domain/high/handleGetDomain';
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
  TOOL_DEFINITION as DeleteFunctionGroup_Tool,
  handleDeleteFunctionGroup,
} from '../../../handlers/function_group/high/handleDeleteFunctionGroup';
import {
  TOOL_DEFINITION as GetFunctionGroup_Tool,
  handleGetFunctionGroup,
} from '../../../handlers/function_group/high/handleGetFunctionGroup';
import {
  TOOL_DEFINITION as DeleteFunctionModule_Tool,
  handleDeleteFunctionModule,
} from '../../../handlers/function_module/high/handleDeleteFunctionModule';
import {
  TOOL_DEFINITION as GetFunctionModule_Tool,
  handleGetFunctionModule,
} from '../../../handlers/function_module/high/handleGetFunctionModule';
import {
  TOOL_DEFINITION as CreateInterface_Tool,
  handleCreateInterface,
} from '../../../handlers/interface/high/handleCreateInterface';
import {
  TOOL_DEFINITION as DeleteInterface_Tool,
  handleDeleteInterface,
} from '../../../handlers/interface/high/handleDeleteInterface';
import {
  TOOL_DEFINITION as GetInterface_Tool,
  handleGetInterface,
} from '../../../handlers/interface/high/handleGetInterface';
import {
  handleUpdateInterface as handleUpdateInterfaceHigh,
  TOOL_DEFINITION as UpdateInterfaceHigh_Tool,
} from '../../../handlers/interface/high/handleUpdateInterface';
import {
  TOOL_DEFINITION as DeleteMetadataExtension_Tool,
  handleDeleteMetadataExtension,
} from '../../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import {
  TOOL_DEFINITION as GetMetadataExtension_Tool,
  handleGetMetadataExtension,
} from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
// Import high-level handlers
// Import TOOL_DEFINITION from handlers
import {
  TOOL_DEFINITION as CreatePackage_Tool,
  handleCreatePackage,
} from '../../../handlers/package/high/handleCreatePackage';
import {
  TOOL_DEFINITION as GetPackage_Tool,
  handleGetPackage,
} from '../../../handlers/package/high/handleGetPackage';
import {
  TOOL_DEFINITION as CreateProgram_Tool,
  handleCreateProgram,
} from '../../../handlers/program/high/handleCreateProgram';
import {
  TOOL_DEFINITION as DeleteProgram_Tool,
  handleDeleteProgram,
} from '../../../handlers/program/high/handleDeleteProgram';
import {
  TOOL_DEFINITION as GetProgram_Tool,
  handleGetProgram,
} from '../../../handlers/program/high/handleGetProgram';
import {
  handleUpdateProgram as handleUpdateProgramHigh,
  TOOL_DEFINITION as UpdateProgramHigh_Tool,
} from '../../../handlers/program/high/handleUpdateProgram';
import {
  TOOL_DEFINITION as CreateServiceBinding_Tool,
  handleCreateServiceBinding,
} from '../../../handlers/service_binding/high/handleCreateServiceBinding';
import {
  TOOL_DEFINITION as DeleteServiceBinding_Tool,
  handleDeleteServiceBinding,
} from '../../../handlers/service_binding/high/handleDeleteServiceBinding';
import {
  TOOL_DEFINITION as GetServiceBinding_Tool,
  handleGetServiceBinding,
} from '../../../handlers/service_binding/high/handleGetServiceBinding';
import {
  handleListServiceBindingTypes,
  TOOL_DEFINITION as ListServiceBindingTypes_Tool,
} from '../../../handlers/service_binding/high/handleListServiceBindingTypes';
import {
  handleUpdateServiceBinding,
  TOOL_DEFINITION as UpdateServiceBinding_Tool,
} from '../../../handlers/service_binding/high/handleUpdateServiceBinding';
import {
  handleValidateServiceBinding,
  TOOL_DEFINITION as ValidateServiceBinding_Tool,
} from '../../../handlers/service_binding/high/handleValidateServiceBinding';
import {
  TOOL_DEFINITION as CreateServiceDefinition_Tool,
  handleCreateServiceDefinition,
} from '../../../handlers/service_definition/high/handleCreateServiceDefinition';
import {
  TOOL_DEFINITION as DeleteServiceDefinition_Tool,
  handleDeleteServiceDefinition,
} from '../../../handlers/service_definition/high/handleDeleteServiceDefinition';
import {
  TOOL_DEFINITION as GetServiceDefinition_Tool,
  handleGetServiceDefinition,
} from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import {
  handleUpdateServiceDefinition,
  TOOL_DEFINITION as UpdateServiceDefinition_Tool,
} from '../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import {
  TOOL_DEFINITION as CreateStructure_Tool,
  handleCreateStructure,
} from '../../../handlers/structure/high/handleCreateStructure';
import {
  TOOL_DEFINITION as DeleteStructure_Tool,
  handleDeleteStructure,
} from '../../../handlers/structure/high/handleDeleteStructure';
import {
  TOOL_DEFINITION as GetStructure_Tool,
  handleGetStructure,
} from '../../../handlers/structure/high/handleGetStructure';
import {
  handleUpdateStructure as handleUpdateStructureHigh,
  TOOL_DEFINITION as UpdateStructureHigh_Tool,
} from '../../../handlers/structure/high/handleUpdateStructure';
import {
  TOOL_DEFINITION as CreateTable_Tool,
  handleCreateTable,
} from '../../../handlers/table/high/handleCreateTable';
import {
  TOOL_DEFINITION as DeleteTable_Tool,
  handleDeleteTable,
} from '../../../handlers/table/high/handleDeleteTable';
import {
  TOOL_DEFINITION as GetTable_Tool,
  handleGetTable,
} from '../../../handlers/table/high/handleGetTable';
import {
  handleUpdateTable as handleUpdateTableHigh,
  TOOL_DEFINITION as UpdateTableHigh_Tool,
} from '../../../handlers/table/high/handleUpdateTable';
import {
  TOOL_DEFINITION as CreateTransport_Tool,
  handleCreateTransport,
} from '../../../handlers/transport/high/handleCreateTransport';
import {
  TOOL_DEFINITION as CreateCdsUnitTest_Tool,
  handleCreateCdsUnitTest,
} from '../../../handlers/unit_test/high/handleCreateCdsUnitTest';
import {
  TOOL_DEFINITION as CreateUnitTest_Tool,
  handleCreateUnitTest,
} from '../../../handlers/unit_test/high/handleCreateUnitTest';
import {
  TOOL_DEFINITION as DeleteCdsUnitTest_Tool,
  handleDeleteCdsUnitTest,
} from '../../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import {
  TOOL_DEFINITION as DeleteUnitTest_Tool,
  handleDeleteUnitTest,
} from '../../../handlers/unit_test/high/handleDeleteUnitTest';
import {
  TOOL_DEFINITION as GetCdsUnitTest_Tool,
  handleGetCdsUnitTest,
} from '../../../handlers/unit_test/high/handleGetCdsUnitTest';
import {
  TOOL_DEFINITION as GetCdsUnitTestResult_Tool,
  handleGetCdsUnitTestResult,
} from '../../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import {
  TOOL_DEFINITION as GetCdsUnitTestStatus_Tool,
  handleGetCdsUnitTestStatus,
} from '../../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import {
  TOOL_DEFINITION as GetUnitTest_Tool,
  handleGetUnitTest,
} from '../../../handlers/unit_test/high/handleGetUnitTest';
import {
  TOOL_DEFINITION as GetUnitTestResult_Tool,
  handleGetUnitTestResult,
} from '../../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  TOOL_DEFINITION as GetUnitTestStatus_Tool,
  handleGetUnitTestStatus,
} from '../../../handlers/unit_test/high/handleGetUnitTestStatus';
import {
  handleRunUnitTest,
  TOOL_DEFINITION as RunUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunUnitTest';
import {
  handleUpdateCdsUnitTest,
  TOOL_DEFINITION as UpdateCdsUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import {
  handleUpdateUnitTest,
  TOOL_DEFINITION as UpdateUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateUnitTest';
import {
  TOOL_DEFINITION as CreateView_Tool,
  handleCreateView,
} from '../../../handlers/view/high/handleCreateView';
import {
  TOOL_DEFINITION as DeleteView_Tool,
  handleDeleteView,
} from '../../../handlers/view/high/handleDeleteView';
import {
  TOOL_DEFINITION as GetView_Tool,
  handleGetView,
} from '../../../handlers/view/high/handleGetView';
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
        handler: (args: unknown) => handleCreatePackage(this.context, args),
      },
      {
        toolDefinition: {
          name: GetPackage_Tool.name,
          description: GetPackage_Tool.description,
          inputSchema: GetPackage_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetPackage(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDomain_Tool.name,
          description: CreateDomain_Tool.description,
          inputSchema: CreateDomain_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateDomain(this.context, args),
      },
      {
        toolDefinition: {
          name: GetDomain_Tool.name,
          description: GetDomain_Tool.description,
          inputSchema: GetDomain_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetDomain(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDomainHigh_Tool.name,
          description: UpdateDomainHigh_Tool.description,
          inputSchema: UpdateDomainHigh_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateDomainHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteDomain_Tool.name,
          description: DeleteDomain_Tool.description,
          inputSchema: DeleteDomain_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteDomain(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDataElement_Tool.name,
          description: CreateDataElement_Tool.description,
          inputSchema: CreateDataElement_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateDataElement(this.context, args),
      },
      {
        toolDefinition: {
          name: GetDataElement_Tool.name,
          description: GetDataElement_Tool.description,
          inputSchema: GetDataElement_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetDataElement(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDataElementHigh_Tool.name,
          description: UpdateDataElementHigh_Tool.description,
          inputSchema: UpdateDataElementHigh_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateDataElementHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteDataElement_Tool.name,
          description: DeleteDataElement_Tool.description,
          inputSchema: DeleteDataElement_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteDataElement(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateTransport_Tool.name,
          description: CreateTransport_Tool.description,
          inputSchema: CreateTransport_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateTransport(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateTable_Tool.name,
          description: CreateTable_Tool.description,
          inputSchema: CreateTable_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateTable(this.context, args),
      },
      {
        toolDefinition: {
          name: GetTable_Tool.name,
          description: GetTable_Tool.description,
          inputSchema: GetTable_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetTable(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateTableHigh_Tool.name,
          description: UpdateTableHigh_Tool.description,
          inputSchema: UpdateTableHigh_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateTableHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteTable_Tool.name,
          description: DeleteTable_Tool.description,
          inputSchema: DeleteTable_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteTable(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateStructure_Tool.name,
          description: CreateStructure_Tool.description,
          inputSchema: CreateStructure_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateStructure(this.context, args),
      },
      {
        toolDefinition: {
          name: GetStructure_Tool.name,
          description: GetStructure_Tool.description,
          inputSchema: GetStructure_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetStructure(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateStructureHigh_Tool.name,
          description: UpdateStructureHigh_Tool.description,
          inputSchema: UpdateStructureHigh_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateStructureHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteStructure_Tool.name,
          description: DeleteStructure_Tool.description,
          inputSchema: DeleteStructure_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteStructure(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateView_Tool.name,
          description: CreateView_Tool.description,
          inputSchema: CreateView_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateView(this.context, args),
      },
      {
        toolDefinition: {
          name: GetView_Tool.name,
          description: GetView_Tool.description,
          inputSchema: GetView_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetView(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateViewHigh_Tool.name,
          description: UpdateViewHigh_Tool.description,
          inputSchema: UpdateViewHigh_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateViewHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteView_Tool.name,
          description: DeleteView_Tool.description,
          inputSchema: DeleteView_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteView(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateServiceDefinition_Tool.name,
          description: CreateServiceDefinition_Tool.description,
          inputSchema: CreateServiceDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: GetServiceDefinition_Tool.name,
          description: GetServiceDefinition_Tool.description,
          inputSchema: GetServiceDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateServiceDefinition_Tool.name,
          description: UpdateServiceDefinition_Tool.description,
          inputSchema: UpdateServiceDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteServiceDefinition_Tool.name,
          description: DeleteServiceDefinition_Tool.description,
          inputSchema: DeleteServiceDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteServiceDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateServiceBinding_Tool.name,
          description: CreateServiceBinding_Tool.description,
          inputSchema: CreateServiceBinding_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateServiceBinding(this.context, args),
      },
      {
        toolDefinition: {
          name: ListServiceBindingTypes_Tool.name,
          description: ListServiceBindingTypes_Tool.description,
          inputSchema: ListServiceBindingTypes_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleListServiceBindingTypes(this.context, args),
      },
      {
        toolDefinition: {
          name: GetServiceBinding_Tool.name,
          description: GetServiceBinding_Tool.description,
          inputSchema: GetServiceBinding_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetServiceBinding(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateServiceBinding_Tool.name,
          description: UpdateServiceBinding_Tool.description,
          inputSchema: UpdateServiceBinding_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateServiceBinding(this.context, args),
      },
      {
        toolDefinition: {
          name: ValidateServiceBinding_Tool.name,
          description: ValidateServiceBinding_Tool.description,
          inputSchema: ValidateServiceBinding_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleValidateServiceBinding(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteServiceBinding_Tool.name,
          description: DeleteServiceBinding_Tool.description,
          inputSchema: DeleteServiceBinding_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteServiceBinding(this.context, args),
      },
      {
        toolDefinition: {
          name: GetClass_Tool.name,
          description: GetClass_Tool.description,
          inputSchema: GetClass_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetClass(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateClass_Tool.name,
          description: CreateClass_Tool.description,
          inputSchema: CreateClass_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateClass(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateClassHigh_Tool.name,
          description: UpdateClassHigh_Tool.description,
          inputSchema: UpdateClassHigh_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateClassHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteClass_Tool.name,
          description: DeleteClass_Tool.description,
          inputSchema: DeleteClass_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteClass(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateUnitTest_Tool.name,
          description: CreateUnitTest_Tool.description,
          inputSchema: CreateUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: RunUnitTest_Tool.name,
          description: RunUnitTest_Tool.description,
          inputSchema: RunUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleRunUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: GetUnitTest_Tool.name,
          description: GetUnitTest_Tool.description,
          inputSchema: GetUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: GetUnitTestStatus_Tool.name,
          description: GetUnitTestStatus_Tool.description,
          inputSchema: GetUnitTestStatus_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetUnitTestStatus(this.context, args),
      },
      {
        toolDefinition: {
          name: GetUnitTestResult_Tool.name,
          description: GetUnitTestResult_Tool.description,
          inputSchema: GetUnitTestResult_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetUnitTestResult(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateUnitTest_Tool.name,
          description: UpdateUnitTest_Tool.description,
          inputSchema: UpdateUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteUnitTest_Tool.name,
          description: DeleteUnitTest_Tool.description,
          inputSchema: DeleteUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateCdsUnitTest_Tool.name,
          description: CreateCdsUnitTest_Tool.description,
          inputSchema: CreateCdsUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateCdsUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: GetCdsUnitTest_Tool.name,
          description: GetCdsUnitTest_Tool.description,
          inputSchema: GetCdsUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetCdsUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: GetCdsUnitTestStatus_Tool.name,
          description: GetCdsUnitTestStatus_Tool.description,
          inputSchema: GetCdsUnitTestStatus_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetCdsUnitTestStatus(this.context, args),
      },
      {
        toolDefinition: {
          name: GetCdsUnitTestResult_Tool.name,
          description: GetCdsUnitTestResult_Tool.description,
          inputSchema: GetCdsUnitTestResult_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetCdsUnitTestResult(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateCdsUnitTest_Tool.name,
          description: UpdateCdsUnitTest_Tool.description,
          inputSchema: UpdateCdsUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateCdsUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteCdsUnitTest_Tool.name,
          description: DeleteCdsUnitTest_Tool.description,
          inputSchema: DeleteCdsUnitTest_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteCdsUnitTest(this.context, args),
      },
      {
        toolDefinition: {
          name: GetLocalTestClass_Tool.name,
          description: GetLocalTestClass_Tool.description,
          inputSchema: GetLocalTestClass_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetLocalTestClass(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateLocalTestClass_Tool.name,
          description: CreateLocalTestClass_Tool.description,
          inputSchema: CreateLocalTestClass_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateLocalTestClass(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateLocalTestClass_Tool.name,
          description: UpdateLocalTestClass_Tool.description,
          inputSchema: UpdateLocalTestClass_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateLocalTestClass(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteLocalTestClass_Tool.name,
          description: DeleteLocalTestClass_Tool.description,
          inputSchema: DeleteLocalTestClass_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteLocalTestClass(this.context, args),
      },
      {
        toolDefinition: {
          name: GetLocalTypes_Tool.name,
          description: GetLocalTypes_Tool.description,
          inputSchema: GetLocalTypes_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetLocalTypes(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateLocalTypes_Tool.name,
          description: CreateLocalTypes_Tool.description,
          inputSchema: CreateLocalTypes_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateLocalTypes(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateLocalTypes_Tool.name,
          description: UpdateLocalTypes_Tool.description,
          inputSchema: UpdateLocalTypes_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateLocalTypes(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteLocalTypes_Tool.name,
          description: DeleteLocalTypes_Tool.description,
          inputSchema: DeleteLocalTypes_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteLocalTypes(this.context, args),
      },
      {
        toolDefinition: {
          name: GetLocalDefinitions_Tool.name,
          description: GetLocalDefinitions_Tool.description,
          inputSchema: GetLocalDefinitions_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetLocalDefinitions(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateLocalDefinitions_Tool.name,
          description: CreateLocalDefinitions_Tool.description,
          inputSchema: CreateLocalDefinitions_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateLocalDefinitions(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateLocalDefinitions_Tool.name,
          description: UpdateLocalDefinitions_Tool.description,
          inputSchema: UpdateLocalDefinitions_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateLocalDefinitions(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteLocalDefinitions_Tool.name,
          description: DeleteLocalDefinitions_Tool.description,
          inputSchema: DeleteLocalDefinitions_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteLocalDefinitions(this.context, args),
      },
      {
        toolDefinition: {
          name: GetLocalMacros_Tool.name,
          description: GetLocalMacros_Tool.description,
          inputSchema: GetLocalMacros_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetLocalMacros(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateLocalMacros_Tool.name,
          description: CreateLocalMacros_Tool.description,
          inputSchema: CreateLocalMacros_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateLocalMacros(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateLocalMacros_Tool.name,
          description: UpdateLocalMacros_Tool.description,
          inputSchema: UpdateLocalMacros_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateLocalMacros(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteLocalMacros_Tool.name,
          description: DeleteLocalMacros_Tool.description,
          inputSchema: DeleteLocalMacros_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteLocalMacros(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateProgram_Tool.name,
          description: CreateProgram_Tool.description,
          inputSchema: CreateProgram_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateProgram(this.context, args),
      },
      {
        toolDefinition: {
          name: GetProgram_Tool.name,
          description: GetProgram_Tool.description,
          inputSchema: GetProgram_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetProgram(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateProgramHigh_Tool.name,
          description: UpdateProgramHigh_Tool.description,
          inputSchema: UpdateProgramHigh_Tool.inputSchema,
        },
        handler: (args: unknown) => handleUpdateProgramHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteProgram_Tool.name,
          description: DeleteProgram_Tool.description,
          inputSchema: DeleteProgram_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteProgram(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateInterface_Tool.name,
          description: CreateInterface_Tool.description,
          inputSchema: CreateInterface_Tool.inputSchema,
        },
        handler: (args: unknown) => handleCreateInterface(this.context, args),
      },
      {
        toolDefinition: {
          name: GetInterface_Tool.name,
          description: GetInterface_Tool.description,
          inputSchema: GetInterface_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetInterface(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateInterfaceHigh_Tool.name,
          description: UpdateInterfaceHigh_Tool.description,
          inputSchema: UpdateInterfaceHigh_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateInterfaceHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteInterface_Tool.name,
          description: DeleteInterface_Tool.description,
          inputSchema: DeleteInterface_Tool.inputSchema,
        },
        handler: (args: unknown) => handleDeleteInterface(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateFunctionGroup_Tool.name,
          description: CreateFunctionGroup_Tool.description,
          inputSchema: CreateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: GetFunctionGroup_Tool.name,
          description: GetFunctionGroup_Tool.description,
          inputSchema: GetFunctionGroup_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateFunctionGroup_Tool.name,
          description: UpdateFunctionGroup_Tool.description,
          inputSchema: UpdateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteFunctionGroup_Tool.name,
          description: DeleteFunctionGroup_Tool.description,
          inputSchema: DeleteFunctionGroup_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteFunctionGroup(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateFunctionModule_Tool.name,
          description: CreateFunctionModule_Tool.description,
          inputSchema: CreateFunctionModule_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateFunctionModule(this.context, args),
      },
      {
        toolDefinition: {
          name: GetFunctionModule_Tool.name,
          description: GetFunctionModule_Tool.description,
          inputSchema: GetFunctionModule_Tool.inputSchema,
        },
        handler: (args: unknown) => handleGetFunctionModule(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateFunctionModuleHigh_Tool.name,
          description: UpdateFunctionModuleHigh_Tool.description,
          inputSchema: UpdateFunctionModuleHigh_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateFunctionModuleHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteFunctionModule_Tool.name,
          description: DeleteFunctionModule_Tool.description,
          inputSchema: DeleteFunctionModule_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteFunctionModule(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateBdef_Tool.name,
          description: CreateBdef_Tool.description,
          inputSchema: CreateBdef_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: GetBehaviorDefinition_Tool.name,
          description: GetBehaviorDefinition_Tool.description,
          inputSchema: GetBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateBdef_Tool.name,
          description: UpdateBdef_Tool.description,
          inputSchema: UpdateBdef_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateBehaviorDefinitionHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteBehaviorDefinition_Tool.name,
          description: DeleteBehaviorDefinition_Tool.description,
          inputSchema: DeleteBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteBehaviorDefinition(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateBehaviorImplementation_Tool.name,
          description: CreateBehaviorImplementation_Tool.description,
          inputSchema: CreateBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: GetBehaviorImplementation_Tool.name,
          description: GetBehaviorImplementation_Tool.description,
          inputSchema: GetBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateBehaviorImplementation_Tool.name,
          description: UpdateBehaviorImplementation_Tool.description,
          inputSchema: UpdateBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteBehaviorImplementation_Tool.name,
          description: DeleteBehaviorImplementation_Tool.description,
          inputSchema: DeleteBehaviorImplementation_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteBehaviorImplementation(this.context, args),
      },
      {
        toolDefinition: {
          name: CreateDdlx_Tool.name,
          description: CreateDdlx_Tool.description,
          inputSchema: CreateDdlx_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleCreateMetadataExtension(this.context, args),
      },
      {
        toolDefinition: {
          name: GetMetadataExtension_Tool.name,
          description: GetMetadataExtension_Tool.description,
          inputSchema: GetMetadataExtension_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleGetMetadataExtension(this.context, args),
      },
      {
        toolDefinition: {
          name: UpdateDdlx_Tool.name,
          description: UpdateDdlx_Tool.description,
          inputSchema: UpdateDdlx_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleUpdateMetadataExtensionHigh(this.context, args),
      },
      {
        toolDefinition: {
          name: DeleteMetadataExtension_Tool.name,
          description: DeleteMetadataExtension_Tool.description,
          inputSchema: DeleteMetadataExtension_Tool.inputSchema,
        },
        handler: (args: unknown) =>
          handleDeleteMetadataExtension(this.context, args),
      },
    ];
  }
}
