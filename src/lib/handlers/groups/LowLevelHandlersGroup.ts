import { BaseHandlerGroup } from "../base/BaseHandlerGroup.js";
import { HandlerEntry } from "../interfaces.js";

// // Import common low-level handlers
// import { handleActivateObject } from "../../../handlers/common/low/handleActivateObject";
// import { handleDeleteObject } from "../../../handlers/common/low/handleDeleteObject";
// import { handleCheckObject } from "../../../handlers/common/low/handleCheckObject";
// import { handleValidateObject } from "../../../handlers/common/low/handleValidateObject";
// import { handleLockObject } from "../../../handlers/common/low/handleLockObject";
// import { handleUnlockObject } from "../../../handlers/common/low/handleUnlockObject";

// Import low-level handlers - Package
import { handleUpdatePackage } from "../../../handlers/package/low/handleUpdatePackage";
import { handleUnlockPackage } from "../../../handlers/package/low/handleUnlockPackage";
import { handleCheckPackage } from "../../../handlers/package/low/handleCheckPackage";
import { handleDeletePackage } from "../../../handlers/package/low/handleDeletePackage";
import { handleLockPackage } from "../../../handlers/package/low/handleLockPackage";
import { handleValidatePackage } from "../../../handlers/package/low/handleValidatePackage";
import { handleCreatePackage as handleCreatePackageLow } from "../../../handlers/package/low/handleCreatePackage";

// Import low-level handlers - Domain
import { handleUpdateDomain } from "../../../handlers/domain/low/handleUpdateDomain";
import { handleCheckDomain } from "../../../handlers/domain/low/handleCheckDomain";
import { handleDeleteDomain } from "../../../handlers/domain/low/handleDeleteDomain";
import { handleLockDomain } from "../../../handlers/domain/low/handleLockDomain";
import { handleUnlockDomain } from "../../../handlers/domain/low/handleUnlockDomain";
import { handleValidateDomain } from "../../../handlers/domain/low/handleValidateDomain";
import { handleCreateDomain as handleCreateDomainLow } from "../../../handlers/domain/low/handleCreateDomain";
import { handleActivateDomain } from "../../../handlers/domain/low/handleActivateDomain";

// Import low-level handlers - DataElement
import { handleUpdateDataElement } from "../../../handlers/data_element/low/handleUpdateDataElement";
import { handleCheckDataElement } from "../../../handlers/data_element/low/handleCheckDataElement";
import { handleDeleteDataElement } from "../../../handlers/data_element/low/handleDeleteDataElement";
import { handleLockDataElement } from "../../../handlers/data_element/low/handleLockDataElement";
import { handleUnlockDataElement } from "../../../handlers/data_element/low/handleUnlockDataElement";
import { handleValidateDataElement } from "../../../handlers/data_element/low/handleValidateDataElement";
import { handleCreateDataElement as handleCreateDataElementLow } from "../../../handlers/data_element/low/handleCreateDataElement";
import { handleActivateDataElement } from "../../../handlers/data_element/low/handleActivateDataElement";

// Import low-level handlers - Transport
import { handleCreateTransport as handleCreateTransportLow } from "../../../handlers/transport/low/handleCreateTransport";

// Import low-level handlers - Table
import { handleUpdateTable as handleUpdateTableLow } from "../../../handlers/table/low/handleUpdateTable";
import { handleDeleteTable } from "../../../handlers/table/low/handleDeleteTable";
import { handleLockTable } from "../../../handlers/table/low/handleLockTable";
import { handleUnlockTable } from "../../../handlers/table/low/handleUnlockTable";
import { handleCreateTable as handleCreateTableLow } from "../../../handlers/table/low/handleCreateTable";
import { handleCheckTable } from "../../../handlers/table/low/handleCheckTable";
import { handleValidateTable } from "../../../handlers/table/low/handleValidateTable";
import { handleActivateTable } from "../../../handlers/table/low/handleActivateTable";

// Import low-level handlers - Structure
import { handleUpdateStructure as handleUpdateStructureLow } from "../../../handlers/structure/low/handleUpdateStructure";
import { handleCheckStructure } from "../../../handlers/structure/low/handleCheckStructure";
import { handleDeleteStructure } from "../../../handlers/structure/low/handleDeleteStructure";
import { handleLockStructure } from "../../../handlers/structure/low/handleLockStructure";
import { handleUnlockStructure } from "../../../handlers/structure/low/handleUnlockStructure";
import { handleValidateStructure } from "../../../handlers/structure/low/handleValidateStructure";
import { handleCreateStructure as handleCreateStructureLow } from "../../../handlers/structure/low/handleCreateStructure";
import { handleActivateStructure } from "../../../handlers/structure/low/handleActivateStructure";

// Import low-level handlers - View
import { handleUpdateView as handleUpdateViewLow } from "../../../handlers/view/low/handleUpdateView";
import { handleCheckView } from "../../../handlers/view/low/handleCheckView";
import { handleDeleteView } from "../../../handlers/view/low/handleDeleteView";
import { handleLockView } from "../../../handlers/view/low/handleLockView";
import { handleUnlockView } from "../../../handlers/view/low/handleUnlockView";
import { handleValidateView } from "../../../handlers/view/low/handleValidateView";
import { handleCreateView as handleCreateViewLow } from "../../../handlers/view/low/handleCreateView";
import { handleActivateView } from "../../../handlers/view/low/handleActivateView";

