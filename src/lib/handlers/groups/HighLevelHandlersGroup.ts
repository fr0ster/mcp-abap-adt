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
  TOOL_DEFINITION as DeleteFunctionModule_Tool,
  handleDeleteFunctionModule,
} from '../../../handlers/function_module/high/handleDeleteFunctionModule';
import {
  TOOL_DEFINITION as GetFunctionModule_Tool,
  handleGetFunctionModule,
} from '../../../handlers/function_module/high/handleGetFunctionModule';
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
  TOOL_DEFINITION as GetPackage_Tool,
  handleGetPackage,
} from '../../../handlers/package/high/handleGetPackage';
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
  TOOL_DEFINITION as CheckView_Tool,
  handleCheckView,
} from '../../../handlers/view/high/handleCheckView';
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
import {
  TOOL_DEFINITION as ActivateView_Tool,
  handleActivateView,
} from '../../../handlers/view/low/handleActivateView';
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
    const withContext = <TArgs, TResult>(
      handler: (context: typeof this.context, args: TArgs) => TResult,
    ) => {
      return (args: unknown) => handler(this.context, args as TArgs);
    };

    return [
      // Common — group activation
      {
        toolDefinition: ActivateObjects_Tool,
        handler: withContext(handleActivateObjects),
      },
      // Per-type activation (reused from low-level, with high-level names/descriptions)
      {
        toolDefinition: {
          ...ActivateDomain_Tool,
          name: 'ActivateDomain',
          description:
            'Activate an ABAP domain. Use after CreateDomain or UpdateDomain if the object remains inactive.',
        },
        handler: withContext(handleActivateDomain),
      },
      {
        toolDefinition: {
          ...ActivateDataElement_Tool,
          name: 'ActivateDataElement',
          description:
            'Activate an ABAP data element. Use after CreateDataElement or UpdateDataElement if the object remains inactive.',
        },
        handler: withContext(handleActivateDataElement),
      },
      {
        toolDefinition: {
          ...ActivateTable_Tool,
          name: 'ActivateTable',
          description:
            'Activate an ABAP table. Use after CreateTable or UpdateTable if the object remains inactive.',
        },
        handler: withContext(handleActivateTable),
      },
      {
        toolDefinition: {
          ...ActivateStructure_Tool,
          name: 'ActivateStructure',
          description:
            'Activate an ABAP structure. Use after CreateStructure or UpdateStructure if the object remains inactive.',
        },
        handler: withContext(handleActivateStructure),
      },
      {
        toolDefinition: {
          ...ActivateView_Tool,
          name: 'ActivateView',
          description:
            'Activate a CDS view. Use after CreateView or UpdateView if the object remains inactive.',
        },
        handler: withContext(handleActivateView),
      },
      {
        toolDefinition: {
          ...ActivateClass_Tool,
          name: 'ActivateClass',
          description:
            'Activate an ABAP class. Use after CreateClass or UpdateClass if the object remains inactive.',
        },
        handler: withContext(handleActivateClass),
      },
      {
        toolDefinition: {
          ...ActivateInterface_Tool,
          name: 'ActivateInterface',
          description:
            'Activate an ABAP interface. Use after CreateInterface or UpdateInterface if the object remains inactive.',
        },
        handler: withContext(handleActivateInterface),
      },
      {
        toolDefinition: {
          ...ActivateProgram_Tool,
          name: 'ActivateProgram',
          description:
            'Activate an ABAP program. Use after CreateProgram or UpdateProgram if the object remains inactive.',
        },
        handler: withContext(handleActivateProgram),
      },
      {
        toolDefinition: {
          ...ActivateFunctionModule_Tool,
          name: 'ActivateFunctionModule',
          description:
            'Activate an ABAP function module. Use after UpdateFunctionModule if the object remains inactive.',
        },
        handler: withContext(handleActivateFunctionModule),
      },
      {
        toolDefinition: {
          ...ActivateFunctionGroup_Tool,
          name: 'ActivateFunctionGroup',
          description:
            'Activate an ABAP function group. Use after CreateFunctionGroup or UpdateFunctionGroup if the object remains inactive.',
        },
        handler: withContext(handleActivateFunctionGroup),
      },
      {
        toolDefinition: {
          ...ActivateBehaviorDefinition_Tool,
          name: 'ActivateBehaviorDefinition',
          description:
            'Activate a RAP behavior definition. Use after CreateBehaviorDefinition or UpdateBehaviorDefinition if the object remains inactive.',
        },
        handler: withContext(handleActivateBehaviorDefinition),
      },
      {
        toolDefinition: {
          ...ActivateMetadataExtension_Tool,
          name: 'ActivateMetadataExtension',
          description:
            'Activate a CDS metadata extension. Use after CreateMetadataExtension or UpdateMetadataExtension if the object remains inactive.',
        },
        handler: withContext(handleActivateMetadataExtension),
      },
      {
        toolDefinition: {
          ...ActivateServiceDefinition_Tool,
          name: 'ActivateServiceDefinition',
          description:
            'Activate an ABAP service definition. Use after CreateServiceDefinition or UpdateServiceDefinition if the object remains inactive.',
        },
        handler: withContext(handleActivateServiceDefinition),
      },
      {
        toolDefinition: {
          ...ActivateServiceBinding_Tool,
          name: 'ActivateServiceBinding',
          description:
            'Activate an ABAP service binding. Use after CreateServiceBinding or UpdateServiceBinding if the object remains inactive.',
        },
        handler: withContext(handleActivateServiceBinding),
      },
      {
        toolDefinition: CreatePackage_Tool,
        handler: withContext(handleCreatePackage),
      },
      {
        toolDefinition: GetPackage_Tool,
        handler: withContext(handleGetPackage),
      },
      {
        toolDefinition: CreateDomain_Tool,
        handler: withContext(handleCreateDomain),
      },
      {
        toolDefinition: GetDomain_Tool,
        handler: withContext(handleGetDomain),
      },
      {
        toolDefinition: UpdateDomainHigh_Tool,
        handler: withContext(handleUpdateDomainHigh),
      },
      {
        toolDefinition: DeleteDomain_Tool,
        handler: withContext(handleDeleteDomain),
      },
      {
        toolDefinition: CreateDataElement_Tool,
        handler: withContext(handleCreateDataElement),
      },
      {
        toolDefinition: GetDataElement_Tool,
        handler: withContext(handleGetDataElement),
      },
      {
        toolDefinition: UpdateDataElementHigh_Tool,
        handler: withContext(handleUpdateDataElementHigh),
      },
      {
        toolDefinition: DeleteDataElement_Tool,
        handler: withContext(handleDeleteDataElement),
      },
      {
        toolDefinition: CreateTransport_Tool,
        handler: withContext(handleCreateTransport),
      },
      {
        toolDefinition: CreateTable_Tool,
        handler: withContext(handleCreateTable),
      },
      {
        toolDefinition: GetTable_Tool,
        handler: withContext(handleGetTable),
      },
      {
        toolDefinition: UpdateTableHigh_Tool,
        handler: withContext(handleUpdateTableHigh),
      },
      {
        toolDefinition: DeleteTable_Tool,
        handler: withContext(handleDeleteTable),
      },
      {
        toolDefinition: CreateStructure_Tool,
        handler: withContext(handleCreateStructure),
      },
      {
        toolDefinition: GetStructure_Tool,
        handler: withContext(handleGetStructure),
      },
      {
        toolDefinition: UpdateStructureHigh_Tool,
        handler: withContext(handleUpdateStructureHigh),
      },
      {
        toolDefinition: DeleteStructure_Tool,
        handler: withContext(handleDeleteStructure),
      },
      {
        toolDefinition: CreateView_Tool,
        handler: withContext(handleCreateView),
      },
      {
        toolDefinition: GetView_Tool,
        handler: withContext(handleGetView),
      },
      {
        toolDefinition: UpdateViewHigh_Tool,
        handler: withContext(handleUpdateViewHigh),
      },
      {
        toolDefinition: DeleteView_Tool,
        handler: withContext(handleDeleteView),
      },
      {
        toolDefinition: CreateServiceDefinition_Tool,
        handler: withContext(handleCreateServiceDefinition),
      },
      {
        toolDefinition: GetServiceDefinition_Tool,
        handler: withContext(handleGetServiceDefinition),
      },
      {
        toolDefinition: UpdateServiceDefinition_Tool,
        handler: withContext(handleUpdateServiceDefinition),
      },
      {
        toolDefinition: DeleteServiceDefinition_Tool,
        handler: withContext(handleDeleteServiceDefinition),
      },
      {
        toolDefinition: CreateServiceBinding_Tool,
        handler: withContext(handleCreateServiceBinding),
      },
      {
        toolDefinition: ListServiceBindingTypes_Tool,
        handler: withContext(handleListServiceBindingTypes),
      },
      {
        toolDefinition: GetServiceBinding_Tool,
        handler: withContext(handleGetServiceBinding),
      },
      {
        toolDefinition: UpdateServiceBinding_Tool,
        handler: withContext(handleUpdateServiceBinding),
      },
      {
        toolDefinition: ValidateServiceBinding_Tool,
        handler: withContext(handleValidateServiceBinding),
      },
      {
        toolDefinition: DeleteServiceBinding_Tool,
        handler: withContext(handleDeleteServiceBinding),
      },
      {
        toolDefinition: GetClass_Tool,
        handler: withContext(handleGetClass),
      },
      {
        toolDefinition: CreateClass_Tool,
        handler: withContext(handleCreateClass),
      },
      {
        toolDefinition: UpdateClassHigh_Tool,
        handler: withContext(handleUpdateClassHigh),
      },
      {
        toolDefinition: DeleteClass_Tool,
        handler: withContext(handleDeleteClass),
      },
      {
        toolDefinition: CreateUnitTest_Tool,
        handler: withContext(handleCreateUnitTest),
      },
      {
        toolDefinition: RunUnitTest_Tool,
        handler: withContext(handleRunUnitTest),
      },
      {
        toolDefinition: GetUnitTest_Tool,
        handler: withContext(handleGetUnitTest),
      },
      {
        toolDefinition: GetUnitTestStatus_Tool,
        handler: withContext(handleGetUnitTestStatus),
      },
      {
        toolDefinition: GetUnitTestResult_Tool,
        handler: withContext(handleGetUnitTestResult),
      },
      {
        toolDefinition: UpdateUnitTest_Tool,
        handler: withContext(handleUpdateUnitTest),
      },
      {
        toolDefinition: DeleteUnitTest_Tool,
        handler: withContext(handleDeleteUnitTest),
      },
      {
        toolDefinition: CreateCdsUnitTest_Tool,
        handler: withContext(handleCreateCdsUnitTest),
      },
      {
        toolDefinition: GetCdsUnitTest_Tool,
        handler: withContext(handleGetCdsUnitTest),
      },
      {
        toolDefinition: GetCdsUnitTestStatus_Tool,
        handler: withContext(handleGetCdsUnitTestStatus),
      },
      {
        toolDefinition: GetCdsUnitTestResult_Tool,
        handler: withContext(handleGetCdsUnitTestResult),
      },
      {
        toolDefinition: UpdateCdsUnitTest_Tool,
        handler: withContext(handleUpdateCdsUnitTest),
      },
      {
        toolDefinition: DeleteCdsUnitTest_Tool,
        handler: withContext(handleDeleteCdsUnitTest),
      },
      {
        toolDefinition: GetLocalTestClass_Tool,
        handler: withContext(handleGetLocalTestClass),
      },
      {
        toolDefinition: UpdateLocalTestClass_Tool,
        handler: withContext(handleUpdateLocalTestClass),
      },
      {
        toolDefinition: DeleteLocalTestClass_Tool,
        handler: withContext(handleDeleteLocalTestClass),
      },
      {
        toolDefinition: GetLocalTypes_Tool,
        handler: withContext(handleGetLocalTypes),
      },
      {
        toolDefinition: UpdateLocalTypes_Tool,
        handler: withContext(handleUpdateLocalTypes),
      },
      {
        toolDefinition: DeleteLocalTypes_Tool,
        handler: withContext(handleDeleteLocalTypes),
      },
      {
        toolDefinition: GetLocalDefinitions_Tool,
        handler: withContext(handleGetLocalDefinitions),
      },
      {
        toolDefinition: UpdateLocalDefinitions_Tool,
        handler: withContext(handleUpdateLocalDefinitions),
      },
      {
        toolDefinition: DeleteLocalDefinitions_Tool,
        handler: withContext(handleDeleteLocalDefinitions),
      },
      {
        toolDefinition: GetLocalMacros_Tool,
        handler: withContext(handleGetLocalMacros),
      },
      {
        toolDefinition: UpdateLocalMacros_Tool,
        handler: withContext(handleUpdateLocalMacros),
      },
      {
        toolDefinition: DeleteLocalMacros_Tool,
        handler: withContext(handleDeleteLocalMacros),
      },
      {
        toolDefinition: CreateProgram_Tool,
        handler: withContext(handleCreateProgram),
      },
      {
        toolDefinition: GetProgram_Tool,
        handler: withContext(handleGetProgram),
      },
      {
        toolDefinition: UpdateProgramHigh_Tool,
        handler: withContext(handleUpdateProgramHigh),
      },
      {
        toolDefinition: DeleteProgram_Tool,
        handler: withContext(handleDeleteProgram),
      },
      {
        toolDefinition: CreateInterface_Tool,
        handler: withContext(handleCreateInterface),
      },
      {
        toolDefinition: GetInterface_Tool,
        handler: withContext(handleGetInterface),
      },
      {
        toolDefinition: UpdateInterfaceHigh_Tool,
        handler: withContext(handleUpdateInterfaceHigh),
      },
      {
        toolDefinition: DeleteInterface_Tool,
        handler: withContext(handleDeleteInterface),
      },
      {
        toolDefinition: CreateFunctionGroup_Tool,
        handler: withContext(handleCreateFunctionGroup),
      },
      {
        toolDefinition: GetFunctionGroup_Tool,
        handler: withContext(handleGetFunctionGroup),
      },
      {
        toolDefinition: UpdateFunctionGroup_Tool,
        handler: withContext(handleUpdateFunctionGroup),
      },
      {
        toolDefinition: DeleteFunctionGroup_Tool,
        handler: withContext(handleDeleteFunctionGroup),
      },
      {
        toolDefinition: CreateFunctionModule_Tool,
        handler: withContext(handleCreateFunctionModule),
      },
      {
        toolDefinition: GetFunctionModule_Tool,
        handler: withContext(handleGetFunctionModule),
      },
      {
        toolDefinition: UpdateFunctionModuleHigh_Tool,
        handler: withContext(handleUpdateFunctionModuleHigh),
      },
      {
        toolDefinition: DeleteFunctionModule_Tool,
        handler: withContext(handleDeleteFunctionModule),
      },
      {
        toolDefinition: CreateBdef_Tool,
        handler: withContext(handleCreateBehaviorDefinition),
      },
      {
        toolDefinition: GetBehaviorDefinition_Tool,
        handler: withContext(handleGetBehaviorDefinition),
      },
      {
        toolDefinition: UpdateBdef_Tool,
        handler: withContext(handleUpdateBehaviorDefinitionHigh),
      },
      {
        toolDefinition: DeleteBehaviorDefinition_Tool,
        handler: withContext(handleDeleteBehaviorDefinition),
      },
      {
        toolDefinition: CreateBehaviorImplementation_Tool,
        handler: withContext(handleCreateBehaviorImplementation),
      },
      {
        toolDefinition: GetBehaviorImplementation_Tool,
        handler: withContext(handleGetBehaviorImplementation),
      },
      {
        toolDefinition: UpdateBehaviorImplementation_Tool,
        handler: withContext(handleUpdateBehaviorImplementation),
      },
      {
        toolDefinition: DeleteBehaviorImplementation_Tool,
        handler: withContext(handleDeleteBehaviorImplementation),
      },
      {
        toolDefinition: CreateDdlx_Tool,
        handler: withContext(handleCreateMetadataExtension),
      },
      {
        toolDefinition: GetMetadataExtension_Tool,
        handler: withContext(handleGetMetadataExtension),
      },
      {
        toolDefinition: UpdateDdlx_Tool,
        handler: withContext(handleUpdateMetadataExtensionHigh),
      },
      {
        toolDefinition: DeleteMetadataExtension_Tool,
        handler: withContext(handleDeleteMetadataExtension),
      },
      // Per-type Check handlers (high-level)
      {
        toolDefinition: CheckBehaviorDefinition_Tool,
        handler: withContext(handleCheckBehaviorDefinition),
      },
      {
        toolDefinition: CheckClass_Tool,
        handler: withContext(handleCheckClass),
      },
      {
        toolDefinition: CheckDataElement_Tool,
        handler: withContext(handleCheckDataElement),
      },
      {
        toolDefinition: CheckDomain_Tool,
        handler: withContext(handleCheckDomain),
      },
      {
        toolDefinition: CheckFunctionGroup_Tool,
        handler: withContext(handleCheckFunctionGroup),
      },
      {
        toolDefinition: CheckFunctionModule_Tool,
        handler: withContext(handleCheckFunctionModule),
      },
      {
        toolDefinition: CheckInterface_Tool,
        handler: withContext(handleCheckInterface),
      },
      {
        toolDefinition: CheckMetadataExtension_Tool,
        handler: withContext(handleCheckMetadataExtension),
      },
      {
        toolDefinition: CheckPackage_Tool,
        handler: withContext(handleCheckPackage),
      },
      {
        toolDefinition: CheckProgram_Tool,
        handler: withContext(handleCheckProgram),
      },
      {
        toolDefinition: CheckStructure_Tool,
        handler: withContext(handleCheckStructure),
      },
      {
        toolDefinition: CheckTable_Tool,
        handler: withContext(handleCheckTable),
      },
      {
        toolDefinition: CheckView_Tool,
        handler: withContext(handleCheckView),
      },
    ];
  }
}
