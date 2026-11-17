// Per-type activate handlers (reused from low-level)
import {
  TOOL_DEFINITION as CheckBehaviorDefinition_Tool,
  handleCheckBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleCheckBehaviorDefinition';
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
  TOOL_DEFINITION as ActivateBehaviorDefinition_Tool,
  handleActivateBehaviorDefinition,
} from '../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
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
  TOOL_DEFINITION as CheckClass_Tool,
  handleCheckClass,
} from '../../../handlers/class/high/handleCheckClass';
import {
  TOOL_DEFINITION as CreateClass_Tool,
  handleCreateClass,
} from '../../../handlers/class/high/handleCreateClass';
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
  TOOL_DEFINITION as ActivateClass_Tool,
  handleActivateClass,
} from '../../../handlers/class/low/handleActivateClass';
import {
  TOOL_DEFINITION as ActivateObjects_Tool,
  handleActivateObjects,
} from '../../../handlers/common/high/handleActivateObjects';
import { buildObjectVersionTools } from '../../../handlers/common/high/objectVersionTools';
import {
  TOOL_DEFINITION as CheckDataElement_Tool,
  handleCheckDataElement,
} from '../../../handlers/data_element/high/handleCheckDataElement';
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
  TOOL_DEFINITION as ActivateDataElement_Tool,
  handleActivateDataElement,
} from '../../../handlers/data_element/low/handleActivateDataElement';
import {
  TOOL_DEFINITION as CheckDdl_Tool,
  handleCheckDdl,
} from '../../../handlers/ddl/high/handleCheckDdl';
import {
  TOOL_DEFINITION as CreateDdl_Tool,
  handleCreateDdl,
} from '../../../handlers/ddl/high/handleCreateDdl';
import {
  TOOL_DEFINITION as DeleteDdl_Tool,
  handleDeleteDdl,
} from '../../../handlers/ddl/high/handleDeleteDdl';
import {
  TOOL_DEFINITION as GetDdl_Tool,
  handleGetDdl,
} from '../../../handlers/ddl/high/handleGetDdl';
import {
  handleUpdateDdl as handleUpdateDdlHigh,
  TOOL_DEFINITION as UpdateDdlHigh_Tool,
} from '../../../handlers/ddl/high/handleUpdateDdl';
import {
  TOOL_DEFINITION as ActivateDdl_Tool,
  handleActivateDdl,
} from '../../../handlers/ddl/low/handleActivateDdl';
import {
  TOOL_DEFINITION as CheckMetadataExtension_Tool,
  handleCheckMetadataExtension,
} from '../../../handlers/ddlx/high/handleCheckMetadataExtension';
import {
  TOOL_DEFINITION as CreateDdlx_Tool,
  handleCreateMetadataExtension,
} from '../../../handlers/ddlx/high/handleCreateMetadataExtension';
import {
  handleUpdateMetadataExtension as handleUpdateMetadataExtensionHigh,
  TOOL_DEFINITION as UpdateDdlx_Tool,
} from '../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import {
  TOOL_DEFINITION as ActivateMetadataExtension_Tool,
  handleActivateMetadataExtension,
} from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
import {
  TOOL_DEFINITION as CheckDomain_Tool,
  handleCheckDomain,
} from '../../../handlers/domain/high/handleCheckDomain';
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
  TOOL_DEFINITION as ActivateDomain_Tool,
  handleActivateDomain,
} from '../../../handlers/domain/low/handleActivateDomain';
import {
  TOOL_DEFINITION as CheckFunctionGroup_Tool,
  handleCheckFunctionGroup,
} from '../../../handlers/function/high/handleCheckFunctionGroup';
import {
  TOOL_DEFINITION as CheckFunctionModule_Tool,
  handleCheckFunctionModule,
} from '../../../handlers/function/high/handleCheckFunctionModule';
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
  TOOL_DEFINITION as ActivateFunctionGroup_Tool,
  handleActivateFunctionGroup,
} from '../../../handlers/function/low/handleActivateFunctionGroup';
import {
  TOOL_DEFINITION as ActivateFunctionModule_Tool,
  handleActivateFunctionModule,
} from '../../../handlers/function/low/handleActivateFunctionModule';
import {
  TOOL_DEFINITION as DeleteFunctionGroup_Tool,
  handleDeleteFunctionGroup,
} from '../../../handlers/function_group/high/handleDeleteFunctionGroup';
import {
  TOOL_DEFINITION as GetFunctionGroup_Tool,
  handleGetFunctionGroup,
} from '../../../handlers/function_group/high/handleGetFunctionGroup';
import {
  TOOL_DEFINITION as CreateFunctionInclude_Tool,
  handleCreateFunctionInclude,
} from '../../../handlers/function_include/high/handleCreateFunctionInclude';
import {
  TOOL_DEFINITION as DeleteFunctionInclude_Tool,
  handleDeleteFunctionInclude,
} from '../../../handlers/function_include/high/handleDeleteFunctionInclude';
import {
  handleUpdateFunctionInclude,
  TOOL_DEFINITION as UpdateFunctionInclude_Tool,
} from '../../../handlers/function_include/high/handleUpdateFunctionInclude';
import {
  TOOL_DEFINITION as DeleteFunctionModule_Tool,
  handleDeleteFunctionModule,
} from '../../../handlers/function_module/high/handleDeleteFunctionModule';
import {
  TOOL_DEFINITION as GetFunctionModule_Tool,
  handleGetFunctionModule,
} from '../../../handlers/function_module/high/handleGetFunctionModule';
import {
  TOOL_DEFINITION as CreateInclude_Tool,
  handleCreateInclude,
} from '../../../handlers/include/high/handleCreateInclude';
import {
  TOOL_DEFINITION as DeleteInclude_Tool,
  handleDeleteInclude,
} from '../../../handlers/include/high/handleDeleteInclude';
import {
  handleUpdateInclude,
  TOOL_DEFINITION as UpdateInclude_Tool,
} from '../../../handlers/include/high/handleUpdateInclude';
import {
  handleUpdateIncludeMetadata,
  TOOL_DEFINITION as UpdateIncludeMetadata_Tool,
} from '../../../handlers/include/high/handleUpdateIncludeMetadata';
import {
  TOOL_DEFINITION as ActivateInclude_Tool,
  handleActivateInclude,
} from '../../../handlers/include/low/handleActivateInclude';
import {
  TOOL_DEFINITION as CheckInterface_Tool,
  handleCheckInterface,
} from '../../../handlers/interface/high/handleCheckInterface';
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
  TOOL_DEFINITION as ActivateInterface_Tool,
  handleActivateInterface,
} from '../../../handlers/interface/low/handleActivateInterface';
import {
  TOOL_DEFINITION as CreateMessageClass_Tool,
  handleCreateMessageClass,
} from '../../../handlers/message_class/high/handleCreateMessageClass';
import {
  TOOL_DEFINITION as CreateMessageClassMessage_Tool,
  handleCreateMessageClassMessage,
} from '../../../handlers/message_class/high/handleCreateMessageClassMessage';
import {
  TOOL_DEFINITION as DeleteMessageClass_Tool,
  handleDeleteMessageClass,
} from '../../../handlers/message_class/high/handleDeleteMessageClass';
import {
  TOOL_DEFINITION as DeleteMessageClassMessage_Tool,
  handleDeleteMessageClassMessage,
} from '../../../handlers/message_class/high/handleDeleteMessageClassMessage';
import {
  TOOL_DEFINITION as GetMessageClass_Tool,
  handleGetMessageClass,
} from '../../../handlers/message_class/high/handleGetMessageClass';
import {
  TOOL_DEFINITION as GetMessageClassMessage_Tool,
  handleGetMessageClassMessage,
} from '../../../handlers/message_class/high/handleGetMessageClassMessage';
import {
  handleUpdateMessageClass,
  TOOL_DEFINITION as UpdateMessageClass_Tool,
} from '../../../handlers/message_class/high/handleUpdateMessageClass';
import {
  handleUpdateMessageClassMessage,
  TOOL_DEFINITION as UpdateMessageClassMessage_Tool,
} from '../../../handlers/message_class/high/handleUpdateMessageClassMessage';
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
  TOOL_DEFINITION as CheckPackage_Tool,
  handleCheckPackage,
} from '../../../handlers/package/high/handleCheckPackage';
import {
  TOOL_DEFINITION as CreatePackage_Tool,
  handleCreatePackage,
} from '../../../handlers/package/high/handleCreatePackage';
import {
  TOOL_DEFINITION as DeletePackage_Tool,
  handleDeletePackage,
} from '../../../handlers/package/high/handleDeletePackage';
import {
  TOOL_DEFINITION as GetPackage_Tool,
  handleGetPackage,
} from '../../../handlers/package/high/handleGetPackage';
import {
  handleUpdatePackage,
  TOOL_DEFINITION as UpdatePackage_Tool,
} from '../../../handlers/package/high/handleUpdatePackage';
import {
  TOOL_DEFINITION as CheckProgram_Tool,
  handleCheckProgram,
} from '../../../handlers/program/high/handleCheckProgram';
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
  TOOL_DEFINITION as ActivateProgram_Tool,
  handleActivateProgram,
} from '../../../handlers/program/low/handleActivateProgram';
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
  TOOL_DEFINITION as ActivateServiceBinding_Tool,
  handleActivateServiceBinding,
} from '../../../handlers/service_binding/low/handleActivateServiceBinding';
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
  TOOL_DEFINITION as ActivateServiceDefinition_Tool,
  handleActivateServiceDefinition,
} from '../../../handlers/service_definition/low/handleActivateServiceDefinition';
import {
  TOOL_DEFINITION as CheckStructure_Tool,
  handleCheckStructure,
} from '../../../handlers/structure/high/handleCheckStructure';
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
  TOOL_DEFINITION as ActivateStructure_Tool,
  handleActivateStructure,
} from '../../../handlers/structure/low/handleActivateStructure';
import {
  TOOL_DEFINITION as CheckTable_Tool,
  handleCheckTable,
} from '../../../handlers/table/high/handleCheckTable';
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
  TOOL_DEFINITION as ActivateTable_Tool,
  handleActivateTable,
} from '../../../handlers/table/low/handleActivateTable';
import {
  TOOL_DEFINITION as CheckTableType_Tool,
  handleCheckTableType,
} from '../../../handlers/table_type/high/handleCheckTableType';
import {
  TOOL_DEFINITION as CreateTableType_Tool,
  handleCreateTableType,
} from '../../../handlers/table_type/high/handleCreateTableType';
import {
  TOOL_DEFINITION as DeleteTableType_Tool,
  handleDeleteTableType,
} from '../../../handlers/table_type/high/handleDeleteTableType';
import {
  TOOL_DEFINITION as GetTableType_Tool,
  handleGetTableType,
} from '../../../handlers/table_type/high/handleGetTableType';
import {
  handleUpdateTableType,
  TOOL_DEFINITION as UpdateTableType_Tool,
} from '../../../handlers/table_type/high/handleUpdateTableType';
import {
  TOOL_DEFINITION as ActivateTableType_Tool,
  handleActivateTableType,
} from '../../../handlers/table_type/low/handleActivateTableType';
import {
  TOOL_DEFINITION as AddTransportObject_Tool,
  handleAddTransportObject,
} from '../../../handlers/transport/high/handleAddTransportObject';
import {
  TOOL_DEFINITION as CreateTransport_Tool,
  handleCreateTransport,
} from '../../../handlers/transport/high/handleCreateTransport';
import {
  TOOL_DEFINITION as CreateTransportTask_Tool,
  handleCreateTransportTask,
} from '../../../handlers/transport/high/handleCreateTransportTask';
import {
  handleMoveTransportObjects,
  TOOL_DEFINITION as MoveTransportObjects_Tool,
} from '../../../handlers/transport/high/handleMoveTransportObjects';
import {
  handleRemoveTransportObject,
  TOOL_DEFINITION as RemoveTransportObject_Tool,
} from '../../../handlers/transport/high/handleRemoveTransportObject';
import {
  handleSortAndCompressTransportTask,
  TOOL_DEFINITION as SortAndCompressTransportTask_Tool,
} from '../../../handlers/transport/high/handleSortAndCompressTransportTask';
import {
  TOOL_DEFINITION as CreateCdsUnitTest_Tool,
  handleCreateCdsUnitTest,
} from '../../../handlers/unit_test/high/handleCreateCdsUnitTest';
import {
  TOOL_DEFINITION as CreateFunctionGroupUnitTest_Tool,
  handleCreateFunctionGroupUnitTest,
} from '../../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import {
  TOOL_DEFINITION as CreateProgramUnitTest_Tool,
  handleCreateProgramUnitTest,
} from '../../../handlers/unit_test/high/handleCreateProgramUnitTest';
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
  TOOL_DEFINITION as GetUnitTestResult_Tool,
  handleGetUnitTestResult,
} from '../../../handlers/unit_test/high/handleGetUnitTestResult';
import {
  handleRunAbapUnit,
  TOOL_DEFINITION as RunAbapUnit_Tool,
} from '../../../handlers/unit_test/high/handleRunAbapUnit';
import {
  handleRunCdsUnitTest,
  TOOL_DEFINITION as RunCdsUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunCdsUnitTest';
import {
  handleRunFunctionGroupUnitTest,
  TOOL_DEFINITION as RunFunctionGroupUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import {
  handleRunFunctionModuleUnitTest,
  TOOL_DEFINITION as RunFunctionModuleUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import {
  handleRunProgramUnitTest,
  TOOL_DEFINITION as RunProgramUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunProgramUnitTest';
import {
  handleRunUnitTest,
  TOOL_DEFINITION as RunUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleRunUnitTest';
import {
  handleUpdateCdsUnitTest,
  TOOL_DEFINITION as UpdateCdsUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import {
  handleUpdateFunctionGroupUnitTest,
  TOOL_DEFINITION as UpdateFunctionGroupUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateFunctionGroupUnitTest';
import {
  handleUpdateProgramUnitTest,
  TOOL_DEFINITION as UpdateProgramUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import {
  handleUpdateUnitTest,
  TOOL_DEFINITION as UpdateUnitTest_Tool,
} from '../../../handlers/unit_test/high/handleUpdateUnitTest';
import {
  isMutatingToolName,
  withCriticalSection,
} from '../../criticalSection.js';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import { defineTool, type HandlerEntry } from '../interfaces.js';

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
    const entries: HandlerEntry[] = [
      // Common — group activation
      defineTool(ActivateObjects_Tool, handleActivateObjects),
      // Per-type activation (reused from low-level, with high-level names/descriptions)
      defineTool(
        {
          ...ActivateDomain_Tool,
          name: 'ActivateDomain',
          description:
            'Activates the ABAP domain named by domain_name, so its inactive version is in force.',
        },
        handleActivateDomain,
      ),
      defineTool(
        {
          ...ActivateTableType_Tool,
          name: 'ActivateTableType',
          description:
            'Activates the ABAP table type named by table_type_name, so its inactive version is in force.',
        },
        handleActivateTableType,
      ),
      defineTool(
        {
          ...ActivateDataElement_Tool,
          name: 'ActivateDataElement',
          description:
            'Activates the ABAP data element named by data_element_name, so its inactive version is in force.',
        },
        handleActivateDataElement,
      ),
      defineTool(
        {
          ...ActivateTable_Tool,
          name: 'ActivateTable',
          description:
            'Activates the ABAP database table named by table_name, so its inactive version is in force.',
        },
        handleActivateTable,
      ),
      defineTool(
        {
          ...ActivateStructure_Tool,
          name: 'ActivateStructure',
          description:
            'Activates the ABAP structure named by structure_name, so its inactive version is in force.',
        },
        handleActivateStructure,
      ),
      defineTool(
        {
          ...ActivateDdl_Tool,
          name: 'ActivateDdl',
          description:
            'Activates the CDS view (DDL source) named by ddl_name, so its inactive version is in force.',
        },
        handleActivateDdl,
      ),
      defineTool(
        {
          ...ActivateClass_Tool,
          name: 'ActivateClass',
          description:
            'Activates the ABAP class named by class_name, so its inactive version is in force.',
        },
        handleActivateClass,
      ),
      defineTool(
        {
          ...ActivateInterface_Tool,
          name: 'ActivateInterface',
          description:
            'Activates the ABAP interface named by interface_name, so its inactive version is in force.',
        },
        handleActivateInterface,
      ),
      defineTool(
        {
          ...ActivateProgram_Tool,
          name: 'ActivateProgram',
          description:
            'Activates the ABAP program (report) named by program_name, so its inactive version is in force.',
        },
        handleActivateProgram,
      ),
      defineTool(
        {
          ...ActivateInclude_Tool,
          name: 'ActivateInclude',
          description:
            'Activates the ABAP include named by include_name, so its inactive version is in force.',
        },
        handleActivateInclude,
      ),
      defineTool(
        {
          ...ActivateFunctionModule_Tool,
          name: 'ActivateFunctionModule',
          description:
            'Activates the ABAP function module named by function_module_name in the function group named by function_group_name, so its inactive version is in force.',
        },
        handleActivateFunctionModule,
      ),
      defineTool(
        {
          ...ActivateFunctionGroup_Tool,
          name: 'ActivateFunctionGroup',
          description:
            'Activates the ABAP function group named by function_group_name, so its inactive version is in force.',
        },
        handleActivateFunctionGroup,
      ),
      defineTool(
        {
          ...ActivateBehaviorDefinition_Tool,
          name: 'ActivateBehaviorDefinition',
          description:
            'Activates the RAP behavior definition named by name, so its inactive version is in force.',
        },
        handleActivateBehaviorDefinition,
      ),
      defineTool(
        {
          ...ActivateMetadataExtension_Tool,
          name: 'ActivateMetadataExtension',
          description:
            'Activates the CDS metadata extension named by name, so its inactive version is in force.',
        },
        handleActivateMetadataExtension,
      ),
      defineTool(
        {
          ...ActivateServiceDefinition_Tool,
          name: 'ActivateServiceDefinition',
          description:
            'Activates the service definition named by name, so its inactive version is in force.',
        },
        handleActivateServiceDefinition,
      ),
      defineTool(
        {
          ...ActivateServiceBinding_Tool,
          name: 'ActivateServiceBinding',
          description:
            'Activates the OData service binding named by name, so its inactive version is in force.',
        },
        handleActivateServiceBinding,
      ),
      defineTool(CreatePackage_Tool, handleCreatePackage),
      defineTool(UpdatePackage_Tool, handleUpdatePackage),
      defineTool(DeletePackage_Tool, handleDeletePackage),
      defineTool(GetPackage_Tool, handleGetPackage),
      defineTool(CreateDomain_Tool, handleCreateDomain),
      defineTool(GetDomain_Tool, handleGetDomain),
      defineTool(GetTableType_Tool, handleGetTableType),
      defineTool(CreateTableType_Tool, handleCreateTableType),
      defineTool(UpdateTableType_Tool, handleUpdateTableType),
      defineTool(DeleteTableType_Tool, handleDeleteTableType),
      defineTool(CheckTableType_Tool, handleCheckTableType),
      defineTool(UpdateDomainHigh_Tool, handleUpdateDomainHigh),
      defineTool(DeleteDomain_Tool, handleDeleteDomain),
      defineTool(GetMessageClass_Tool, handleGetMessageClass),
      defineTool(CreateMessageClass_Tool, handleCreateMessageClass),
      defineTool(UpdateMessageClass_Tool, handleUpdateMessageClass),
      defineTool(DeleteMessageClass_Tool, handleDeleteMessageClass),
      defineTool(GetMessageClassMessage_Tool, handleGetMessageClassMessage),
      defineTool(
        CreateMessageClassMessage_Tool,
        handleCreateMessageClassMessage,
      ),
      defineTool(
        UpdateMessageClassMessage_Tool,
        handleUpdateMessageClassMessage,
      ),
      defineTool(
        DeleteMessageClassMessage_Tool,
        handleDeleteMessageClassMessage,
      ),
      defineTool(CreateDataElement_Tool, handleCreateDataElement),
      defineTool(GetDataElement_Tool, handleGetDataElement),
      defineTool(UpdateDataElementHigh_Tool, handleUpdateDataElementHigh),
      defineTool(DeleteDataElement_Tool, handleDeleteDataElement),
      defineTool(CreateTransport_Tool, handleCreateTransport),
      defineTool(CreateTransportTask_Tool, handleCreateTransportTask),
      defineTool(RemoveTransportObject_Tool, handleRemoveTransportObject),
      defineTool(
        SortAndCompressTransportTask_Tool,
        handleSortAndCompressTransportTask,
      ),
      defineTool(MoveTransportObjects_Tool, handleMoveTransportObjects),
      defineTool(AddTransportObject_Tool, handleAddTransportObject),
      defineTool(CreateTable_Tool, handleCreateTable),
      defineTool(GetTable_Tool, handleGetTable),
      defineTool(UpdateTableHigh_Tool, handleUpdateTableHigh),
      defineTool(DeleteTable_Tool, handleDeleteTable),
      defineTool(CreateStructure_Tool, handleCreateStructure),
      defineTool(GetStructure_Tool, handleGetStructure),
      defineTool(UpdateStructureHigh_Tool, handleUpdateStructureHigh),
      defineTool(DeleteStructure_Tool, handleDeleteStructure),
      defineTool(CreateDdl_Tool, handleCreateDdl),
      defineTool(GetDdl_Tool, handleGetDdl),
      defineTool(UpdateDdlHigh_Tool, handleUpdateDdlHigh),
      defineTool(DeleteDdl_Tool, handleDeleteDdl),
      defineTool(CreateServiceDefinition_Tool, handleCreateServiceDefinition),
      defineTool(GetServiceDefinition_Tool, handleGetServiceDefinition),
      defineTool(UpdateServiceDefinition_Tool, handleUpdateServiceDefinition),
      defineTool(DeleteServiceDefinition_Tool, handleDeleteServiceDefinition),
      defineTool(CreateServiceBinding_Tool, handleCreateServiceBinding),
      defineTool(ListServiceBindingTypes_Tool, handleListServiceBindingTypes),
      defineTool(GetServiceBinding_Tool, handleGetServiceBinding),
      defineTool(UpdateServiceBinding_Tool, handleUpdateServiceBinding),
      defineTool(ValidateServiceBinding_Tool, handleValidateServiceBinding),
      defineTool(DeleteServiceBinding_Tool, handleDeleteServiceBinding),
      defineTool(GetClass_Tool, handleGetClass),
      defineTool(CreateClass_Tool, handleCreateClass),
      defineTool(UpdateClassHigh_Tool, handleUpdateClassHigh),
      defineTool(DeleteClass_Tool, handleDeleteClass),
      defineTool(CreateUnitTest_Tool, handleCreateUnitTest),
      defineTool(RunUnitTest_Tool, handleRunUnitTest),
      defineTool(GetUnitTestResult_Tool, handleGetUnitTestResult),
      defineTool(UpdateUnitTest_Tool, handleUpdateUnitTest),
      defineTool(DeleteUnitTest_Tool, handleDeleteUnitTest),
      defineTool(CreateCdsUnitTest_Tool, handleCreateCdsUnitTest),
      defineTool(UpdateCdsUnitTest_Tool, handleUpdateCdsUnitTest),
      defineTool(DeleteCdsUnitTest_Tool, handleDeleteCdsUnitTest),
      defineTool(RunCdsUnitTest_Tool, handleRunCdsUnitTest),
      defineTool(CreateProgramUnitTest_Tool, handleCreateProgramUnitTest),
      defineTool(UpdateProgramUnitTest_Tool, handleUpdateProgramUnitTest),
      defineTool(RunProgramUnitTest_Tool, handleRunProgramUnitTest),
      defineTool(
        CreateFunctionGroupUnitTest_Tool,
        handleCreateFunctionGroupUnitTest,
      ),
      defineTool(
        UpdateFunctionGroupUnitTest_Tool,
        handleUpdateFunctionGroupUnitTest,
      ),
      defineTool(RunFunctionGroupUnitTest_Tool, handleRunFunctionGroupUnitTest),
      defineTool(
        RunFunctionModuleUnitTest_Tool,
        handleRunFunctionModuleUnitTest,
      ),
      defineTool(RunAbapUnit_Tool, handleRunAbapUnit),
      defineTool(GetLocalTestClass_Tool, handleGetLocalTestClass),
      defineTool(UpdateLocalTestClass_Tool, handleUpdateLocalTestClass),
      defineTool(DeleteLocalTestClass_Tool, handleDeleteLocalTestClass),
      defineTool(GetLocalTypes_Tool, handleGetLocalTypes),
      defineTool(UpdateLocalTypes_Tool, handleUpdateLocalTypes),
      defineTool(DeleteLocalTypes_Tool, handleDeleteLocalTypes),
      defineTool(GetLocalDefinitions_Tool, handleGetLocalDefinitions),
      defineTool(UpdateLocalDefinitions_Tool, handleUpdateLocalDefinitions),
      defineTool(DeleteLocalDefinitions_Tool, handleDeleteLocalDefinitions),
      defineTool(GetLocalMacros_Tool, handleGetLocalMacros),
      defineTool(UpdateLocalMacros_Tool, handleUpdateLocalMacros),
      defineTool(DeleteLocalMacros_Tool, handleDeleteLocalMacros),
      defineTool(CreateInclude_Tool, handleCreateInclude),
      defineTool(UpdateInclude_Tool, handleUpdateInclude),
      defineTool(UpdateIncludeMetadata_Tool, handleUpdateIncludeMetadata),
      defineTool(DeleteInclude_Tool, handleDeleteInclude),
      defineTool(CreateProgram_Tool, handleCreateProgram),
      defineTool(GetProgram_Tool, handleGetProgram),
      defineTool(UpdateProgramHigh_Tool, handleUpdateProgramHigh),
      defineTool(DeleteProgram_Tool, handleDeleteProgram),
      defineTool(CreateInterface_Tool, handleCreateInterface),
      defineTool(GetInterface_Tool, handleGetInterface),
      defineTool(UpdateInterfaceHigh_Tool, handleUpdateInterfaceHigh),
      defineTool(DeleteInterface_Tool, handleDeleteInterface),
      defineTool(CreateFunctionGroup_Tool, handleCreateFunctionGroup),
      defineTool(GetFunctionGroup_Tool, handleGetFunctionGroup),
      defineTool(UpdateFunctionGroup_Tool, handleUpdateFunctionGroup),
      defineTool(DeleteFunctionGroup_Tool, handleDeleteFunctionGroup),
      defineTool(CreateFunctionModule_Tool, handleCreateFunctionModule),
      defineTool(GetFunctionModule_Tool, handleGetFunctionModule),
      defineTool(UpdateFunctionModuleHigh_Tool, handleUpdateFunctionModuleHigh),
      defineTool(DeleteFunctionModule_Tool, handleDeleteFunctionModule),
      defineTool(CreateFunctionInclude_Tool, handleCreateFunctionInclude),
      defineTool(UpdateFunctionInclude_Tool, handleUpdateFunctionInclude),
      defineTool(DeleteFunctionInclude_Tool, handleDeleteFunctionInclude),
      defineTool(CreateBdef_Tool, handleCreateBehaviorDefinition),
      defineTool(GetBehaviorDefinition_Tool, handleGetBehaviorDefinition),
      defineTool(UpdateBdef_Tool, handleUpdateBehaviorDefinitionHigh),
      defineTool(DeleteBehaviorDefinition_Tool, handleDeleteBehaviorDefinition),
      defineTool(
        CreateBehaviorImplementation_Tool,
        handleCreateBehaviorImplementation,
      ),
      defineTool(
        GetBehaviorImplementation_Tool,
        handleGetBehaviorImplementation,
      ),
      defineTool(
        UpdateBehaviorImplementation_Tool,
        handleUpdateBehaviorImplementation,
      ),
      defineTool(
        DeleteBehaviorImplementation_Tool,
        handleDeleteBehaviorImplementation,
      ),
      defineTool(CreateDdlx_Tool, handleCreateMetadataExtension),
      defineTool(GetMetadataExtension_Tool, handleGetMetadataExtension),
      defineTool(UpdateDdlx_Tool, handleUpdateMetadataExtensionHigh),
      defineTool(DeleteMetadataExtension_Tool, handleDeleteMetadataExtension),
      // Per-type Check handlers (high-level)
      defineTool(CheckBehaviorDefinition_Tool, handleCheckBehaviorDefinition),
      defineTool(CheckClass_Tool, handleCheckClass),
      defineTool(CheckDataElement_Tool, handleCheckDataElement),
      defineTool(CheckDomain_Tool, handleCheckDomain),
      defineTool(CheckFunctionGroup_Tool, handleCheckFunctionGroup),
      defineTool(CheckFunctionModule_Tool, handleCheckFunctionModule),
      defineTool(CheckInterface_Tool, handleCheckInterface),
      defineTool(CheckMetadataExtension_Tool, handleCheckMetadataExtension),
      defineTool(CheckPackage_Tool, handleCheckPackage),
      defineTool(CheckProgram_Tool, handleCheckProgram),
      defineTool(CheckStructure_Tool, handleCheckStructure),
      defineTool(CheckTable_Tool, handleCheckTable),
      defineTool(CheckDdl_Tool, handleCheckDdl),
      // Per-object high-level version-history tools (#30): 13 types ×
      // {Versions, VersionSource}. HighLevel-only (ReadOnly keeps the generic
      // GetObjectVersions/GetObjectVersionSource).
      ...buildObjectVersionTools().map((entry) =>
        defineTool(entry.toolDefinition, entry.handler),
      ),
    ];

    // Mutating tools (Create/Update/Delete) run a stateful lock → modify →
    // unlock chain in a single call. Wrap them in an uninterruptible critical
    // section so a slow request is not aborted mid-flight, which would drop the
    // stateful session and orphan the lock (leaving the object locked/inactive).
    // No-op on connections older than @mcp-abap-adt/connection 1.10.0.
    return entries.map((entry) =>
      isMutatingToolName(entry.toolDefinition.name)
        ? {
            ...entry,
            call: (context, args) =>
              withCriticalSection(entry.call, () => context.connection)(
                context,
                args,
              ),
          }
        : entry,
    );
  }
}