// Import low-level handlers - Class
import { handleUpdateClass as handleUpdateClassLow } from "../../../handlers/class/low/handleUpdateClass";
import { handleDeleteClass } from "../../../handlers/class/low/handleDeleteClass";
import { handleLockClass } from "../../../handlers/class/low/handleLockClass";
import { handleUnlockClass } from "../../../handlers/class/low/handleUnlockClass";
import { handleCreateClass as handleCreateClassLow } from "../../../handlers/class/low/handleCreateClass";
import { handleValidateClass } from "../../../handlers/class/low/handleValidateClass";
import { handleCheckClass } from "../../../handlers/class/low/handleCheckClass";
import { handleActivateClass } from "../../../handlers/class/low/handleActivateClass";
import { handleLockClassTestClasses } from "../../../handlers/class/low/handleLockClassTestClasses";
import { handleUnlockClassTestClasses } from "../../../handlers/class/low/handleUnlockClassTestClasses";
import { handleUpdateClassTestClasses } from "../../../handlers/class/low/handleUpdateClassTestClasses";
import { handleActivateClassTestClasses } from "../../../handlers/class/low/handleActivateClassTestClasses";
import { handleRunClassUnitTests } from "../../../handlers/class/low/handleRunClassUnitTests";
import { handleGetClassUnitTestStatus } from "../../../handlers/class/low/handleGetClassUnitTestStatus";
import { handleGetClassUnitTestResult } from "../../../handlers/class/low/handleGetClassUnitTestResult";

// Import low-level handlers - Program
import { handleUpdateProgram as handleUpdateProgramLow } from "../../../handlers/program/low/handleUpdateProgram";
import { handleCheckProgram } from "../../../handlers/program/low/handleCheckProgram";
import { handleDeleteProgram } from "../../../handlers/program/low/handleDeleteProgram";
import { handleLockProgram } from "../../../handlers/program/low/handleLockProgram";
import { handleUnlockProgram } from "../../../handlers/program/low/handleUnlockProgram";
import { handleValidateProgram } from "../../../handlers/program/low/handleValidateProgram";
import { handleCreateProgram as handleCreateProgramLow } from "../../../handlers/program/low/handleCreateProgram";
import { handleActivateProgram } from "../../../handlers/program/low/handleActivateProgram";

// Import low-level handlers - Interface
import { handleUpdateInterface as handleUpdateInterfaceLow } from "../../../handlers/interface/low/handleUpdateInterface";
import { handleCheckInterface } from "../../../handlers/interface/low/handleCheckInterface";
import { handleDeleteInterface } from "../../../handlers/interface/low/handleDeleteInterface";
import { handleLockInterface } from "../../../handlers/interface/low/handleLockInterface";
import { handleUnlockInterface } from "../../../handlers/interface/low/handleUnlockInterface";
import { handleValidateInterface } from "../../../handlers/interface/low/handleValidateInterface";
import { handleCreateInterface as handleCreateInterfaceLow } from "../../../handlers/interface/low/handleCreateInterface";
import { handleActivateInterface } from "../../../handlers/interface/low/handleActivateInterface";

// Import low-level handlers - Function
import { handleCheckFunctionGroup } from "../../../handlers/function/low/handleCheckFunctionGroup";
import { handleDeleteFunctionGroup } from "../../../handlers/function/low/handleDeleteFunctionGroup";
import { handleDeleteFunctionModule } from "../../../handlers/function/low/handleDeleteFunctionModule";
import { handleLockFunctionGroup } from "../../../handlers/function/low/handleLockFunctionGroup";
import { handleLockFunctionModule } from "../../../handlers/function/low/handleLockFunctionModule";
import { handleUnlockFunctionGroup } from "../../../handlers/function/low/handleUnlockFunctionGroup";
import { handleUnlockFunctionModule } from "../../../handlers/function/low/handleUnlockFunctionModule";
import { handleValidateFunctionGroup } from "../../../handlers/function/low/handleValidateFunctionGroup";
import { handleCreateFunctionGroup as handleCreateFunctionGroupLow } from "../../../handlers/function/low/handleCreateFunctionGroup";
import { handleCreateFunctionModule as handleCreateFunctionModuleLow } from "../../../handlers/function/low/handleCreateFunctionModule";
import { handleUpdateFunctionModule as handleUpdateFunctionModuleLow } from "../../../handlers/function/low/handleUpdateFunctionModule";
import { handleValidateFunctionModule } from "../../../handlers/function/low/handleValidateFunctionModule";
import { handleCheckFunctionModule } from "../../../handlers/function/low/handleCheckFunctionModule";
import { handleActivateFunctionModule } from "../../../handlers/function/low/handleActivateFunctionModule";
import { handleActivateFunctionGroup } from "../../../handlers/function/low/handleActivateFunctionGroup";

