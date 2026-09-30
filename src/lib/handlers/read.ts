/**
 * The handlers that read — `lib`'s public half for a read-only facade.
 *
 * **Why two barrels instead of one.** `@mcp-abap-adt/compact-readonly` routes to
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
export { handleReadBehaviorDefinition } from '../../handlers/behavior_definition/readonly/handleReadBehaviorDefinition.js';
export { handleGetBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation.js';
export { handleReadBehaviorImplementation } from '../../handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.js';
export { handleGetClass } from '../../handlers/class/high/handleGetClass.js';
export { handleGetLocalDefinitions } from '../../handlers/class/high/handleGetLocalDefinitions.js';
export { handleGetLocalMacros } from '../../handlers/class/high/handleGetLocalMacros.js';
export { handleGetLocalTestClass } from '../../handlers/class/high/handleGetLocalTestClass.js';
export { handleGetLocalTypes } from '../../handlers/class/high/handleGetLocalTypes.js';
export { handleReadClass } from '../../handlers/class/readonly/handleReadClass.js';
export { handleCheckObject } from '../../handlers/common/low/handleCheckObject.js';
export { handleValidateObject } from '../../handlers/common/low/handleValidateObject.js';
export { handleGetDataElement } from '../../handlers/data_element/high/handleGetDataElement.js';
export { handleReadDataElement } from '../../handlers/data_element/readonly/handleReadDataElement.js';
export { handleGetDdl } from '../../handlers/ddl/high/handleGetDdl.js';
export { handleReadDdl } from '../../handlers/ddl/readonly/handleReadDdl.js';
export { handleGetDomain } from '../../handlers/domain/high/handleGetDomain.js';
export { handleReadDomain } from '../../handlers/domain/readonly/handleReadDomain.js';
export { handleGetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup.js';
export { handleReadFunctionGroup } from '../../handlers/function_group/readonly/handleReadFunctionGroup.js';
export { handleReadFunctionInclude } from '../../handlers/function_include/readonly/handleReadFunctionInclude.js';
export { handleGetFunctionModule } from '../../handlers/function_module/high/handleGetFunctionModule.js';
export { handleReadFunctionModule } from '../../handlers/function_module/readonly/handleReadFunctionModule.js';
export { handleGetInterface } from '../../handlers/interface/high/handleGetInterface.js';
export { handleReadInterface } from '../../handlers/interface/readonly/handleReadInterface.js';
export { handleReadMessageClass } from '../../handlers/message_class/readonly/handleReadMessageClass.js';
export { handleGetMetadataExtension } from '../../handlers/metadata_extension/high/handleGetMetadataExtension.js';
export { handleReadMetadataExtension } from '../../handlers/metadata_extension/readonly/handleReadMetadataExtension.js';
export { handleGetPackage } from '../../handlers/package/high/handleGetPackage.js';
export { handleGetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents.js';
export { handleReadPackage } from '../../handlers/package/readonly/handleReadPackage.js';
export { handleGetProgram } from '../../handlers/program/high/handleGetProgram.js';
export { handleReadProgram } from '../../handlers/program/readonly/handleReadProgram.js';
export { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject.js';
export { handleGetServiceBinding } from '../../handlers/service_binding/high/handleGetServiceBinding.js';
export { handleListServiceBindingTypes } from '../../handlers/service_binding/high/handleListServiceBindingTypes.js';
export { handleValidateServiceBinding } from '../../handlers/service_binding/high/handleValidateServiceBinding.js';
export { handleReadServiceBinding } from '../../handlers/service_binding/readonly/handleReadServiceBinding.js';
export { handleGetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition.js';
export { handleReadServiceDefinition } from '../../handlers/service_definition/readonly/handleReadServiceDefinition.js';
export { handleGetStructure } from '../../handlers/structure/high/handleGetStructure.js';
export { handleReadStructure } from '../../handlers/structure/readonly/handleReadStructure.js';
// The metadata readers and the preview-URL tool: `part` on the compact read
// routes to these, and a package that carries only read routes must be able to
// import them without reaching a write handler.
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
export { handleReadTable } from '../../handlers/table/readonly/handleReadTable.js';
export { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest.js';
export { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult.js';
export { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus.js';
export { handleGetUnitTest } from '../../handlers/unit_test/high/handleGetUnitTest.js';
export { handleGetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult.js';
export { handleGetUnitTestStatus } from '../../handlers/unit_test/high/handleGetUnitTestStatus.js';
