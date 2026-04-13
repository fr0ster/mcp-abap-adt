// Import common low-level handlers
import { handleActivateObject } from '../../../handlers/common/low/handleActivateObject';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';
// import { handleDeleteObject } from "../../../handlers/common/low/handleDeleteObject";
// import { handleCheckObject } from "../../../handlers/common/low/handleCheckObject";
// import { handleValidateObject } from "../../../handlers/common/low/handleValidateObject";
// import { handleLockObject } from "../../../handlers/common/low/handleLockObject";
// import { handleUnlockObject } from "../../../handlers/common/low/handleUnlockObject";

import { handleActivateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
// Import low-level handlers - BehaviorDefinition
import { handleCheckBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { handleCreateBehaviorDefinition as handleCreateBehaviorDefinitionLow } from '../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { handleLockBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { handleUnlockBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionLow } from '../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
// Import low-level handlers - BehaviorImplementation
import { handleCreateBehaviorImplementation as handleCreateBehaviorImplementationLow } from '../../../handlers/behavior_implementation/low/handleCreateBehaviorImplementation';
import { handleLockBehaviorImplementation } from '../../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { handleValidateBehaviorImplementation } from '../../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { handleActivateClass } from '../../../handlers/class/low/handleActivateClass';
import { handleActivateClassTestClasses } from '../../../handlers/class/low/handleActivateClassTestClasses';
import { handleCheckClass } from '../../../handlers/class/low/handleCheckClass';
import { handleCreateClass as handleCreateClassLow } from '../../../handlers/class/low/handleCreateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import { handleGetClassUnitTestResult } from '../../../handlers/class/low/handleGetClassUnitTestResult';
import { handleGetClassUnitTestStatus } from '../../../handlers/class/low/handleGetClassUnitTestStatus';
import { handleLockClass } from '../../../handlers/class/low/handleLockClass';
import { handleLockClassTestClasses } from '../../../handlers/class/low/handleLockClassTestClasses';
import { handleRunClassUnitTests } from '../../../handlers/class/low/handleRunClassUnitTests';
import { handleUnlockClass } from '../../../handlers/class/low/handleUnlockClass';
import { handleUnlockClassTestClasses } from '../../../handlers/class/low/handleUnlockClassTestClasses';
// Import low-level handlers - Class
import { handleUpdateClass as handleUpdateClassLow } from '../../../handlers/class/low/handleUpdateClass';
import { handleUpdateClassTestClasses } from '../../../handlers/class/low/handleUpdateClassTestClasses';
import { handleValidateClass } from '../../../handlers/class/low/handleValidateClass';
// Import TOOL_DEFINITION from common low handlers
import { TOOL_DEFINITION as ActivateObject_Tool } from '../../../handlers/common/low/handleActivateObject';
import { handleActivateDataElement } from '../../../handlers/data_element/low/handleActivateDataElement';
import { handleCheckDataElement } from '../../../handlers/data_element/low/handleCheckDataElement';
import { handleCreateDataElement as handleCreateDataElementLow } from '../../../handlers/data_element/low/handleCreateDataElement';
import { handleDeleteDataElement } from '../../../handlers/data_element/low/handleDeleteDataElement';
import { handleLockDataElement } from '../../../handlers/data_element/low/handleLockDataElement';
import { handleUnlockDataElement } from '../../../handlers/data_element/low/handleUnlockDataElement';
// Import low-level handlers - DataElement
import { handleUpdateDataElement } from '../../../handlers/data_element/low/handleUpdateDataElement';
import { handleValidateDataElement } from '../../../handlers/data_element/low/handleValidateDataElement';
import { handleActivateMetadataExtension } from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
// Import low-level handlers - MetadataExtension (DDLX)
import { handleCheckMetadataExtension } from '../../../handlers/ddlx/low/handleCheckMetadataExtension';
import { handleCreateMetadataExtension as handleCreateMetadataExtensionLow } from '../../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';
import { handleLockMetadataExtension } from '../../../handlers/ddlx/low/handleLockMetadataExtension';
import { handleUnlockMetadataExtension } from '../../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionLow } from '../../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleValidateMetadataExtension } from '../../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleActivateDomain } from '../../../handlers/domain/low/handleActivateDomain';
import { handleCheckDomain } from '../../../handlers/domain/low/handleCheckDomain';
import { handleCreateDomain as handleCreateDomainLow } from '../../../handlers/domain/low/handleCreateDomain';
import { handleDeleteDomain } from '../../../handlers/domain/low/handleDeleteDomain';
import { handleLockDomain } from '../../../handlers/domain/low/handleLockDomain';
import { handleUnlockDomain } from '../../../handlers/domain/low/handleUnlockDomain';
// Import low-level handlers - Domain
import { handleUpdateDomain } from '../../../handlers/domain/low/handleUpdateDomain';
import { handleValidateDomain } from '../../../handlers/domain/low/handleValidateDomain';
import { handleActivateFunctionGroup } from '../../../handlers/function/low/handleActivateFunctionGroup';
import { handleActivateFunctionModule } from '../../../handlers/function/low/handleActivateFunctionModule';
// Import low-level handlers - Function
import { handleCheckFunctionGroup } from '../../../handlers/function/low/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../../handlers/function/low/handleCheckFunctionModule';
import { handleCreateFunctionGroup as handleCreateFunctionGroupLow } from '../../../handlers/function/low/handleCreateFunctionGroup';
import { handleCreateFunctionModule as handleCreateFunctionModuleLow } from '../../../handlers/function/low/handleCreateFunctionModule';
import { handleDeleteFunctionGroup } from '../../../handlers/function/low/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../../handlers/function/low/handleDeleteFunctionModule';
import { handleLockFunctionGroup } from '../../../handlers/function/low/handleLockFunctionGroup';
import { handleLockFunctionModule } from '../../../handlers/function/low/handleLockFunctionModule';
import { handleUnlockFunctionGroup } from '../../../handlers/function/low/handleUnlockFunctionGroup';
import { handleUnlockFunctionModule } from '../../../handlers/function/low/handleUnlockFunctionModule';
import { handleUpdateFunctionModule as handleUpdateFunctionModuleLow } from '../../../handlers/function/low/handleUpdateFunctionModule';
import { handleValidateFunctionGroup } from '../../../handlers/function/low/handleValidateFunctionGroup';
import { handleValidateFunctionModule } from '../../../handlers/function/low/handleValidateFunctionModule';
import { handleActivateInterface } from '../../../handlers/interface/low/handleActivateInterface';
import { handleCheckInterface } from '../../../handlers/interface/low/handleCheckInterface';
import { handleCreateInterface as handleCreateInterfaceLow } from '../../../handlers/interface/low/handleCreateInterface';
import { handleDeleteInterface } from '../../../handlers/interface/low/handleDeleteInterface';
import { handleLockInterface } from '../../../handlers/interface/low/handleLockInterface';
import { handleUnlockInterface } from '../../../handlers/interface/low/handleUnlockInterface';
// Import low-level handlers - Interface
import { handleUpdateInterface as handleUpdateInterfaceLow } from '../../../handlers/interface/low/handleUpdateInterface';
import { handleValidateInterface } from '../../../handlers/interface/low/handleValidateInterface';
import { handleCheckPackage } from '../../../handlers/package/low/handleCheckPackage';
import { handleCreatePackage as handleCreatePackageLow } from '../../../handlers/package/low/handleCreatePackage';
import { handleDeletePackage } from '../../../handlers/package/low/handleDeletePackage';
import { handleLockPackage } from '../../../handlers/package/low/handleLockPackage';
import { handleUnlockPackage } from '../../../handlers/package/low/handleUnlockPackage';
// Import low-level handlers - Package
import { handleUpdatePackage } from '../../../handlers/package/low/handleUpdatePackage';
import { handleValidatePackage } from '../../../handlers/package/low/handleValidatePackage';
import { handleActivateProgram } from '../../../handlers/program/low/handleActivateProgram';
import { handleCheckProgram } from '../../../handlers/program/low/handleCheckProgram';
import { handleCreateProgram as handleCreateProgramLow } from '../../../handlers/program/low/handleCreateProgram';
import { handleDeleteProgram } from '../../../handlers/program/low/handleDeleteProgram';
import { handleLockProgram } from '../../../handlers/program/low/handleLockProgram';
import { handleUnlockProgram } from '../../../handlers/program/low/handleUnlockProgram';
// Import low-level handlers - Program
import { handleUpdateProgram as handleUpdateProgramLow } from '../../../handlers/program/low/handleUpdateProgram';
import { handleValidateProgram } from '../../../handlers/program/low/handleValidateProgram';
import { handleActivateStructure } from '../../../handlers/structure/low/handleActivateStructure';
import { handleCheckStructure } from '../../../handlers/structure/low/handleCheckStructure';
import { handleCreateStructure as handleCreateStructureLow } from '../../../handlers/structure/low/handleCreateStructure';
import { handleDeleteStructure } from '../../../handlers/structure/low/handleDeleteStructure';
import { handleLockStructure } from '../../../handlers/structure/low/handleLockStructure';
import { handleUnlockStructure } from '../../../handlers/structure/low/handleUnlockStructure';
// Import low-level handlers - Structure
import { handleUpdateStructure as handleUpdateStructureLow } from '../../../handlers/structure/low/handleUpdateStructure';
import { handleValidateStructure } from '../../../handlers/structure/low/handleValidateStructure';
import { handleActivateTable } from '../../../handlers/table/low/handleActivateTable';
import { handleCheckTable } from '../../../handlers/table/low/handleCheckTable';
import { handleCreateTable as handleCreateTableLow } from '../../../handlers/table/low/handleCreateTable';
import { handleDeleteTable } from '../../../handlers/table/low/handleDeleteTable';
import { handleLockTable } from '../../../handlers/table/low/handleLockTable';
import { handleUnlockTable } from '../../../handlers/table/low/handleUnlockTable';
// Import low-level handlers - Table
import { handleUpdateTable as handleUpdateTableLow } from '../../../handlers/table/low/handleUpdateTable';
import { handleValidateTable } from '../../../handlers/table/low/handleValidateTable';
// Import low-level handlers - Transport
import { handleCreateTransport as handleCreateTransportLow } from '../../../handlers/transport/low/handleCreateTransport';
import { handleActivateView } from '../../../handlers/view/low/handleActivateView';
import { handleCheckView } from '../../../handlers/view/low/handleCheckView';
import { handleCreateView as handleCreateViewLow } from '../../../handlers/view/low/handleCreateView';
import { handleDeleteView } from '../../../handlers/view/low/handleDeleteView';
import { handleLockView } from '../../../handlers/view/low/handleLockView';
import { handleUnlockView } from '../../../handlers/view/low/handleUnlockView';
// Import low-level handlers - View
import { handleUpdateView as handleUpdateViewLow } from '../../../handlers/view/low/handleUpdateView';
import { handleValidateView } from '../../../handlers/view/low/handleValidateView';
// import { TOOL_DEFINITION as DeleteObject_Tool } from "../../../handlers/common/low/handleDeleteObject";
// import { TOOL_DEFINITION as CheckObject_Tool } from "../../../handlers/common/low/handleCheckObject";
// import { TOOL_DEFINITION as ValidateObject_Tool } from "../../../handlers/common/low/handleValidateObject";
// import { TOOL_DEFINITION as LockObject_Tool } from "../../../handlers/common/low/handleLockObject";
// import { TOOL_DEFINITION as UnlockObject_Tool } from "../../../handlers/common/low/handleUnlockObject";

import { TOOL_DEFINITION as ActivateBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
// Import TOOL_DEFINITION from behavior_definition low handlers
import { TOOL_DEFINITION as CheckBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { TOOL_DEFINITION as CreateBehaviorDefinitionLow_Tool } from '../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as DeleteBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { TOOL_DEFINITION as LockBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { TOOL_DEFINITION as UnlockBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBehaviorDefinitionLow_Tool } from '../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as ValidateBehaviorDefinition_Tool } from '../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
// Import TOOL_DEFINITION from behavior_implementation low handlers
import { TOOL_DEFINITION as CreateBehaviorImplementationLow_Tool } from '../../../handlers/behavior_implementation/low/handleCreateBehaviorImplementation';
import { TOOL_DEFINITION as LockBehaviorImplementation_Tool } from '../../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { TOOL_DEFINITION as ValidateBehaviorImplementation_Tool } from '../../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { TOOL_DEFINITION as ActivateClass_Tool } from '../../../handlers/class/low/handleActivateClass';
import { TOOL_DEFINITION as ActivateClassTestClasses_Tool } from '../../../handlers/class/low/handleActivateClassTestClasses';
import { TOOL_DEFINITION as CheckClass_Tool } from '../../../handlers/class/low/handleCheckClass';
import { TOOL_DEFINITION as CreateClassLow_Tool } from '../../../handlers/class/low/handleCreateClass';
import { TOOL_DEFINITION as DeleteClass_Tool } from '../../../handlers/class/low/handleDeleteClass';
import { TOOL_DEFINITION as GetClassUnitTestResult_Tool } from '../../../handlers/class/low/handleGetClassUnitTestResult';
import { TOOL_DEFINITION as GetClassUnitTestStatus_Tool } from '../../../handlers/class/low/handleGetClassUnitTestStatus';
import { TOOL_DEFINITION as LockClass_Tool } from '../../../handlers/class/low/handleLockClass';
import { TOOL_DEFINITION as LockClassTestClasses_Tool } from '../../../handlers/class/low/handleLockClassTestClasses';
import { TOOL_DEFINITION as RunClassUnitTests_Tool } from '../../../handlers/class/low/handleRunClassUnitTests';
import { TOOL_DEFINITION as UnlockClass_Tool } from '../../../handlers/class/low/handleUnlockClass';
import { TOOL_DEFINITION as UnlockClassTestClasses_Tool } from '../../../handlers/class/low/handleUnlockClassTestClasses';
// Import TOOL_DEFINITION from class low handlers
import { TOOL_DEFINITION as UpdateClass_Tool } from '../../../handlers/class/low/handleUpdateClass';
import { TOOL_DEFINITION as UpdateClassTestClasses_Tool } from '../../../handlers/class/low/handleUpdateClassTestClasses';
import { TOOL_DEFINITION as ValidateClass_Tool } from '../../../handlers/class/low/handleValidateClass';
import { TOOL_DEFINITION as ActivateDataElement_Tool } from '../../../handlers/data_element/low/handleActivateDataElement';
import { TOOL_DEFINITION as CheckDataElement_Tool } from '../../../handlers/data_element/low/handleCheckDataElement';
import { TOOL_DEFINITION as CreateDataElementLow_Tool } from '../../../handlers/data_element/low/handleCreateDataElement';
import { TOOL_DEFINITION as DeleteDataElement_Tool } from '../../../handlers/data_element/low/handleDeleteDataElement';
import { TOOL_DEFINITION as LockDataElement_Tool } from '../../../handlers/data_element/low/handleLockDataElement';
import { TOOL_DEFINITION as UnlockDataElement_Tool } from '../../../handlers/data_element/low/handleUnlockDataElement';
// Import TOOL_DEFINITION from data_element low handlers
import { TOOL_DEFINITION as UpdateDataElementLow_Tool } from '../../../handlers/data_element/low/handleUpdateDataElement';
import { TOOL_DEFINITION as ValidateDataElement_Tool } from '../../../handlers/data_element/low/handleValidateDataElement';
import { TOOL_DEFINITION as ActivateMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
// Import TOOL_DEFINITION from ddlx low handlers
import { TOOL_DEFINITION as CheckMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleCheckMetadataExtension';
import { TOOL_DEFINITION as CreateMetadataExtensionLow_Tool } from '../../../handlers/ddlx/low/handleCreateMetadataExtension';
import { TOOL_DEFINITION as DeleteMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';
import { TOOL_DEFINITION as LockMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleLockMetadataExtension';
import { TOOL_DEFINITION as UnlockMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { TOOL_DEFINITION as UpdateMetadataExtensionLow_Tool } from '../../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as ValidateMetadataExtension_Tool } from '../../../handlers/ddlx/low/handleValidateMetadataExtension';
import { TOOL_DEFINITION as ActivateDomain_Tool } from '../../../handlers/domain/low/handleActivateDomain';
import { TOOL_DEFINITION as CheckDomain_Tool } from '../../../handlers/domain/low/handleCheckDomain';
import { TOOL_DEFINITION as CreateDomainLow_Tool } from '../../../handlers/domain/low/handleCreateDomain';
import { TOOL_DEFINITION as DeleteDomain_Tool } from '../../../handlers/domain/low/handleDeleteDomain';
import { TOOL_DEFINITION as LockDomain_Tool } from '../../../handlers/domain/low/handleLockDomain';
import { TOOL_DEFINITION as UnlockDomain_Tool } from '../../../handlers/domain/low/handleUnlockDomain';
// Import TOOL_DEFINITION from domain low handlers
import { TOOL_DEFINITION as UpdateDomainLow_Tool } from '../../../handlers/domain/low/handleUpdateDomain';
import { TOOL_DEFINITION as ValidateDomain_Tool } from '../../../handlers/domain/low/handleValidateDomain';
import { TOOL_DEFINITION as ActivateFunctionGroup_Tool } from '../../../handlers/function/low/handleActivateFunctionGroup';
import { TOOL_DEFINITION as ActivateFunctionModule_Tool } from '../../../handlers/function/low/handleActivateFunctionModule';
// Import TOOL_DEFINITION from function low handlers
import { TOOL_DEFINITION as CheckFunctionGroup_Tool } from '../../../handlers/function/low/handleCheckFunctionGroup';
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from '../../../handlers/function/low/handleCheckFunctionModule';
import { TOOL_DEFINITION as CreateFunctionGroupLow_Tool } from '../../../handlers/function/low/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModuleLow_Tool } from '../../../handlers/function/low/handleCreateFunctionModule';
import { TOOL_DEFINITION as DeleteFunctionGroup_Tool } from '../../../handlers/function/low/handleDeleteFunctionGroup';
import { TOOL_DEFINITION as DeleteFunctionModule_Tool } from '../../../handlers/function/low/handleDeleteFunctionModule';
import { TOOL_DEFINITION as LockFunctionGroup_Tool } from '../../../handlers/function/low/handleLockFunctionGroup';
import { TOOL_DEFINITION as LockFunctionModule_Tool } from '../../../handlers/function/low/handleLockFunctionModule';
import { TOOL_DEFINITION as UnlockFunctionGroup_Tool } from '../../../handlers/function/low/handleUnlockFunctionGroup';
import { TOOL_DEFINITION as UnlockFunctionModule_Tool } from '../../../handlers/function/low/handleUnlockFunctionModule';
import { TOOL_DEFINITION as UpdateFunctionModule_Tool } from '../../../handlers/function/low/handleUpdateFunctionModule';
import { TOOL_DEFINITION as ValidateFunctionGroup_Tool } from '../../../handlers/function/low/handleValidateFunctionGroup';
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from '../../../handlers/function/low/handleValidateFunctionModule';
import { TOOL_DEFINITION as ActivateInterface_Tool } from '../../../handlers/interface/low/handleActivateInterface';
import { TOOL_DEFINITION as CheckInterface_Tool } from '../../../handlers/interface/low/handleCheckInterface';
import { TOOL_DEFINITION as CreateInterfaceLow_Tool } from '../../../handlers/interface/low/handleCreateInterface';
import { TOOL_DEFINITION as DeleteInterface_Tool } from '../../../handlers/interface/low/handleDeleteInterface';
import { TOOL_DEFINITION as LockInterface_Tool } from '../../../handlers/interface/low/handleLockInterface';
import { TOOL_DEFINITION as UnlockInterface_Tool } from '../../../handlers/interface/low/handleUnlockInterface';
// Import TOOL_DEFINITION from interface low handlers
import { TOOL_DEFINITION as UpdateInterface_Tool } from '../../../handlers/interface/low/handleUpdateInterface';
import { TOOL_DEFINITION as ValidateInterface_Tool } from '../../../handlers/interface/low/handleValidateInterface';
import { TOOL_DEFINITION as CheckPackage_Tool } from '../../../handlers/package/low/handleCheckPackage';
import { TOOL_DEFINITION as CreatePackageLow_Tool } from '../../../handlers/package/low/handleCreatePackage';
import { TOOL_DEFINITION as DeletePackage_Tool } from '../../../handlers/package/low/handleDeletePackage';
import { TOOL_DEFINITION as LockPackage_Tool } from '../../../handlers/package/low/handleLockPackage';
import { TOOL_DEFINITION as UnlockPackage_Tool } from '../../../handlers/package/low/handleUnlockPackage';
// Import TOOL_DEFINITION from package low handlers
import { TOOL_DEFINITION as UpdatePackage_Tool } from '../../../handlers/package/low/handleUpdatePackage';
import { TOOL_DEFINITION as ValidatePackage_Tool } from '../../../handlers/package/low/handleValidatePackage';
import { TOOL_DEFINITION as ActivateProgram_Tool } from '../../../handlers/program/low/handleActivateProgram';
import { TOOL_DEFINITION as CheckProgram_Tool } from '../../../handlers/program/low/handleCheckProgram';
import { TOOL_DEFINITION as CreateProgramLow_Tool } from '../../../handlers/program/low/handleCreateProgram';
import { TOOL_DEFINITION as DeleteProgram_Tool } from '../../../handlers/program/low/handleDeleteProgram';
import { TOOL_DEFINITION as LockProgram_Tool } from '../../../handlers/program/low/handleLockProgram';
import { TOOL_DEFINITION as UnlockProgram_Tool } from '../../../handlers/program/low/handleUnlockProgram';
// Import TOOL_DEFINITION from program low handlers
import { TOOL_DEFINITION as UpdateProgram_Tool } from '../../../handlers/program/low/handleUpdateProgram';
import { TOOL_DEFINITION as ValidateProgram_Tool } from '../../../handlers/program/low/handleValidateProgram';
import { TOOL_DEFINITION as ActivateStructure_Tool } from '../../../handlers/structure/low/handleActivateStructure';
import { TOOL_DEFINITION as CheckStructure_Tool } from '../../../handlers/structure/low/handleCheckStructure';
import { TOOL_DEFINITION as CreateStructureLow_Tool } from '../../../handlers/structure/low/handleCreateStructure';
import { TOOL_DEFINITION as DeleteStructure_Tool } from '../../../handlers/structure/low/handleDeleteStructure';
import { TOOL_DEFINITION as LockStructure_Tool } from '../../../handlers/structure/low/handleLockStructure';
import { TOOL_DEFINITION as UnlockStructure_Tool } from '../../../handlers/structure/low/handleUnlockStructure';
// Import TOOL_DEFINITION from structure low handlers
import { TOOL_DEFINITION as UpdateStructureLow_Tool } from '../../../handlers/structure/low/handleUpdateStructure';
import { TOOL_DEFINITION as ValidateStructure_Tool } from '../../../handlers/structure/low/handleValidateStructure';
import { TOOL_DEFINITION as ActivateTable_Tool } from '../../../handlers/table/low/handleActivateTable';
import { TOOL_DEFINITION as CheckTable_Tool } from '../../../handlers/table/low/handleCheckTable';
import { TOOL_DEFINITION as CreateTableLow_Tool } from '../../../handlers/table/low/handleCreateTable';
import { TOOL_DEFINITION as DeleteTable_Tool } from '../../../handlers/table/low/handleDeleteTable';
import { TOOL_DEFINITION as LockTable_Tool } from '../../../handlers/table/low/handleLockTable';
import { TOOL_DEFINITION as UnlockTable_Tool } from '../../../handlers/table/low/handleUnlockTable';
// Import TOOL_DEFINITION from table low handlers
import { TOOL_DEFINITION as UpdateTableLow_Tool } from '../../../handlers/table/low/handleUpdateTable';
import { TOOL_DEFINITION as ValidateTable_Tool } from '../../../handlers/table/low/handleValidateTable';
// Import TOOL_DEFINITION from transport low handlers
import { TOOL_DEFINITION as CreateTransportLow_Tool } from '../../../handlers/transport/low/handleCreateTransport';
import { TOOL_DEFINITION as ActivateView_Tool } from '../../../handlers/view/low/handleActivateView';
import { TOOL_DEFINITION as CheckView_Tool } from '../../../handlers/view/low/handleCheckView';
import { TOOL_DEFINITION as CreateViewLow_Tool } from '../../../handlers/view/low/handleCreateView';
import { TOOL_DEFINITION as DeleteView_Tool } from '../../../handlers/view/low/handleDeleteView';
import { TOOL_DEFINITION as LockView_Tool } from '../../../handlers/view/low/handleLockView';
import { TOOL_DEFINITION as UnlockView_Tool } from '../../../handlers/view/low/handleUnlockView';
// Import TOOL_DEFINITION from view low handlers
import { TOOL_DEFINITION as UpdateView_Tool } from '../../../handlers/view/low/handleUpdateView';
import { TOOL_DEFINITION as ValidateView_Tool } from '../../../handlers/view/low/handleValidateView';

/**
 * Handler group for all low-level handlers
 * Contains handlers that perform low-level operations (lock, unlock, activate, delete, check, validate, etc.)
 */
export class LowLevelHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'LowLevelHandlers';

  /**
   * Gets all low-level handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      // Common low-level handlers
      {
        toolDefinition: {
          name: ActivateObject_Tool.name,
          description: ActivateObject_Tool.description,
          inputSchema: ActivateObject_Tool.inputSchema,
          available_in: ActivateObject_Tool.available_in,
        },
        handler: (args: any) => {
          return handleActivateObject(this.context, args);
        },
      },
      // {
      //   toolDefinition: {
      //     name: CheckObject_Tool.name,
      //     description: CheckObject_Tool.description,
      //     inputSchema: CheckObject_Tool.inputSchema,
      //   },
      //   handler: (args: any) => { return handleCheckObject(this.context, args) },
      // },
      // {
      //   toolDefinition: {
      //     name: ValidateObject_Tool.name,
      //     description: ValidateObject_Tool.description,
      //     inputSchema: ValidateObject_Tool.inputSchema,
      //   },
      //   handler: (args: any) => { return handleValidateObject(this.context, args) },
      // },
      // {
      //   toolDefinition: {
      //     name: LockObject_Tool.name,
      //     description: LockObject_Tool.description,
      //     inputSchema: LockObject_Tool.inputSchema,
      //   },
      //   handler: (args: any) => { return handleLockObject(this.context, args) },
      // },
      // {
      //   toolDefinition: {
      //     name: UnlockObject_Tool.name,
      //     description: UnlockObject_Tool.description,
      //     inputSchema: UnlockObject_Tool.inputSchema,
      //   },
      //   handler: (args: any) => { return handleUnlockObject(this.context, args) },
      // },
      // Package low-level handlers
      {
        toolDefinition: UpdatePackage_Tool,
        handler: (args: any) => {
          return handleUpdatePackage(this.context, args);
        },
      },
      {
        toolDefinition: UnlockPackage_Tool,
        handler: (args: any) => {
          return handleUnlockPackage(this.context, args);
        },
      },
      {
        toolDefinition: CheckPackage_Tool,
        handler: (args: any) => {
          return handleCheckPackage(this.context, args);
        },
      },
      {
        toolDefinition: DeletePackage_Tool,
        handler: (args: any) => {
          return handleDeletePackage(this.context, args);
        },
      },
      {
        toolDefinition: LockPackage_Tool,
        handler: (args: any) => {
          return handleLockPackage(this.context, args);
        },
      },
      {
        toolDefinition: ValidatePackage_Tool,
        handler: (args: any) => {
          return handleValidatePackage(this.context, args);
        },
      },
      {
        toolDefinition: CreatePackageLow_Tool,
        handler: (args: any) => {
          return handleCreatePackageLow(this.context, args);
        },
      },
      // Domain low-level handlers
      {
        toolDefinition: UpdateDomainLow_Tool,
        handler: (args: any) => {
          return handleUpdateDomain(this.context, args);
        },
      },
      {
        toolDefinition: CheckDomain_Tool,
        handler: (args: any) => {
          return handleCheckDomain(this.context, args);
        },
      },
      {
        toolDefinition: DeleteDomain_Tool,
        handler: (args: any) => {
          return handleDeleteDomain(this.context, args);
        },
      },
      {
        toolDefinition: LockDomain_Tool,
        handler: (args: any) => {
          return handleLockDomain(this.context, args);
        },
      },
      {
        toolDefinition: UnlockDomain_Tool,
        handler: (args: any) => {
          return handleUnlockDomain(this.context, args);
        },
      },
      {
        toolDefinition: ValidateDomain_Tool,
        handler: (args: any) => {
          return handleValidateDomain(this.context, args);
        },
      },
      {
        toolDefinition: CreateDomainLow_Tool,
        handler: (args: any) => {
          return handleCreateDomainLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateDomain_Tool,
        handler: (args: any) => {
          return handleActivateDomain(this.context, args);
        },
      },
      // DataElement low-level handlers
      {
        toolDefinition: UpdateDataElementLow_Tool,
        handler: (args: any) => {
          return handleUpdateDataElement(this.context, args);
        },
      },
      {
        toolDefinition: CheckDataElement_Tool,
        handler: (args: any) => {
          return handleCheckDataElement(this.context, args);
        },
      },
      {
        toolDefinition: DeleteDataElement_Tool,
        handler: (args: any) => {
          return handleDeleteDataElement(this.context, args);
        },
      },
      {
        toolDefinition: LockDataElement_Tool,
        handler: (args: any) => {
          return handleLockDataElement(this.context, args);
        },
      },
      {
        toolDefinition: UnlockDataElement_Tool,
        handler: (args: any) => {
          return handleUnlockDataElement(this.context, args);
        },
      },
      {
        toolDefinition: ValidateDataElement_Tool,
        handler: (args: any) => {
          return handleValidateDataElement(this.context, args);
        },
      },
      {
        toolDefinition: CreateDataElementLow_Tool,
        handler: (args: any) => {
          return handleCreateDataElementLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateDataElement_Tool,
        handler: (args: any) => {
          return handleActivateDataElement(this.context, args);
        },
      },
      // Transport low-level handlers
      {
        toolDefinition: CreateTransportLow_Tool,
        handler: (args: any) => {
          return handleCreateTransportLow(this.context, args);
        },
      },
      // Table low-level handlers
      {
        toolDefinition: UpdateTableLow_Tool,
        handler: (args: any) => {
          return handleUpdateTableLow(this.context, args);
        },
      },
      {
        toolDefinition: DeleteTable_Tool,
        handler: (args: any) => {
          return handleDeleteTable(this.context, args);
        },
      },
      {
        toolDefinition: LockTable_Tool,
        handler: (args: any) => {
          return handleLockTable(this.context, args);
        },
      },
      {
        toolDefinition: UnlockTable_Tool,
        handler: (args: any) => {
          return handleUnlockTable(this.context, args);
        },
      },
      {
        toolDefinition: CreateTableLow_Tool,
        handler: (args: any) => {
          return handleCreateTableLow(this.context, args);
        },
      },
      {
        toolDefinition: CheckTable_Tool,
        handler: (args: any) => {
          return handleCheckTable(this.context, args);
        },
      },
      {
        toolDefinition: ValidateTable_Tool,
        handler: (args: any) => {
          return handleValidateTable(this.context, args);
        },
      },
      {
        toolDefinition: ActivateTable_Tool,
        handler: (args: any) => {
          return handleActivateTable(this.context, args);
        },
      },
      // Structure low-level handlers
      {
        toolDefinition: UpdateStructureLow_Tool,
        handler: (args: any) => {
          return handleUpdateStructureLow(this.context, args);
        },
      },
      {
        toolDefinition: CheckStructure_Tool,
        handler: (args: any) => {
          return handleCheckStructure(this.context, args);
        },
      },
      {
        toolDefinition: DeleteStructure_Tool,
        handler: (args: any) => {
          return handleDeleteStructure(this.context, args);
        },
      },
      {
        toolDefinition: LockStructure_Tool,
        handler: (args: any) => {
          return handleLockStructure(this.context, args);
        },
      },
      {
        toolDefinition: UnlockStructure_Tool,
        handler: (args: any) => {
          return handleUnlockStructure(this.context, args);
        },
      },
      {
        toolDefinition: ValidateStructure_Tool,
        handler: (args: any) => {
          return handleValidateStructure(this.context, args);
        },
      },
      {
        toolDefinition: CreateStructureLow_Tool,
        handler: (args: any) => {
          return handleCreateStructureLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateStructure_Tool,
        handler: (args: any) => {
          return handleActivateStructure(this.context, args);
        },
      },
      // View low-level handlers
      {
        toolDefinition: UpdateView_Tool,
        handler: (args: any) => {
          return handleUpdateViewLow(this.context, args);
        },
      },
      {
        toolDefinition: CheckView_Tool,
        handler: (args: any) => {
          return handleCheckView(this.context, args);
        },
      },
      {
        toolDefinition: DeleteView_Tool,
        handler: (args: any) => {
          return handleDeleteView(this.context, args);
        },
      },
      {
        toolDefinition: LockView_Tool,
        handler: (args: any) => {
          return handleLockView(this.context, args);
        },
      },
      {
        toolDefinition: UnlockView_Tool,
        handler: (args: any) => {
          return handleUnlockView(this.context, args);
        },
      },
      {
        toolDefinition: ValidateView_Tool,
        handler: (args: any) => {
          return handleValidateView(this.context, args);
        },
      },
      {
        toolDefinition: CreateViewLow_Tool,
        handler: (args: any) => {
          return handleCreateViewLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateView_Tool,
        handler: (args: any) => {
          return handleActivateView(this.context, args);
        },
      },
      // Class low-level handlers
      {
        toolDefinition: UpdateClass_Tool,
        handler: (args: any) => {
          return handleUpdateClassLow(this.context, args);
        },
      },
      {
        toolDefinition: DeleteClass_Tool,
        handler: (args: any) => {
          return handleDeleteClass(this.context, args);
        },
      },
      {
        toolDefinition: LockClass_Tool,
        handler: (args: any) => {
          return handleLockClass(this.context, args);
        },
      },
      {
        toolDefinition: UnlockClass_Tool,
        handler: (args: any) => {
          return handleUnlockClass(this.context, args);
        },
      },
      {
        toolDefinition: CreateClassLow_Tool,
        handler: (args: any) => {
          return handleCreateClassLow(this.context, args);
        },
      },
      {
        toolDefinition: ValidateClass_Tool,
        handler: (args: any) => {
          return handleValidateClass(this.context, args);
        },
      },
      {
        toolDefinition: CheckClass_Tool,
        handler: (args: any) => {
          return handleCheckClass(this.context, args);
        },
      },
      {
        toolDefinition: ActivateClass_Tool,
        handler: (args: any) => {
          return handleActivateClass(this.context, args);
        },
      },
      {
        toolDefinition: LockClassTestClasses_Tool,
        handler: (args: any) => {
          return handleLockClassTestClasses(this.context, args);
        },
      },
      {
        toolDefinition: UnlockClassTestClasses_Tool,
        handler: (args: any) => {
          return handleUnlockClassTestClasses(this.context, args);
        },
      },
      {
        toolDefinition: UpdateClassTestClasses_Tool,
        handler: (args: any) => {
          return handleUpdateClassTestClasses(this.context, args);
        },
      },
      {
        toolDefinition: ActivateClassTestClasses_Tool,
        handler: (args: any) => {
          return handleActivateClassTestClasses(this.context, args);
        },
      },
      {
        toolDefinition: RunClassUnitTests_Tool,
        handler: (args: any) => {
          return handleRunClassUnitTests(this.context, args);
        },
      },
      {
        toolDefinition: GetClassUnitTestStatus_Tool,
        handler: (args: any) => {
          return handleGetClassUnitTestStatus(this.context, args);
        },
      },
      {
        toolDefinition: GetClassUnitTestResult_Tool,
        handler: (args: any) => {
          return handleGetClassUnitTestResult(this.context, args);
        },
      },
      // Program low-level handlers
      {
        toolDefinition: UpdateProgram_Tool,
        handler: (args: any) => {
          return handleUpdateProgramLow(this.context, args);
        },
      },
      {
        toolDefinition: CheckProgram_Tool,
        handler: (args: any) => {
          return handleCheckProgram(this.context, args);
        },
      },
      {
        toolDefinition: DeleteProgram_Tool,
        handler: (args: any) => {
          return handleDeleteProgram(this.context, args);
        },
      },
      {
        toolDefinition: LockProgram_Tool,
        handler: (args: any) => {
          return handleLockProgram(this.context, args);
        },
      },
      {
        toolDefinition: UnlockProgram_Tool,
        handler: (args: any) => {
          return handleUnlockProgram(this.context, args);
        },
      },
      {
        toolDefinition: ValidateProgram_Tool,
        handler: (args: any) => {
          return handleValidateProgram(this.context, args);
        },
      },
      {
        toolDefinition: CreateProgramLow_Tool,
        handler: (args: any) => {
          return handleCreateProgramLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateProgram_Tool,
        handler: (args: any) => {
          return handleActivateProgram(this.context, args);
        },
      },
      // Interface low-level handlers
      {
        toolDefinition: UpdateInterface_Tool,
        handler: (args: any) => {
          return handleUpdateInterfaceLow(this.context, args);
        },
      },
      {
        toolDefinition: CheckInterface_Tool,
        handler: (args: any) => {
          return handleCheckInterface(this.context, args);
        },
      },
      {
        toolDefinition: DeleteInterface_Tool,
        handler: (args: any) => {
          return handleDeleteInterface(this.context, args);
        },
      },
      {
        toolDefinition: LockInterface_Tool,
        handler: (args: any) => {
          return handleLockInterface(this.context, args);
        },
      },
      {
        toolDefinition: UnlockInterface_Tool,
        handler: (args: any) => {
          return handleUnlockInterface(this.context, args);
        },
      },
      {
        toolDefinition: ValidateInterface_Tool,
        handler: (args: any) => {
          return handleValidateInterface(this.context, args);
        },
      },
      {
        toolDefinition: CreateInterfaceLow_Tool,
        handler: (args: any) => {
          return handleCreateInterfaceLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateInterface_Tool,
        handler: (args: any) => {
          return handleActivateInterface(this.context, args);
        },
      },
      // Function low-level handlers
      {
        toolDefinition: CheckFunctionGroup_Tool,
        handler: (args: any) => {
          return handleCheckFunctionGroup(this.context, args);
        },
      },
      {
        toolDefinition: DeleteFunctionGroup_Tool,
        handler: (args: any) => {
          return handleDeleteFunctionGroup(this.context, args);
        },
      },
      {
        toolDefinition: DeleteFunctionModule_Tool,
        handler: (args: any) => {
          return handleDeleteFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: LockFunctionGroup_Tool,
        handler: (args: any) => {
          return handleLockFunctionGroup(this.context, args);
        },
      },
      {
        toolDefinition: LockFunctionModule_Tool,
        handler: (args: any) => {
          return handleLockFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: UnlockFunctionGroup_Tool,
        handler: (args: any) => {
          return handleUnlockFunctionGroup(this.context, args);
        },
      },
      {
        toolDefinition: UnlockFunctionModule_Tool,
        handler: (args: any) => {
          return handleUnlockFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: ValidateFunctionGroup_Tool,
        handler: (args: any) => {
          return handleValidateFunctionGroup(this.context, args);
        },
      },
      {
        toolDefinition: CreateFunctionGroupLow_Tool,
        handler: (args: any) => {
          return handleCreateFunctionGroupLow(this.context, args);
        },
      },
      {
        toolDefinition: CreateFunctionModuleLow_Tool,
        handler: (args: any) => {
          return handleCreateFunctionModuleLow(this.context, args);
        },
      },
      {
        toolDefinition: UpdateFunctionModule_Tool,
        handler: (args: any) => {
          return handleUpdateFunctionModuleLow(this.context, args);
        },
      },
      {
        toolDefinition: ValidateFunctionModule_Tool,
        handler: (args: any) => {
          return handleValidateFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: CheckFunctionModule_Tool,
        handler: (args: any) => {
          return handleCheckFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: ActivateFunctionModule_Tool,
        handler: (args: any) => {
          return handleActivateFunctionModule(this.context, args);
        },
      },
      {
        toolDefinition: ActivateFunctionGroup_Tool,
        handler: (args: any) => {
          return handleActivateFunctionGroup(this.context, args);
        },
      },
      // BehaviorDefinition low-level handlers
      {
        toolDefinition: CheckBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleCheckBehaviorDefinition(this.context, args);
        },
      },
      {
        toolDefinition: DeleteBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleDeleteBehaviorDefinition(this.context, args);
        },
      },
      {
        toolDefinition: LockBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleLockBehaviorDefinition(this.context, args);
        },
      },
      {
        toolDefinition: UnlockBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleUnlockBehaviorDefinition(this.context, args);
        },
      },
      {
        toolDefinition: ValidateBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleValidateBehaviorDefinition(this.context, args);
        },
      },
      {
        toolDefinition: CreateBehaviorDefinitionLow_Tool,
        handler: (args: any) => {
          return handleCreateBehaviorDefinitionLow(this.context, args);
        },
      },
      {
        toolDefinition: UpdateBehaviorDefinitionLow_Tool,
        handler: (args: any) => {
          return handleUpdateBehaviorDefinitionLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateBehaviorDefinition_Tool,
        handler: (args: any) => {
          return handleActivateBehaviorDefinition(this.context, args);
        },
      },
      // BehaviorImplementation low-level handlers
      {
        toolDefinition: ValidateBehaviorImplementation_Tool,
        handler: (args: any) => {
          return handleValidateBehaviorImplementation(this.context, args);
        },
      },
      {
        toolDefinition: CreateBehaviorImplementationLow_Tool,
        handler: (args: any) => {
          return handleCreateBehaviorImplementationLow(this.context, args);
        },
      },
      {
        toolDefinition: LockBehaviorImplementation_Tool,
        handler: (args: any) => {
          return handleLockBehaviorImplementation(this.context, args);
        },
      },
      // MetadataExtension low-level handlers
      {
        toolDefinition: CheckMetadataExtension_Tool,
        handler: (args: any) => {
          return handleCheckMetadataExtension(this.context, args);
        },
      },
      {
        toolDefinition: DeleteMetadataExtension_Tool,
        handler: (args: any) => {
          return handleDeleteMetadataExtension(this.context, args);
        },
      },
      {
        toolDefinition: LockMetadataExtension_Tool,
        handler: (args: any) => {
          return handleLockMetadataExtension(this.context, args);
        },
      },
      {
        toolDefinition: UnlockMetadataExtension_Tool,
        handler: (args: any) => {
          return handleUnlockMetadataExtension(this.context, args);
        },
      },
      {
        toolDefinition: ValidateMetadataExtension_Tool,
        handler: (args: any) => {
          return handleValidateMetadataExtension(this.context, args);
        },
      },
      {
        toolDefinition: CreateMetadataExtensionLow_Tool,
        handler: (args: any) => {
          return handleCreateMetadataExtensionLow(this.context, args);
        },
      },
      {
        toolDefinition: UpdateMetadataExtensionLow_Tool,
        handler: (args: any) => {
          return handleUpdateMetadataExtensionLow(this.context, args);
        },
      },
      {
        toolDefinition: ActivateMetadataExtension_Tool,
        handler: (args: any) => {
          return handleActivateMetadataExtension(this.context, args);
        },
      },
    ];
  }
}