// Import low-level handlers - BehaviorDefinition
import { handleCheckBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleCheckBehaviorDefinition";
import { handleDeleteBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition";
import { handleLockBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleLockBehaviorDefinition";
import { handleUnlockBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition";
import { handleValidateBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition";
import { handleCreateBehaviorDefinition as handleCreateBehaviorDefinitionLow } from "../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition";
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionLow } from "../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition";
import { handleActivateBehaviorDefinition } from "../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition";

// Import low-level handlers - MetadataExtension (DDLX)
import { handleCheckMetadataExtension } from "../../../handlers/ddlx/low/handleCheckMetadataExtension";
import { handleDeleteMetadataExtension } from "../../../handlers/ddlx/low/handleDeleteMetadataExtension";
import { handleLockMetadataExtension } from "../../../handlers/ddlx/low/handleLockMetadataExtension";
import { handleUnlockMetadataExtension } from "../../../handlers/ddlx/low/handleUnlockMetadataExtension";
import { handleValidateMetadataExtension } from "../../../handlers/ddlx/low/handleValidateMetadataExtension";
import { handleCreateMetadataExtension as handleCreateMetadataExtensionLow } from "../../../handlers/ddlx/low/handleCreateMetadataExtension";
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionLow } from "../../../handlers/ddlx/low/handleUpdateMetadataExtension";
import { handleActivateMetadataExtension } from "../../../handlers/ddlx/low/handleActivateMetadataExtension";

// // Import TOOL_DEFINITION from common low handlers
// import { TOOL_DEFINITION as ActivateObject_Tool } from "../../../handlers/common/low/handleActivateObject";
// import { TOOL_DEFINITION as DeleteObject_Tool } from "../../../handlers/common/low/handleDeleteObject";
// import { TOOL_DEFINITION as CheckObject_Tool } from "../../../handlers/common/low/handleCheckObject";
// import { TOOL_DEFINITION as ValidateObject_Tool } from "../../../handlers/common/low/handleValidateObject";
// import { TOOL_DEFINITION as LockObject_Tool } from "../../../handlers/common/low/handleLockObject";
// import { TOOL_DEFINITION as UnlockObject_Tool } from "../../../handlers/common/low/handleUnlockObject";

// Import TOOL_DEFINITION from package low handlers
import { TOOL_DEFINITION as UpdatePackage_Tool } from "../../../handlers/package/low/handleUpdatePackage";
import { TOOL_DEFINITION as UnlockPackage_Tool } from "../../../handlers/package/low/handleUnlockPackage";
import { TOOL_DEFINITION as CheckPackage_Tool } from "../../../handlers/package/low/handleCheckPackage";
import { TOOL_DEFINITION as DeletePackage_Tool } from "../../../handlers/package/low/handleDeletePackage";
import { TOOL_DEFINITION as LockPackage_Tool } from "../../../handlers/package/low/handleLockPackage";
import { TOOL_DEFINITION as ValidatePackage_Tool } from "../../../handlers/package/low/handleValidatePackage";
import { TOOL_DEFINITION as CreatePackageLow_Tool } from "../../../handlers/package/low/handleCreatePackage";

// Import TOOL_DEFINITION from domain low handlers
import { TOOL_DEFINITION as UpdateDomainLow_Tool } from "../../../handlers/domain/low/handleUpdateDomain";
import { TOOL_DEFINITION as CheckDomain_Tool } from "../../../handlers/domain/low/handleCheckDomain";
import { TOOL_DEFINITION as DeleteDomain_Tool } from "../../../handlers/domain/low/handleDeleteDomain";
import { TOOL_DEFINITION as LockDomain_Tool } from "../../../handlers/domain/low/handleLockDomain";
import { TOOL_DEFINITION as UnlockDomain_Tool } from "../../../handlers/domain/low/handleUnlockDomain";
import { TOOL_DEFINITION as ValidateDomain_Tool } from "../../../handlers/domain/low/handleValidateDomain";
import { TOOL_DEFINITION as CreateDomainLow_Tool } from "../../../handlers/domain/low/handleCreateDomain";
import { TOOL_DEFINITION as ActivateDomain_Tool } from "../../../handlers/domain/low/handleActivateDomain";

// Import TOOL_DEFINITION from data_element low handlers
import { TOOL_DEFINITION as UpdateDataElementLow_Tool } from "../../../handlers/data_element/low/handleUpdateDataElement";
import { TOOL_DEFINITION as CheckDataElement_Tool } from "../../../handlers/data_element/low/handleCheckDataElement";
import { TOOL_DEFINITION as DeleteDataElement_Tool } from "../../../handlers/data_element/low/handleDeleteDataElement";
import { TOOL_DEFINITION as LockDataElement_Tool } from "../../../handlers/data_element/low/handleLockDataElement";
import { TOOL_DEFINITION as UnlockDataElement_Tool } from "../../../handlers/data_element/low/handleUnlockDataElement";
import { TOOL_DEFINITION as ValidateDataElement_Tool } from "../../../handlers/data_element/low/handleValidateDataElement";
import { TOOL_DEFINITION as CreateDataElementLow_Tool } from "../../../handlers/data_element/low/handleCreateDataElement";
import { TOOL_DEFINITION as ActivateDataElement_Tool } from "../../../handlers/data_element/low/handleActivateDataElement";

// Import TOOL_DEFINITION from transport low handlers
import { TOOL_DEFINITION as CreateTransportLow_Tool } from "../../../handlers/transport/low/handleCreateTransport";

// Import TOOL_DEFINITION from table low handlers
import { TOOL_DEFINITION as UpdateTableLow_Tool } from "../../../handlers/table/low/handleUpdateTable";
import { TOOL_DEFINITION as DeleteTable_Tool } from "../../../handlers/table/low/handleDeleteTable";
import { TOOL_DEFINITION as LockTable_Tool } from "../../../handlers/table/low/handleLockTable";
import { TOOL_DEFINITION as UnlockTable_Tool } from "../../../handlers/table/low/handleUnlockTable";
import { TOOL_DEFINITION as CreateTableLow_Tool } from "../../../handlers/table/low/handleCreateTable";
import { TOOL_DEFINITION as CheckTable_Tool } from "../../../handlers/table/low/handleCheckTable";
import { TOOL_DEFINITION as ValidateTable_Tool } from "../../../handlers/table/low/handleValidateTable";
import { TOOL_DEFINITION as ActivateTable_Tool } from "../../../handlers/table/low/handleActivateTable";

// Import TOOL_DEFINITION from structure low handlers
import { TOOL_DEFINITION as UpdateStructureLow_Tool } from "../../../handlers/structure/low/handleUpdateStructure";
import { TOOL_DEFINITION as CheckStructure_Tool } from "../../../handlers/structure/low/handleCheckStructure";
import { TOOL_DEFINITION as DeleteStructure_Tool } from "../../../handlers/structure/low/handleDeleteStructure";
import { TOOL_DEFINITION as LockStructure_Tool } from "../../../handlers/structure/low/handleLockStructure";
import { TOOL_DEFINITION as UnlockStructure_Tool } from "../../../handlers/structure/low/handleUnlockStructure";
import { TOOL_DEFINITION as ValidateStructure_Tool } from "../../../handlers/structure/low/handleValidateStructure";
import { TOOL_DEFINITION as CreateStructureLow_Tool } from "../../../handlers/structure/low/handleCreateStructure";
import { TOOL_DEFINITION as ActivateStructure_Tool } from "../../../handlers/structure/low/handleActivateStructure";

// Import TOOL_DEFINITION from view low handlers
import { TOOL_DEFINITION as UpdateView_Tool } from "../../../handlers/view/low/handleUpdateView";
import { TOOL_DEFINITION as CheckView_Tool } from "../../../handlers/view/low/handleCheckView";
import { TOOL_DEFINITION as DeleteView_Tool } from "../../../handlers/view/low/handleDeleteView";
import { TOOL_DEFINITION as LockView_Tool } from "../../../handlers/view/low/handleLockView";
import { TOOL_DEFINITION as UnlockView_Tool } from "../../../handlers/view/low/handleUnlockView";
import { TOOL_DEFINITION as ValidateView_Tool } from "../../../handlers/view/low/handleValidateView";
import { TOOL_DEFINITION as CreateViewLow_Tool } from "../../../handlers/view/low/handleCreateView";
import { TOOL_DEFINITION as ActivateView_Tool } from "../../../handlers/view/low/handleActivateView";

// Import TOOL_DEFINITION from class low handlers
import { TOOL_DEFINITION as UpdateClass_Tool } from "../../../handlers/class/low/handleUpdateClass";
import { TOOL_DEFINITION as DeleteClass_Tool } from "../../../handlers/class/low/handleDeleteClass";
import { TOOL_DEFINITION as LockClass_Tool } from "../../../handlers/class/low/handleLockClass";
import { TOOL_DEFINITION as UnlockClass_Tool } from "../../../handlers/class/low/handleUnlockClass";
import { TOOL_DEFINITION as CreateClassLow_Tool } from "../../../handlers/class/low/handleCreateClass";
import { TOOL_DEFINITION as ValidateClass_Tool } from "../../../handlers/class/low/handleValidateClass";
import { TOOL_DEFINITION as CheckClass_Tool } from "../../../handlers/class/low/handleCheckClass";
import { TOOL_DEFINITION as ActivateClass_Tool } from "../../../handlers/class/low/handleActivateClass";
import { TOOL_DEFINITION as LockClassTestClasses_Tool } from "../../../handlers/class/low/handleLockClassTestClasses";
import { TOOL_DEFINITION as UnlockClassTestClasses_Tool } from "../../../handlers/class/low/handleUnlockClassTestClasses";
import { TOOL_DEFINITION as UpdateClassTestClasses_Tool } from "../../../handlers/class/low/handleUpdateClassTestClasses";
import { TOOL_DEFINITION as ActivateClassTestClasses_Tool } from "../../../handlers/class/low/handleActivateClassTestClasses";
import { TOOL_DEFINITION as RunClassUnitTests_Tool } from "../../../handlers/class/low/handleRunClassUnitTests";
import { TOOL_DEFINITION as GetClassUnitTestStatus_Tool } from "../../../handlers/class/low/handleGetClassUnitTestStatus";
import { TOOL_DEFINITION as GetClassUnitTestResult_Tool } from "../../../handlers/class/low/handleGetClassUnitTestResult";

// Import TOOL_DEFINITION from program low handlers
import { TOOL_DEFINITION as UpdateProgram_Tool } from "../../../handlers/program/low/handleUpdateProgram";
import { TOOL_DEFINITION as CheckProgram_Tool } from "../../../handlers/program/low/handleCheckProgram";
import { TOOL_DEFINITION as DeleteProgram_Tool } from "../../../handlers/program/low/handleDeleteProgram";
import { TOOL_DEFINITION as LockProgram_Tool } from "../../../handlers/program/low/handleLockProgram";
import { TOOL_DEFINITION as UnlockProgram_Tool } from "../../../handlers/program/low/handleUnlockProgram";
import { TOOL_DEFINITION as ValidateProgram_Tool } from "../../../handlers/program/low/handleValidateProgram";
import { TOOL_DEFINITION as CreateProgramLow_Tool } from "../../../handlers/program/low/handleCreateProgram";
import { TOOL_DEFINITION as ActivateProgram_Tool } from "../../../handlers/program/low/handleActivateProgram";

// Import TOOL_DEFINITION from interface low handlers
import { TOOL_DEFINITION as UpdateInterface_Tool } from "../../../handlers/interface/low/handleUpdateInterface";
import { TOOL_DEFINITION as CheckInterface_Tool } from "../../../handlers/interface/low/handleCheckInterface";
import { TOOL_DEFINITION as DeleteInterface_Tool } from "../../../handlers/interface/low/handleDeleteInterface";
import { TOOL_DEFINITION as LockInterface_Tool } from "../../../handlers/interface/low/handleLockInterface";
import { TOOL_DEFINITION as UnlockInterface_Tool } from "../../../handlers/interface/low/handleUnlockInterface";
import { TOOL_DEFINITION as ValidateInterface_Tool } from "../../../handlers/interface/low/handleValidateInterface";
import { TOOL_DEFINITION as CreateInterfaceLow_Tool } from "../../../handlers/interface/low/handleCreateInterface";
import { TOOL_DEFINITION as ActivateInterface_Tool } from "../../../handlers/interface/low/handleActivateInterface";

// Import TOOL_DEFINITION from function low handlers
import { TOOL_DEFINITION as CheckFunctionGroup_Tool } from "../../../handlers/function/low/handleCheckFunctionGroup";
import { TOOL_DEFINITION as DeleteFunctionGroup_Tool } from "../../../handlers/function/low/handleDeleteFunctionGroup";
import { TOOL_DEFINITION as DeleteFunctionModule_Tool } from "../../../handlers/function/low/handleDeleteFunctionModule";
import { TOOL_DEFINITION as LockFunctionGroup_Tool } from "../../../handlers/function/low/handleLockFunctionGroup";
import { TOOL_DEFINITION as LockFunctionModule_Tool } from "../../../handlers/function/low/handleLockFunctionModule";
import { TOOL_DEFINITION as UnlockFunctionGroup_Tool } from "../../../handlers/function/low/handleUnlockFunctionGroup";
import { TOOL_DEFINITION as UnlockFunctionModule_Tool } from "../../../handlers/function/low/handleUnlockFunctionModule";
import { TOOL_DEFINITION as ValidateFunctionGroup_Tool } from "../../../handlers/function/low/handleValidateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionGroupLow_Tool } from "../../../handlers/function/low/handleCreateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionModuleLow_Tool } from "../../../handlers/function/low/handleCreateFunctionModule";
import { TOOL_DEFINITION as UpdateFunctionModule_Tool } from "../../../handlers/function/low/handleUpdateFunctionModule";
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from "../../../handlers/function/low/handleValidateFunctionModule";
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from "../../../handlers/function/low/handleCheckFunctionModule";
import { TOOL_DEFINITION as ActivateFunctionModule_Tool } from "../../../handlers/function/low/handleActivateFunctionModule";
import { TOOL_DEFINITION as ActivateFunctionGroup_Tool } from "../../../handlers/function/low/handleActivateFunctionGroup";

// Import TOOL_DEFINITION from behavior_definition low handlers
import { TOOL_DEFINITION as CheckBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleCheckBehaviorDefinition";
import { TOOL_DEFINITION as DeleteBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition";
import { TOOL_DEFINITION as LockBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleLockBehaviorDefinition";
import { TOOL_DEFINITION as UnlockBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition";
import { TOOL_DEFINITION as ValidateBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition";
import { TOOL_DEFINITION as CreateBehaviorDefinitionLow_Tool } from "../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition";
import { TOOL_DEFINITION as UpdateBehaviorDefinitionLow_Tool } from "../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition";
import { TOOL_DEFINITION as ActivateBehaviorDefinition_Tool } from "../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition";

// Import TOOL_DEFINITION from ddlx low handlers
import { TOOL_DEFINITION as CheckMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleCheckMetadataExtension";
import { TOOL_DEFINITION as DeleteMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleDeleteMetadataExtension";
import { TOOL_DEFINITION as LockMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleLockMetadataExtension";
import { TOOL_DEFINITION as UnlockMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleUnlockMetadataExtension";
import { TOOL_DEFINITION as ValidateMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleValidateMetadataExtension";
import { TOOL_DEFINITION as CreateMetadataExtensionLow_Tool } from "../../../handlers/ddlx/low/handleCreateMetadataExtension";
import { TOOL_DEFINITION as UpdateMetadataExtensionLow_Tool } from "../../../handlers/ddlx/low/handleUpdateMetadataExtension";
import { TOOL_DEFINITION as ActivateMetadataExtension_Tool } from "../../../handlers/ddlx/low/handleActivateMetadataExtension";

/**
 * Handler group for all low-level handlers
 * Contains handlers that perform low-level operations (lock, unlock, activate, delete, check, validate, etc.)
 */
export class LowLevelHandlersGroup extends BaseHandlerGroup {
  protected groupName = "LowLevelHandlers";

  /**
   * Gets all low-level handler entries
   */
  getHandlers(): HandlerEntry[] {
    return [
      // // Common low-level handlers
      // {
      //   toolDefinition: {
      //     name: ActivateObject_Tool.name,
      //     description: ActivateObject_Tool.description,
      //     inputSchema: ActivateObject_Tool.inputSchema,
      //   },
      //   handler: (args: any) => { return handleActivateObject(this.context, args) },
      // },
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
        toolDefinition: {
          name: UpdatePackage_Tool.name,
          description: UpdatePackage_Tool.description,
          inputSchema: UpdatePackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdatePackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockPackage_Tool.name,
          description: UnlockPackage_Tool.description,
          inputSchema: UnlockPackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockPackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckPackage_Tool.name,
          description: CheckPackage_Tool.description,
          inputSchema: CheckPackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckPackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeletePackage_Tool.name,
          description: DeletePackage_Tool.description,
          inputSchema: DeletePackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeletePackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockPackage_Tool.name,
          description: LockPackage_Tool.description,
          inputSchema: LockPackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockPackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidatePackage_Tool.name,
          description: ValidatePackage_Tool.description,
          inputSchema: ValidatePackage_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidatePackage(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreatePackageLow_Tool.name,
          description: CreatePackageLow_Tool.description,
          inputSchema: CreatePackageLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreatePackageLow(this.context, args) },
      },
      // Domain low-level handlers
      {
        toolDefinition: {
          name: UpdateDomainLow_Tool.name,
          description: UpdateDomainLow_Tool.description,
          inputSchema: UpdateDomainLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckDomain_Tool.name,
          description: CheckDomain_Tool.description,
          inputSchema: CheckDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteDomain_Tool.name,
          description: DeleteDomain_Tool.description,
          inputSchema: DeleteDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockDomain_Tool.name,
          description: LockDomain_Tool.description,
          inputSchema: LockDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockDomain_Tool.name,
          description: UnlockDomain_Tool.description,
          inputSchema: UnlockDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateDomain_Tool.name,
          description: ValidateDomain_Tool.description,
          inputSchema: ValidateDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateDomain(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateDomainLow_Tool.name,
          description: CreateDomainLow_Tool.description,
          inputSchema: CreateDomainLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateDomainLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateDomain_Tool.name,
          description: ActivateDomain_Tool.description,
          inputSchema: ActivateDomain_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateDomain(this.context, args) },
      },
      // DataElement low-level handlers
      {
        toolDefinition: {
          name: UpdateDataElementLow_Tool.name,
          description: UpdateDataElementLow_Tool.description,
          inputSchema: UpdateDataElementLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckDataElement_Tool.name,
          description: CheckDataElement_Tool.description,
          inputSchema: CheckDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteDataElement_Tool.name,
          description: DeleteDataElement_Tool.description,
          inputSchema: DeleteDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockDataElement_Tool.name,
          description: LockDataElement_Tool.description,
          inputSchema: LockDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockDataElement_Tool.name,
          description: UnlockDataElement_Tool.description,
          inputSchema: UnlockDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateDataElement_Tool.name,
          description: ValidateDataElement_Tool.description,
          inputSchema: ValidateDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateDataElement(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateDataElementLow_Tool.name,
          description: CreateDataElementLow_Tool.description,
          inputSchema: CreateDataElementLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateDataElementLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateDataElement_Tool.name,
          description: ActivateDataElement_Tool.description,
          inputSchema: ActivateDataElement_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateDataElement(this.context, args) },
      },
      // Transport low-level handlers
      {
        toolDefinition: {
          name: CreateTransportLow_Tool.name,
          description: CreateTransportLow_Tool.description,
          inputSchema: CreateTransportLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateTransportLow(this.context, args) },
      },
      // Table low-level handlers
      {
        toolDefinition: {
          name: UpdateTableLow_Tool.name,
          description: UpdateTableLow_Tool.description,
          inputSchema: UpdateTableLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateTableLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteTable_Tool.name,
          description: DeleteTable_Tool.description,
          inputSchema: DeleteTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteTable(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockTable_Tool.name,
          description: LockTable_Tool.description,
          inputSchema: LockTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockTable(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockTable_Tool.name,
          description: UnlockTable_Tool.description,
          inputSchema: UnlockTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockTable(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateTableLow_Tool.name,
          description: CreateTableLow_Tool.description,
          inputSchema: CreateTableLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateTableLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckTable_Tool.name,
          description: CheckTable_Tool.description,
          inputSchema: CheckTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckTable(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateTable_Tool.name,
          description: ValidateTable_Tool.description,
          inputSchema: ValidateTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateTable(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateTable_Tool.name,
          description: ActivateTable_Tool.description,
          inputSchema: ActivateTable_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateTable(this.context, args) },
      },
      // Structure low-level handlers
      {
        toolDefinition: {
          name: UpdateStructureLow_Tool.name,
          description: UpdateStructureLow_Tool.description,
          inputSchema: UpdateStructureLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateStructureLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckStructure_Tool.name,
          description: CheckStructure_Tool.description,
          inputSchema: CheckStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckStructure(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteStructure_Tool.name,
          description: DeleteStructure_Tool.description,
          inputSchema: DeleteStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteStructure(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockStructure_Tool.name,
          description: LockStructure_Tool.description,
          inputSchema: LockStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockStructure(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockStructure_Tool.name,
          description: UnlockStructure_Tool.description,
          inputSchema: UnlockStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockStructure(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateStructure_Tool.name,
          description: ValidateStructure_Tool.description,
          inputSchema: ValidateStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateStructure(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateStructureLow_Tool.name,
          description: CreateStructureLow_Tool.description,
          inputSchema: CreateStructureLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateStructureLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateStructure_Tool.name,
          description: ActivateStructure_Tool.description,
          inputSchema: ActivateStructure_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateStructure(this.context, args) },
      },
      // View low-level handlers
      {
        toolDefinition: {
          name: UpdateView_Tool.name,
          description: UpdateView_Tool.description,
          inputSchema: UpdateView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateViewLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckView_Tool.name,
          description: CheckView_Tool.description,
          inputSchema: CheckView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckView(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteView_Tool.name,
          description: DeleteView_Tool.description,
          inputSchema: DeleteView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteView(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockView_Tool.name,
          description: LockView_Tool.description,
          inputSchema: LockView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockView(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockView_Tool.name,
          description: UnlockView_Tool.description,
          inputSchema: UnlockView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockView(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateView_Tool.name,
          description: ValidateView_Tool.description,
          inputSchema: ValidateView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateView(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateViewLow_Tool.name,
          description: CreateViewLow_Tool.description,
          inputSchema: CreateViewLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateViewLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateView_Tool.name,
          description: ActivateView_Tool.description,
          inputSchema: ActivateView_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateView(this.context, args) },
      },
      // Class low-level handlers
      {
        toolDefinition: {
          name: UpdateClass_Tool.name,
          description: UpdateClass_Tool.description,
          inputSchema: UpdateClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateClassLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteClass_Tool.name,
          description: DeleteClass_Tool.description,
          inputSchema: DeleteClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockClass_Tool.name,
          description: LockClass_Tool.description,
          inputSchema: LockClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockClass_Tool.name,
          description: UnlockClass_Tool.description,
          inputSchema: UnlockClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateClassLow_Tool.name,
          description: CreateClassLow_Tool.description,
          inputSchema: CreateClassLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateClassLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateClass_Tool.name,
          description: ValidateClass_Tool.description,
          inputSchema: ValidateClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckClass_Tool.name,
          description: CheckClass_Tool.description,
          inputSchema: CheckClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateClass_Tool.name,
          description: ActivateClass_Tool.description,
          inputSchema: ActivateClass_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateClass(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockClassTestClasses_Tool.name,
          description: LockClassTestClasses_Tool.description,
          inputSchema: LockClassTestClasses_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockClassTestClasses(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockClassTestClasses_Tool.name,
          description: UnlockClassTestClasses_Tool.description,
          inputSchema: UnlockClassTestClasses_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockClassTestClasses(this.context, args) },
      },
      {
        toolDefinition: {
          name: UpdateClassTestClasses_Tool.name,
          description: UpdateClassTestClasses_Tool.description,
          inputSchema: UpdateClassTestClasses_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateClassTestClasses(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateClassTestClasses_Tool.name,
          description: ActivateClassTestClasses_Tool.description,
          inputSchema: ActivateClassTestClasses_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateClassTestClasses(this.context, args) },
      },
      {
        toolDefinition: {
          name: RunClassUnitTests_Tool.name,
          description: RunClassUnitTests_Tool.description,
          inputSchema: RunClassUnitTests_Tool.inputSchema,
        },
        handler: (args: any) => { return handleRunClassUnitTests(this.context, args) },
      },
      {
        toolDefinition: {
          name: GetClassUnitTestStatus_Tool.name,
          description: GetClassUnitTestStatus_Tool.description,
          inputSchema: GetClassUnitTestStatus_Tool.inputSchema,
        },
        handler: (args: any) => { return handleGetClassUnitTestStatus(this.context, args) },
      },
      {
        toolDefinition: {
          name: GetClassUnitTestResult_Tool.name,
          description: GetClassUnitTestResult_Tool.description,
          inputSchema: GetClassUnitTestResult_Tool.inputSchema,
        },
        handler: (args: any) => { return handleGetClassUnitTestResult(this.context, args) },
      },
      // Program low-level handlers
      {
        toolDefinition: {
          name: UpdateProgram_Tool.name,
          description: UpdateProgram_Tool.description,
          inputSchema: UpdateProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateProgramLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckProgram_Tool.name,
          description: CheckProgram_Tool.description,
          inputSchema: CheckProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckProgram(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteProgram_Tool.name,
          description: DeleteProgram_Tool.description,
          inputSchema: DeleteProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteProgram(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockProgram_Tool.name,
          description: LockProgram_Tool.description,
          inputSchema: LockProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockProgram(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockProgram_Tool.name,
          description: UnlockProgram_Tool.description,
          inputSchema: UnlockProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockProgram(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateProgram_Tool.name,
          description: ValidateProgram_Tool.description,
          inputSchema: ValidateProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateProgram(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateProgramLow_Tool.name,
          description: CreateProgramLow_Tool.description,
          inputSchema: CreateProgramLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateProgramLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateProgram_Tool.name,
          description: ActivateProgram_Tool.description,
          inputSchema: ActivateProgram_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateProgram(this.context, args) },
      },
      // Interface low-level handlers
      {
        toolDefinition: {
          name: UpdateInterface_Tool.name,
          description: UpdateInterface_Tool.description,
          inputSchema: UpdateInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateInterfaceLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckInterface_Tool.name,
          description: CheckInterface_Tool.description,
          inputSchema: CheckInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckInterface(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteInterface_Tool.name,
          description: DeleteInterface_Tool.description,
          inputSchema: DeleteInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteInterface(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockInterface_Tool.name,
          description: LockInterface_Tool.description,
          inputSchema: LockInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockInterface(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockInterface_Tool.name,
          description: UnlockInterface_Tool.description,
          inputSchema: UnlockInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockInterface(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateInterface_Tool.name,
          description: ValidateInterface_Tool.description,
          inputSchema: ValidateInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateInterface(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateInterfaceLow_Tool.name,
          description: CreateInterfaceLow_Tool.description,
          inputSchema: CreateInterfaceLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateInterfaceLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateInterface_Tool.name,
          description: ActivateInterface_Tool.description,
          inputSchema: ActivateInterface_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateInterface(this.context, args) },
      },
      // Function low-level handlers
      {
        toolDefinition: {
          name: CheckFunctionGroup_Tool.name,
          description: CheckFunctionGroup_Tool.description,
          inputSchema: CheckFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckFunctionGroup(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteFunctionGroup_Tool.name,
          description: DeleteFunctionGroup_Tool.description,
          inputSchema: DeleteFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteFunctionGroup(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteFunctionModule_Tool.name,
          description: DeleteFunctionModule_Tool.description,
          inputSchema: DeleteFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockFunctionGroup_Tool.name,
          description: LockFunctionGroup_Tool.description,
          inputSchema: LockFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockFunctionGroup(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockFunctionModule_Tool.name,
          description: LockFunctionModule_Tool.description,
          inputSchema: LockFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockFunctionGroup_Tool.name,
          description: UnlockFunctionGroup_Tool.description,
          inputSchema: UnlockFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockFunctionGroup(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockFunctionModule_Tool.name,
          description: UnlockFunctionModule_Tool.description,
          inputSchema: UnlockFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateFunctionGroup_Tool.name,
          description: ValidateFunctionGroup_Tool.description,
          inputSchema: ValidateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateFunctionGroup(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateFunctionGroupLow_Tool.name,
          description: CreateFunctionGroupLow_Tool.description,
          inputSchema: CreateFunctionGroupLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateFunctionGroupLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateFunctionModuleLow_Tool.name,
          description: CreateFunctionModuleLow_Tool.description,
          inputSchema: CreateFunctionModuleLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateFunctionModuleLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: UpdateFunctionModule_Tool.name,
          description: UpdateFunctionModule_Tool.description,
          inputSchema: UpdateFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateFunctionModuleLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateFunctionModule_Tool.name,
          description: ValidateFunctionModule_Tool.description,
          inputSchema: ValidateFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: CheckFunctionModule_Tool.name,
          description: CheckFunctionModule_Tool.description,
          inputSchema: CheckFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateFunctionModule_Tool.name,
          description: ActivateFunctionModule_Tool.description,
          inputSchema: ActivateFunctionModule_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateFunctionModule(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateFunctionGroup_Tool.name,
          description: ActivateFunctionGroup_Tool.description,
          inputSchema: ActivateFunctionGroup_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateFunctionGroup(this.context, args) },
      },
      // BehaviorDefinition low-level handlers
      {
        toolDefinition: {
          name: CheckBehaviorDefinition_Tool.name,
          description: CheckBehaviorDefinition_Tool.description,
          inputSchema: CheckBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckBehaviorDefinition(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteBehaviorDefinition_Tool.name,
          description: DeleteBehaviorDefinition_Tool.description,
          inputSchema: DeleteBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteBehaviorDefinition(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockBehaviorDefinition_Tool.name,
          description: LockBehaviorDefinition_Tool.description,
          inputSchema: LockBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockBehaviorDefinition(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockBehaviorDefinition_Tool.name,
          description: UnlockBehaviorDefinition_Tool.description,
          inputSchema: UnlockBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockBehaviorDefinition(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateBehaviorDefinition_Tool.name,
          description: ValidateBehaviorDefinition_Tool.description,
          inputSchema: ValidateBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateBehaviorDefinition(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateBehaviorDefinitionLow_Tool.name,
          description: CreateBehaviorDefinitionLow_Tool.description,
          inputSchema: CreateBehaviorDefinitionLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateBehaviorDefinitionLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: UpdateBehaviorDefinitionLow_Tool.name,
          description: UpdateBehaviorDefinitionLow_Tool.description,
          inputSchema: UpdateBehaviorDefinitionLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateBehaviorDefinitionLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateBehaviorDefinition_Tool.name,
          description: ActivateBehaviorDefinition_Tool.description,
          inputSchema: ActivateBehaviorDefinition_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateBehaviorDefinition(this.context, args) },
      },
      // MetadataExtension low-level handlers
      {
        toolDefinition: {
          name: CheckMetadataExtension_Tool.name,
          description: CheckMetadataExtension_Tool.description,
          inputSchema: CheckMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCheckMetadataExtension(this.context, args) },
      },
      {
        toolDefinition: {
          name: DeleteMetadataExtension_Tool.name,
          description: DeleteMetadataExtension_Tool.description,
          inputSchema: DeleteMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleDeleteMetadataExtension(this.context, args) },
      },
      {
        toolDefinition: {
          name: LockMetadataExtension_Tool.name,
          description: LockMetadataExtension_Tool.description,
          inputSchema: LockMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleLockMetadataExtension(this.context, args) },
      },
      {
        toolDefinition: {
          name: UnlockMetadataExtension_Tool.name,
          description: UnlockMetadataExtension_Tool.description,
          inputSchema: UnlockMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUnlockMetadataExtension(this.context, args) },
      },
      {
        toolDefinition: {
          name: ValidateMetadataExtension_Tool.name,
          description: ValidateMetadataExtension_Tool.description,
          inputSchema: ValidateMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleValidateMetadataExtension(this.context, args) },
      },
      {
        toolDefinition: {
          name: CreateMetadataExtensionLow_Tool.name,
          description: CreateMetadataExtensionLow_Tool.description,
          inputSchema: CreateMetadataExtensionLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleCreateMetadataExtensionLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: UpdateMetadataExtensionLow_Tool.name,
          description: UpdateMetadataExtensionLow_Tool.description,
          inputSchema: UpdateMetadataExtensionLow_Tool.inputSchema,
        },
        handler: (args: any) => { return handleUpdateMetadataExtensionLow(this.context, args) },
      },
      {
        toolDefinition: {
          name: ActivateMetadataExtension_Tool.name,
          description: ActivateMetadataExtension_Tool.description,
          inputSchema: ActivateMetadataExtension_Tool.inputSchema,
        },
        handler: (args: any) => { return handleActivateMetadataExtension(this.context, args) },
      },
    ];
  }
}
