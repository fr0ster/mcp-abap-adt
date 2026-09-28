/**
 * The handlers that write, lock, activate or execute — `lib`'s other public half.
 *
 * The counterpart to `read.ts`, for `@mcp-abap-adt/compact-modify`. See that file
 * for why the barrels are separate; the short version is that a read-only package
 * must not be able to import a write route, and a shared barrel would hand it one.
 *
 * `TYPE_TO_FAMILY` lives here rather than beside the types because it is the
 * activation family map, and activation writes.
 */
export { handleCreateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition.js';
export { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition.js';
export { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition.js';
export { handleCreateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation.js';
export { handleDeleteBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.js';
export { handleUpdateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.js';
export { handleCreateClass } from '../../handlers/class/high/handleCreateClass.js';
export { handleDeleteClass } from '../../handlers/class/high/handleDeleteClass.js';
export { handleDeleteLocalDefinitions } from '../../handlers/class/high/handleDeleteLocalDefinitions.js';
export { handleDeleteLocalMacros } from '../../handlers/class/high/handleDeleteLocalMacros.js';
export { handleDeleteLocalTestClass } from '../../handlers/class/high/handleDeleteLocalTestClass.js';
export { handleDeleteLocalTypes } from '../../handlers/class/high/handleDeleteLocalTypes.js';
export { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass.js';
export { handleUpdateLocalDefinitions } from '../../handlers/class/high/handleUpdateLocalDefinitions.js';
export { handleUpdateLocalMacros } from '../../handlers/class/high/handleUpdateLocalMacros.js';
export { handleUpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass.js';
export { handleUpdateLocalTypes } from '../../handlers/class/high/handleUpdateLocalTypes.js';
export {
  handleActivateObject,
  TYPE_TO_FAMILY,
} from '../../handlers/common/low/handleActivateObject.js';
export { handleLockObject } from '../../handlers/common/low/handleLockObject.js';
export { handleUnlockObject } from '../../handlers/common/low/handleUnlockObject.js';
export { handleCreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement.js';
export { handleDeleteDataElement } from '../../handlers/data_element/high/handleDeleteDataElement.js';
export { handleUpdateDataElement } from '../../handlers/data_element/high/handleUpdateDataElement.js';
export { handleCreateDdl } from '../../handlers/ddl/high/handleCreateDdl.js';
export { handleDeleteDdl } from '../../handlers/ddl/high/handleDeleteDdl.js';
export { handleUpdateDdl } from '../../handlers/ddl/high/handleUpdateDdl.js';
export { handleCreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension.js';
export { handleUpdateMetadataExtension } from '../../handlers/ddlx/high/handleUpdateMetadataExtension.js';
export { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain.js';
export { handleDeleteDomain } from '../../handlers/domain/high/handleDeleteDomain.js';
export { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain.js';
export { handleCreateFunctionGroup } from '../../handlers/function/high/handleCreateFunctionGroup.js';
export { handleCreateFunctionModule } from '../../handlers/function/high/handleCreateFunctionModule.js';
export { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup.js';
export { handleUpdateFunctionModule } from '../../handlers/function/high/handleUpdateFunctionModule.js';
export { handleDeleteFunctionGroup } from '../../handlers/function_group/high/handleDeleteFunctionGroup.js';
export { handleDeleteFunctionModule } from '../../handlers/function_module/high/handleDeleteFunctionModule.js';
export { handleCreateInterface } from '../../handlers/interface/high/handleCreateInterface.js';
export { handleDeleteInterface } from '../../handlers/interface/high/handleDeleteInterface.js';
export { handleUpdateInterface } from '../../handlers/interface/high/handleUpdateInterface.js';
export { handleDeleteMetadataExtension } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension.js';
export { handleCreatePackage } from '../../handlers/package/high/handleCreatePackage.js';
export { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram.js';
export { handleDeleteProgram } from '../../handlers/program/high/handleDeleteProgram.js';
export { handleUpdateProgram } from '../../handlers/program/high/handleUpdateProgram.js';
export { handleCreateServiceBinding } from '../../handlers/service_binding/high/handleCreateServiceBinding.js';
export { handleDeleteServiceBinding } from '../../handlers/service_binding/high/handleDeleteServiceBinding.js';
export { handleUpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding.js';
export { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition.js';
export { handleDeleteServiceDefinition } from '../../handlers/service_definition/high/handleDeleteServiceDefinition.js';
export { handleUpdateServiceDefinition } from '../../handlers/service_definition/high/handleUpdateServiceDefinition.js';
export { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure.js';
export { handleDeleteStructure } from '../../handlers/structure/high/handleDeleteStructure.js';
export { handleUpdateStructure } from '../../handlers/structure/high/handleUpdateStructure.js';
export { handleRuntimeRunClass } from '../../handlers/system/readonly/handleRuntimeRunClass.js';
export { handleRuntimeRunClassWithProfiling } from '../../handlers/system/readonly/handleRuntimeRunClassWithProfiling.js';
export { handleRuntimeRunProgram } from '../../handlers/system/readonly/handleRuntimeRunProgram.js';
export { handleRuntimeRunProgramWithProfiling } from '../../handlers/system/readonly/handleRuntimeRunProgramWithProfiling.js';
export { handleCreateTable } from '../../handlers/table/high/handleCreateTable.js';
export { handleDeleteTable } from '../../handlers/table/high/handleDeleteTable.js';
export { handleUpdateTable } from '../../handlers/table/high/handleUpdateTable.js';
export { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport.js';
export { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest.js';
export { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest.js';
export { handleDeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest.js';
export { handleDeleteUnitTest } from '../../handlers/unit_test/high/handleDeleteUnitTest.js';
export { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest.js';
export { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest.js';
export { handleUpdateUnitTest } from '../../handlers/unit_test/high/handleUpdateUnitTest.js';
