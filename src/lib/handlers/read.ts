/**
 * The handlers that read — `lib`'s public half for a read-only facade.
 *
 * **Why two barrels instead of one.** `@mcp-abap-adt/compact-readonly-entries` routes to
 * these and must not be able to reach a write handler: capability is what a
 * package imports, not what its tool list happens to enumerate
 * (`compactCapabilitySplit.test.ts`). A single barrel of all 104 handlers the
 * compact facade needs would relink every write route into the read-only package
 * the moment it imported it, and the split would be decorative.
 *
 * The membership is measured, not curated: these are exactly the handlers reachable
 * from `CompactReadOnlyHandlersGroup`, and `handlerBarrels.test.ts` holds the two
 * barrels disjoint and their union equal to what the facade needs. Nothing here
 * changes an object, takes an enqueue, or executes ABAP.
 */
export { handleGetBehaviorDefinition } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition.js';
export { handleGetBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation.js';
export { handleGetClass } from '../../handlers/class/high/handleGetClass.js';
export { handleGetLocalDefinitions } from '../../handlers/class/high/handleGetLocalDefinitions.js';
export { handleGetLocalMacros } from '../../handlers/class/high/handleGetLocalMacros.js';
export { handleGetLocalTestClass } from '../../handlers/class/high/handleGetLocalTestClass.js';
export { handleGetLocalTypes } from '../../handlers/class/high/handleGetLocalTypes.js';
export { handleCheckObject } from '../../handlers/common/low/handleCheckObject.js';
export { handleDeletionCheck } from '../../handlers/common/low/handleDeletionCheck.js';
export { handleValidateObject } from '../../handlers/common/low/handleValidateObject.js';
// An activation run read by its id, for `HandlerGet` parts
// `activation_status` and `activation_results`.
export {
  handleGetActivationResults,
  handleGetActivationStatus,
} from '../../handlers/common/readonly/handleGetActivationRun.js';
export { handleGetDataElement } from '../../handlers/data_element/high/handleGetDataElement.js';
export { handleGetDdl } from '../../handlers/ddl/high/handleGetDdl.js';
export { handleGetDomain } from '../../handlers/domain/high/handleGetDomain.js';
export { handleGetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup.js';
export { handleGetFunctionModule } from '../../handlers/function_module/high/handleGetFunctionModule.js';
export { handleGetInterface } from '../../handlers/interface/high/handleGetInterface.js';
export { handleGetMetadataExtension } from '../../handlers/metadata_extension/high/handleGetMetadataExtension.js';
export { handleGetPackage } from '../../handlers/package/high/handleGetPackage.js';
export { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents.js';
export { handleGetProgram } from '../../handlers/program/high/handleGetProgram.js';
export { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject.js';
export { handleGetServiceBinding } from '../../handlers/service_binding/high/handleGetServiceBinding.js';
export { handleListServiceBindingTypes } from '../../handlers/service_binding/high/handleListServiceBindingTypes.js';
export { handleValidateServiceBinding } from '../../handlers/service_binding/high/handleValidateServiceBinding.js';
export { handleGetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition.js';
export { handleGetStructure } from '../../handlers/structure/high/handleGetStructure.js';
// The metadata readers and the preview-URL tool: `part` on the compact read
// routes to these, and a package that carries only read routes must be able to
// import them without reaching a write handler.
export {
  handleGetNodeStructure,
  handleGetNodeStructureOnce,
} from '../../handlers/system/low/handleGetNodeStructure.js';
export { handleGetVirtualFolders } from '../../handlers/system/low/handleGetVirtualFolders.js';
export { handleGetObjectStructure } from '../../handlers/system/readonly/handleGetObjectStructure.js';
export { handleGetServiceBindingPreviewUrl } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl.js';
export { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery.js';
export { handleGetWhereUsed } from '../../handlers/system/readonly/handleGetWhereUsed.js';
export { handleRuntimeAnalyzeProfilerTrace } from '../../handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.js';
export { handleRuntimeGetDumpById } from '../../handlers/system/readonly/handleRuntimeGetDumpById.js';
export { handleRuntimeGetProfilerTraceData } from '../../handlers/system/readonly/handleRuntimeGetProfilerTraceData.js';
export { handleRuntimeListFeeds } from '../../handlers/system/readonly/handleRuntimeListFeeds.js';
export { handleRuntimeListProfilerTraceFiles } from '../../handlers/system/readonly/handleRuntimeListProfilerTraceFiles.js';
export { handleGetTable } from '../../handlers/table/high/handleGetTable.js';
export { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents.js';
export { handleReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects.js';
export { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest.js';
export { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult.js';
export { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus.js';
export { handleGetUnitTest } from '../../handlers/unit_test/high/handleGetUnitTest.js';
export { handleGetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult.js';
export { handleGetUnitTestStatus } from '../../handlers/unit_test/high/handleGetUnitTestStatus.js';
