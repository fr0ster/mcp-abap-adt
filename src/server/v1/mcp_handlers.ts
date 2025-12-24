#!/usr/bin/env node
// Simple stdio mode detection (like reference implementation)
// No output suppression needed - dotenv removed, manual .env parsing used

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import type { HandlerContext } from '../../handlers/interfaces.js';

// dotenv removed - using manual .env parsing for all modes to avoid stdout pollution

import { handleCreateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleGetBehaviorDefinition } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionHigh } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleActivateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { handleCheckBehaviorDefinition } from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { handleCreateBehaviorDefinition as handleCreateBehaviorDefinitionLow } from '../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { handleLockBehaviorDefinition } from '../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { handleUnlockBehaviorDefinition } from '../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionLow } from '../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleValidateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { handleCreateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleGetClass } from '../../handlers/class/high/handleGetClass';
// import { handleActivateObject } from "../../handlers/common/low/handleActivateObject";
// import { handleDeleteObject } from "../../handlers/common/low/handleDeleteObject";
// import { handleCheckObject } from "../../handlers/common/low/handleCheckObject";
import { handleUpdateClass as handleUpdateClassHigh } from '../../handlers/class/high/handleUpdateClass';
import { handleActivateClass } from '../../handlers/class/low/handleActivateClass';
import { handleActivateClassTestClasses } from '../../handlers/class/low/handleActivateClassTestClasses';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { handleCreateClass as handleCreateClassLow } from '../../handlers/class/low/handleCreateClass';
// New low-level handlers imports
import { handleDeleteClass } from '../../handlers/class/low/handleDeleteClass';
import { handleGetClassUnitTestResult } from '../../handlers/class/low/handleGetClassUnitTestResult';
import { handleGetClassUnitTestStatus } from '../../handlers/class/low/handleGetClassUnitTestStatus';
import { handleLockClass } from '../../handlers/class/low/handleLockClass';
import { handleLockClassTestClasses } from '../../handlers/class/low/handleLockClassTestClasses';
import { handleRunClassUnitTests } from '../../handlers/class/low/handleRunClassUnitTests';
import { handleUnlockClass } from '../../handlers/class/low/handleUnlockClass';
import { handleUnlockClassTestClasses } from '../../handlers/class/low/handleUnlockClassTestClasses';
import { handleUpdateClass as handleUpdateClassLow } from '../../handlers/class/low/handleUpdateClass';
import { handleUpdateClassTestClasses } from '../../handlers/class/low/handleUpdateClassTestClasses';
import { handleValidateClass } from '../../handlers/class/low/handleValidateClass';
import { handleLockObject } from '../../handlers/common/low/handleLockObject';
import { handleUnlockObject } from '../../handlers/common/low/handleUnlockObject';
import { handleValidateObject } from '../../handlers/common/low/handleValidateObject';
import { handleCreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement';
import { handleGetDataElement } from '../../handlers/data_element/high/handleGetDataElement';
import { handleUpdateDataElement as handleUpdateDataElementHigh } from '../../handlers/data_element/high/handleUpdateDataElement';
import { handleActivateDataElement } from '../../handlers/data_element/low/handleActivateDataElement';
import { handleCheckDataElement } from '../../handlers/data_element/low/handleCheckDataElement';
import { handleCreateDataElement as handleCreateDataElementLow } from '../../handlers/data_element/low/handleCreateDataElement';
import { handleDeleteDataElement } from '../../handlers/data_element/low/handleDeleteDataElement';
import { handleLockDataElement } from '../../handlers/data_element/low/handleLockDataElement';
import { handleUnlockDataElement } from '../../handlers/data_element/low/handleUnlockDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/low/handleUpdateDataElement';
import { handleValidateDataElement } from '../../handlers/data_element/low/handleValidateDataElement';
import { handleCreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionHigh } from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleActivateMetadataExtension } from '../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleCheckMetadataExtension } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { handleCreateMetadataExtension as handleCreateMetadataExtensionLow } from '../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../handlers/ddlx/low/handleDeleteMetadataExtension';
import { handleLockMetadataExtension } from '../../handlers/ddlx/low/handleLockMetadataExtension';
import { handleUnlockMetadataExtension } from '../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionLow } from '../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleValidateMetadataExtension } from '../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleGetDomain } from '../../handlers/domain/high/handleGetDomain';
import { handleUpdateDomain as handleUpdateDomainHigh } from '../../handlers/domain/high/handleUpdateDomain';
import { handleActivateDomain } from '../../handlers/domain/low/handleActivateDomain';
import { handleCheckDomain } from '../../handlers/domain/low/handleCheckDomain';
import { handleCreateDomain as handleCreateDomainLow } from '../../handlers/domain/low/handleCreateDomain';
import { handleDeleteDomain } from '../../handlers/domain/low/handleDeleteDomain';
import { handleLockDomain } from '../../handlers/domain/low/handleLockDomain';
import { handleUnlockDomain } from '../../handlers/domain/low/handleUnlockDomain';
import { handleUpdateDomain } from '../../handlers/domain/low/handleUpdateDomain';
import { handleValidateDomain } from '../../handlers/domain/low/handleValidateDomain';
import { handleGetEnhancementImpl } from '../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import { handleGetEnhancementSpot } from '../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleCreateFunctionGroup } from '../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../handlers/function/high/handleCreateFunctionModule';
import { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { handleUpdateFunctionModule as handleUpdateFunctionModuleHigh } from '../../handlers/function/high/handleUpdateFunctionModule';
import { handleActivateFunctionGroup } from '../../handlers/function/low/handleActivateFunctionGroup';
import { handleActivateFunctionModule } from '../../handlers/function/low/handleActivateFunctionModule';
import { handleCheckFunctionGroup } from '../../handlers/function/low/handleCheckFunctionGroup';
import { handleCheckFunctionModule } from '../../handlers/function/low/handleCheckFunctionModule';
import { handleCreateFunctionGroup as handleCreateFunctionGroupLow } from '../../handlers/function/low/handleCreateFunctionGroup';
import { handleCreateFunctionModule as handleCreateFunctionModuleLow } from '../../handlers/function/low/handleCreateFunctionModule';
import { handleDeleteFunctionGroup } from '../../handlers/function/low/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../handlers/function/low/handleDeleteFunctionModule';
import { handleLockFunctionGroup } from '../../handlers/function/low/handleLockFunctionGroup';
import { handleLockFunctionModule } from '../../handlers/function/low/handleLockFunctionModule';
import { handleUnlockFunctionGroup } from '../../handlers/function/low/handleUnlockFunctionGroup';
import { handleUnlockFunctionModule } from '../../handlers/function/low/handleUnlockFunctionModule';
import { handleUpdateFunctionModule as handleUpdateFunctionModuleLow } from '../../handlers/function/low/handleUpdateFunctionModule';
import { handleValidateFunctionGroup } from '../../handlers/function/low/handleValidateFunctionGroup';
import { handleValidateFunctionModule } from '../../handlers/function/low/handleValidateFunctionModule';
import { handleGetFunction } from '../../handlers/function/readonly/handleGetFunction';
import { handleGetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup';
import { handleGetInclude } from '../../handlers/include/readonly/handleGetInclude';
import { handleGetIncludesList } from '../../handlers/include/readonly/handleGetIncludesList';
import { handleCreateInterface } from '../../handlers/interface/high/handleCreateInterface';
import { handleGetInterface } from '../../handlers/interface/high/handleGetInterface';
import { handleUpdateInterface as handleUpdateInterfaceHigh } from '../../handlers/interface/high/handleUpdateInterface';
import { handleActivateInterface } from '../../handlers/interface/low/handleActivateInterface';
import { handleCheckInterface } from '../../handlers/interface/low/handleCheckInterface';
import { handleCreateInterface as handleCreateInterfaceLow } from '../../handlers/interface/low/handleCreateInterface';
import { handleDeleteInterface } from '../../handlers/interface/low/handleDeleteInterface';
import { handleLockInterface } from '../../handlers/interface/low/handleLockInterface';
import { handleUnlockInterface } from '../../handlers/interface/low/handleUnlockInterface';
import { handleUpdateInterface as handleUpdateInterfaceLow } from '../../handlers/interface/low/handleUpdateInterface';
import { handleValidateInterface } from '../../handlers/interface/low/handleValidateInterface';
import { handleCreatePackage } from '../../handlers/package/high/handleCreatePackage';
import { handleCheckPackage } from '../../handlers/package/low/handleCheckPackage';
import { handleCreatePackage as handleCreatePackageLow } from '../../handlers/package/low/handleCreatePackage';
import { handleDeletePackage } from '../../handlers/package/low/handleDeletePackage';
import { handleLockPackage } from '../../handlers/package/low/handleLockPackage';
import { handleUnlockPackage } from '../../handlers/package/low/handleUnlockPackage';
import { handleUpdatePackage } from '../../handlers/package/low/handleUpdatePackage';
import { handleValidatePackage } from '../../handlers/package/low/handleValidatePackage';
import { handleGetPackage } from '../../handlers/package/readonly/handleGetPackage';
import { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram';
// Import handler functions
// Import handler functions
import { handleGetProgram } from '../../handlers/program/high/handleGetProgram';
import { handleUpdateProgram as handleUpdateProgramHigh } from '../../handlers/program/high/handleUpdateProgram';
import { handleActivateProgram } from '../../handlers/program/low/handleActivateProgram';
import { handleCheckProgram } from '../../handlers/program/low/handleCheckProgram';
import { handleCreateProgram as handleCreateProgramLow } from '../../handlers/program/low/handleCreateProgram';
import { handleDeleteProgram } from '../../handlers/program/low/handleDeleteProgram';
import { handleLockProgram } from '../../handlers/program/low/handleLockProgram';
import { handleUnlockProgram } from '../../handlers/program/low/handleUnlockProgram';
import { handleUpdateProgram as handleUpdateProgramLow } from '../../handlers/program/low/handleUpdateProgram';
import { handleValidateProgram } from '../../handlers/program/low/handleValidateProgram';
import { handleGetProgFullCode } from '../../handlers/program/readonly/handleGetProgFullCode';
import { handleGetObjectsByType } from '../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../handlers/search/readonly/handleGetObjectsList';
import { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleGetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition';
import { handleUpdateServiceDefinition } from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';
import { handleGetStructure } from '../../handlers/structure/high/handleGetStructure';
import { handleUpdateStructure as handleUpdateStructureHigh } from '../../handlers/structure/high/handleUpdateStructure';
import { handleActivateStructure } from '../../handlers/structure/low/handleActivateStructure';
import { handleCheckStructure } from '../../handlers/structure/low/handleCheckStructure';
import { handleCreateStructure as handleCreateStructureLow } from '../../handlers/structure/low/handleCreateStructure';
import { handleDeleteStructure } from '../../handlers/structure/low/handleDeleteStructure';
import { handleLockStructure } from '../../handlers/structure/low/handleLockStructure';
import { handleUnlockStructure } from '../../handlers/structure/low/handleUnlockStructure';
import { handleUpdateStructure as handleUpdateStructureLow } from '../../handlers/structure/low/handleUpdateStructure';
import { handleValidateStructure } from '../../handlers/structure/low/handleValidateStructure';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapAST } from '../../handlers/system/readonly/handleGetAbapAST';
import { handleGetAbapSemanticAnalysis } from '../../handlers/system/readonly/handleGetAbapSemanticAnalysis';
import { handleGetAbapSystemSymbols } from '../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { handleGetInactiveObjects } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { handleGetObjectInfo } from '../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetObjectNodeFromCache } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { handleGetObjectStructure } from '../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetSession } from '../../handlers/system/readonly/handleGetSession';
import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';
import { handleGetTransaction } from '../../handlers/system/readonly/handleGetTransaction';
import { handleGetTypeInfo } from '../../handlers/system/readonly/handleGetTypeInfo';
import { handleGetWhereUsed } from '../../handlers/system/readonly/handleGetWhereUsed';
import { handleCreateTable } from '../../handlers/table/high/handleCreateTable';
import { handleGetTable } from '../../handlers/table/high/handleGetTable';
import { handleUpdateTable as handleUpdateTableHigh } from '../../handlers/table/high/handleUpdateTable';
import { handleActivateTable } from '../../handlers/table/low/handleActivateTable';
import { handleCheckTable } from '../../handlers/table/low/handleCheckTable';
import { handleCreateTable as handleCreateTableLow } from '../../handlers/table/low/handleCreateTable';
import { handleDeleteTable } from '../../handlers/table/low/handleDeleteTable';
import { handleLockTable } from '../../handlers/table/low/handleLockTable';
import { handleUnlockTable } from '../../handlers/table/low/handleUnlockTable';
import { handleUpdateTable as handleUpdateTableLow } from '../../handlers/table/low/handleUpdateTable';
import { handleValidateTable } from '../../handlers/table/low/handleValidateTable';
import { handleGetTableContents } from '../../handlers/table/readonly/handleGetTableContents';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { handleCreateTransport as handleCreateTransportLow } from '../../handlers/transport/low/handleCreateTransport';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';
import { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleDeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { handleDeleteUnitTest } from '../../handlers/unit_test/high/handleDeleteUnitTest';
import { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import { handleGetUnitTest } from '../../handlers/unit_test/high/handleGetUnitTest';
import { handleGetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult';
import { handleGetUnitTestStatus } from '../../handlers/unit_test/high/handleGetUnitTestStatus';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { handleUpdateUnitTest } from '../../handlers/unit_test/high/handleUpdateUnitTest';
import { handleCreateView } from '../../handlers/view/high/handleCreateView';
import { handleGetView } from '../../handlers/view/high/handleGetView';
import { handleUpdateView as handleUpdateViewHigh } from '../../handlers/view/high/handleUpdateView';
import { handleActivateView } from '../../handlers/view/low/handleActivateView';
import { handleCheckView } from '../../handlers/view/low/handleCheckView';
import { handleCreateView as handleCreateViewLow } from '../../handlers/view/low/handleCreateView';
import { handleDeleteView } from '../../handlers/view/low/handleDeleteView';
import { handleLockView } from '../../handlers/view/low/handleLockView';
import { handleUnlockView } from '../../handlers/view/low/handleUnlockView';
import { handleUpdateView as handleUpdateViewLow } from '../../handlers/view/low/handleUpdateView';
import { handleValidateView } from '../../handlers/view/low/handleValidateView';

// Import logger

// Import tool registry

import { TOOL_DEFINITION as CreateBdef_Tool } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as GetBehaviorDefinition_Tool } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBdef_Tool } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as ActivateBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { TOOL_DEFINITION as CheckBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleCheckBehaviorDefinition';
import { TOOL_DEFINITION as CreateBehaviorDefinitionLow_Tool } from '../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as DeleteBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';
import { TOOL_DEFINITION as LockBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { TOOL_DEFINITION as UnlockBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBehaviorDefinitionLow_Tool } from '../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as ValidateBehaviorDefinition_Tool } from '../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { TOOL_DEFINITION as CreateBehaviorImplementation_Tool } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { TOOL_DEFINITION as UpdateBehaviorImplementation_Tool } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { TOOL_DEFINITION as CreateClass_Tool } from '../../handlers/class/high/handleCreateClass';
import { TOOL_DEFINITION as GetClass_Tool } from '../../handlers/class/high/handleGetClass';
// import { TOOL_DEFINITION as ActivateObject_Tool } from "../../handlers/common/low/handleActivateObject";
// import { TOOL_DEFINITION as DeleteObject_Tool } from "../../handlers/common/low/handleDeleteObject";
// import { TOOL_DEFINITION as CheckObject_Tool } from "../../handlers/common/low/handleCheckObject";
import { TOOL_DEFINITION as UpdateClassHigh_Tool } from '../../handlers/class/high/handleUpdateClass';
import { TOOL_DEFINITION as ActivateClass_Tool } from '../../handlers/class/low/handleActivateClass';
import { TOOL_DEFINITION as ActivateClassTestClasses_Tool } from '../../handlers/class/low/handleActivateClassTestClasses';
import { TOOL_DEFINITION as CheckClass_Tool } from '../../handlers/class/low/handleCheckClass';
import { TOOL_DEFINITION as CreateClassLow_Tool } from '../../handlers/class/low/handleCreateClass';
// New low-level handlers TOOL_DEFINITION imports
import { TOOL_DEFINITION as DeleteClass_Tool } from '../../handlers/class/low/handleDeleteClass';
import { TOOL_DEFINITION as GetClassUnitTestResult_Tool } from '../../handlers/class/low/handleGetClassUnitTestResult';
import { TOOL_DEFINITION as GetClassUnitTestStatus_Tool } from '../../handlers/class/low/handleGetClassUnitTestStatus';
import { TOOL_DEFINITION as LockClass_Tool } from '../../handlers/class/low/handleLockClass';
import { TOOL_DEFINITION as LockClassTestClasses_Tool } from '../../handlers/class/low/handleLockClassTestClasses';
import { TOOL_DEFINITION as RunClassUnitTests_Tool } from '../../handlers/class/low/handleRunClassUnitTests';
import { TOOL_DEFINITION as UnlockClass_Tool } from '../../handlers/class/low/handleUnlockClass';
import { TOOL_DEFINITION as UnlockClassTestClasses_Tool } from '../../handlers/class/low/handleUnlockClassTestClasses';
import { TOOL_DEFINITION as UpdateClass_Tool } from '../../handlers/class/low/handleUpdateClass';
import { TOOL_DEFINITION as UpdateClassTestClasses_Tool } from '../../handlers/class/low/handleUpdateClassTestClasses';
import { TOOL_DEFINITION as ValidateClass_Tool } from '../../handlers/class/low/handleValidateClass';
import { TOOL_DEFINITION as LockObject_Tool } from '../../handlers/common/low/handleLockObject';
import { TOOL_DEFINITION as UnlockObject_Tool } from '../../handlers/common/low/handleUnlockObject';
import { TOOL_DEFINITION as ValidateObject_Tool } from '../../handlers/common/low/handleValidateObject';
import { TOOL_DEFINITION as CreateDataElement_Tool } from '../../handlers/data_element/high/handleCreateDataElement';
import { TOOL_DEFINITION as GetDataElement_Tool } from '../../handlers/data_element/high/handleGetDataElement';
import { TOOL_DEFINITION as UpdateDataElementHigh_Tool } from '../../handlers/data_element/high/handleUpdateDataElement';
import { TOOL_DEFINITION as ActivateDataElement_Tool } from '../../handlers/data_element/low/handleActivateDataElement';
import { TOOL_DEFINITION as CheckDataElement_Tool } from '../../handlers/data_element/low/handleCheckDataElement';
import { TOOL_DEFINITION as CreateDataElementLow_Tool } from '../../handlers/data_element/low/handleCreateDataElement';
import { TOOL_DEFINITION as DeleteDataElement_Tool } from '../../handlers/data_element/low/handleDeleteDataElement';
import { TOOL_DEFINITION as LockDataElement_Tool } from '../../handlers/data_element/low/handleLockDataElement';
import { TOOL_DEFINITION as UnlockDataElement_Tool } from '../../handlers/data_element/low/handleUnlockDataElement';
import { TOOL_DEFINITION as UpdateDataElementLow_Tool } from '../../handlers/data_element/low/handleUpdateDataElement';
import { TOOL_DEFINITION as ValidateDataElement_Tool } from '../../handlers/data_element/low/handleValidateDataElement';
import { TOOL_DEFINITION as CreateDdlx_Tool } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { TOOL_DEFINITION as UpdateDdlx_Tool } from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as ActivateMetadataExtension_Tool } from '../../handlers/ddlx/low/handleActivateMetadataExtension';
import { TOOL_DEFINITION as CheckMetadataExtension_Tool } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { TOOL_DEFINITION as CreateMetadataExtensionLow_Tool } from '../../handlers/ddlx/low/handleCreateMetadataExtension';
import { TOOL_DEFINITION as DeleteMetadataExtension_Tool } from '../../handlers/ddlx/low/handleDeleteMetadataExtension';
import { TOOL_DEFINITION as LockMetadataExtension_Tool } from '../../handlers/ddlx/low/handleLockMetadataExtension';
import { TOOL_DEFINITION as UnlockMetadataExtension_Tool } from '../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { TOOL_DEFINITION as UpdateMetadataExtensionLow_Tool } from '../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as ValidateMetadataExtension_Tool } from '../../handlers/ddlx/low/handleValidateMetadataExtension';
import { TOOL_DEFINITION as CreateDomain_Tool } from '../../handlers/domain/high/handleCreateDomain';
import { TOOL_DEFINITION as GetDomain_Tool } from '../../handlers/domain/high/handleGetDomain';
import { TOOL_DEFINITION as UpdateDomainHigh_Tool } from '../../handlers/domain/high/handleUpdateDomain';
import { TOOL_DEFINITION as ActivateDomain_Tool } from '../../handlers/domain/low/handleActivateDomain';
import { TOOL_DEFINITION as CheckDomain_Tool } from '../../handlers/domain/low/handleCheckDomain';
import { TOOL_DEFINITION as CreateDomainLow_Tool } from '../../handlers/domain/low/handleCreateDomain';
import { TOOL_DEFINITION as DeleteDomain_Tool } from '../../handlers/domain/low/handleDeleteDomain';
import { TOOL_DEFINITION as LockDomain_Tool } from '../../handlers/domain/low/handleLockDomain';
import { TOOL_DEFINITION as UnlockDomain_Tool } from '../../handlers/domain/low/handleUnlockDomain';
import { TOOL_DEFINITION as UpdateDomainLow_Tool } from '../../handlers/domain/low/handleUpdateDomain';
import { TOOL_DEFINITION as ValidateDomain_Tool } from '../../handlers/domain/low/handleValidateDomain';
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from '../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from '../../handlers/enhancement/readonly/handleGetEnhancementSpot';
import { TOOL_DEFINITION as GetEnhancements_Tool } from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { TOOL_DEFINITION as CreateFunctionGroup_Tool } from '../../handlers/function/high/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModule_Tool } from '../../handlers/function/high/handleCreateFunctionModule';
import { TOOL_DEFINITION as UpdateFunctionGroup_Tool } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { TOOL_DEFINITION as UpdateFunctionModuleHigh_Tool } from '../../handlers/function/high/handleUpdateFunctionModule';
import { TOOL_DEFINITION as ActivateFunctionGroup_Tool } from '../../handlers/function/low/handleActivateFunctionGroup';
import { TOOL_DEFINITION as ActivateFunctionModule_Tool } from '../../handlers/function/low/handleActivateFunctionModule';
import { TOOL_DEFINITION as CheckFunctionGroup_Tool } from '../../handlers/function/low/handleCheckFunctionGroup';
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from '../../handlers/function/low/handleCheckFunctionModule';
import { TOOL_DEFINITION as CreateFunctionGroupLow_Tool } from '../../handlers/function/low/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModuleLow_Tool } from '../../handlers/function/low/handleCreateFunctionModule';
import { TOOL_DEFINITION as DeleteFunctionGroup_Tool } from '../../handlers/function/low/handleDeleteFunctionGroup';
import { TOOL_DEFINITION as DeleteFunctionModule_Tool } from '../../handlers/function/low/handleDeleteFunctionModule';
import { TOOL_DEFINITION as LockFunctionGroup_Tool } from '../../handlers/function/low/handleLockFunctionGroup';
import { TOOL_DEFINITION as LockFunctionModule_Tool } from '../../handlers/function/low/handleLockFunctionModule';
import { TOOL_DEFINITION as UnlockFunctionGroup_Tool } from '../../handlers/function/low/handleUnlockFunctionGroup';
import { TOOL_DEFINITION as UnlockFunctionModule_Tool } from '../../handlers/function/low/handleUnlockFunctionModule';
import { TOOL_DEFINITION as UpdateFunctionModule_Tool } from '../../handlers/function/low/handleUpdateFunctionModule';
import { TOOL_DEFINITION as ValidateFunctionGroup_Tool } from '../../handlers/function/low/handleValidateFunctionGroup';
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from '../../handlers/function/low/handleValidateFunctionModule';
import { TOOL_DEFINITION as GetFunction_Tool } from '../../handlers/function/readonly/handleGetFunction';
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from '../../handlers/function_group/high/handleGetFunctionGroup';
import { TOOL_DEFINITION as GetInclude_Tool } from '../../handlers/include/readonly/handleGetInclude';
import { TOOL_DEFINITION as GetIncludesList_Tool } from '../../handlers/include/readonly/handleGetIncludesList';
import { TOOL_DEFINITION as CreateInterface_Tool } from '../../handlers/interface/high/handleCreateInterface';
import { TOOL_DEFINITION as GetInterface_Tool } from '../../handlers/interface/high/handleGetInterface';
import { TOOL_DEFINITION as UpdateInterfaceHigh_Tool } from '../../handlers/interface/high/handleUpdateInterface';
import { TOOL_DEFINITION as ActivateInterface_Tool } from '../../handlers/interface/low/handleActivateInterface';
import { TOOL_DEFINITION as CheckInterface_Tool } from '../../handlers/interface/low/handleCheckInterface';
import { TOOL_DEFINITION as CreateInterfaceLow_Tool } from '../../handlers/interface/low/handleCreateInterface';
import { TOOL_DEFINITION as DeleteInterface_Tool } from '../../handlers/interface/low/handleDeleteInterface';
import { TOOL_DEFINITION as LockInterface_Tool } from '../../handlers/interface/low/handleLockInterface';
import { TOOL_DEFINITION as UnlockInterface_Tool } from '../../handlers/interface/low/handleUnlockInterface';
import { TOOL_DEFINITION as UpdateInterface_Tool } from '../../handlers/interface/low/handleUpdateInterface';
import { TOOL_DEFINITION as ValidateInterface_Tool } from '../../handlers/interface/low/handleValidateInterface';
import { TOOL_DEFINITION as CreatePackage_Tool } from '../../handlers/package/high/handleCreatePackage';
import { TOOL_DEFINITION as CheckPackage_Tool } from '../../handlers/package/low/handleCheckPackage';
import { TOOL_DEFINITION as CreatePackageLow_Tool } from '../../handlers/package/low/handleCreatePackage';
import { TOOL_DEFINITION as DeletePackage_Tool } from '../../handlers/package/low/handleDeletePackage';
import { TOOL_DEFINITION as LockPackage_Tool } from '../../handlers/package/low/handleLockPackage';
import { TOOL_DEFINITION as UnlockPackage_Tool } from '../../handlers/package/low/handleUnlockPackage';
import { TOOL_DEFINITION as UpdatePackage_Tool } from '../../handlers/package/low/handleUpdatePackage';
import { TOOL_DEFINITION as ValidatePackage_Tool } from '../../handlers/package/low/handleValidatePackage';
import { TOOL_DEFINITION as GetPackage_Tool } from '../../handlers/package/readonly/handleGetPackage';
import { TOOL_DEFINITION as CreateProgram_Tool } from '../../handlers/program/high/handleCreateProgram';
// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetProgram_Tool } from '../../handlers/program/high/handleGetProgram';
import { TOOL_DEFINITION as UpdateProgramHigh_Tool } from '../../handlers/program/high/handleUpdateProgram';
import { TOOL_DEFINITION as ActivateProgram_Tool } from '../../handlers/program/low/handleActivateProgram';
import { TOOL_DEFINITION as CheckProgram_Tool } from '../../handlers/program/low/handleCheckProgram';
import { TOOL_DEFINITION as CreateProgramLow_Tool } from '../../handlers/program/low/handleCreateProgram';
import { TOOL_DEFINITION as DeleteProgram_Tool } from '../../handlers/program/low/handleDeleteProgram';
import { TOOL_DEFINITION as LockProgram_Tool } from '../../handlers/program/low/handleLockProgram';
import { TOOL_DEFINITION as UnlockProgram_Tool } from '../../handlers/program/low/handleUnlockProgram';
import { TOOL_DEFINITION as UpdateProgram_Tool } from '../../handlers/program/low/handleUpdateProgram';
import { TOOL_DEFINITION as ValidateProgram_Tool } from '../../handlers/program/low/handleValidateProgram';
import { TOOL_DEFINITION as GetProgFullCode_Tool } from '../../handlers/program/readonly/handleGetProgFullCode';
import { TOOL_DEFINITION as GetObjectsByType_Tool } from '../../handlers/search/readonly/handleGetObjectsByType';
import { TOOL_DEFINITION as GetObjectsList_Tool } from '../../handlers/search/readonly/handleGetObjectsList';
import { TOOL_DEFINITION as SearchObject_Tool } from '../../handlers/search/readonly/handleSearchObject';
import { TOOL_DEFINITION as CreateServiceDefinition_Tool } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { TOOL_DEFINITION as GetServiceDefinition_Tool } from '../../handlers/service_definition/high/handleGetServiceDefinition';
import { TOOL_DEFINITION as UpdateServiceDefinition_Tool } from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { TOOL_DEFINITION as CreateStructure_Tool } from '../../handlers/structure/high/handleCreateStructure';
import { TOOL_DEFINITION as GetStructure_Tool } from '../../handlers/structure/high/handleGetStructure';
import { TOOL_DEFINITION as UpdateStructureHigh_Tool } from '../../handlers/structure/high/handleUpdateStructure';
import { TOOL_DEFINITION as ActivateStructure_Tool } from '../../handlers/structure/low/handleActivateStructure';
import { TOOL_DEFINITION as CheckStructure_Tool } from '../../handlers/structure/low/handleCheckStructure';
import { TOOL_DEFINITION as CreateStructureLow_Tool } from '../../handlers/structure/low/handleCreateStructure';
import { TOOL_DEFINITION as DeleteStructure_Tool } from '../../handlers/structure/low/handleDeleteStructure';
import { TOOL_DEFINITION as LockStructure_Tool } from '../../handlers/structure/low/handleLockStructure';
import { TOOL_DEFINITION as UnlockStructure_Tool } from '../../handlers/structure/low/handleUnlockStructure';
import { TOOL_DEFINITION as UpdateStructureLow_Tool } from '../../handlers/structure/low/handleUpdateStructure';
import { TOOL_DEFINITION as ValidateStructure_Tool } from '../../handlers/structure/low/handleValidateStructure';
import { TOOL_DEFINITION as DescribeByList_Tool } from '../../handlers/system/readonly/handleDescribeByList';
import { TOOL_DEFINITION as GetAbapAST_Tool } from '../../handlers/system/readonly/handleGetAbapAST';
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from '../../handlers/system/readonly/handleGetAbapSemanticAnalysis';
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from '../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from '../../handlers/system/readonly/handleGetInactiveObjects';
import { TOOL_DEFINITION as GetObjectInfo_Tool } from '../../handlers/system/readonly/handleGetObjectInfo';
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from '../../handlers/system/readonly/handleGetObjectNodeFromCache';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../../handlers/system/readonly/handleGetObjectStructure';
import { TOOL_DEFINITION as GetSession_Tool } from '../../handlers/system/readonly/handleGetSession';
import { TOOL_DEFINITION as GetSqlQuery_Tool } from '../../handlers/system/readonly/handleGetSqlQuery';
import { TOOL_DEFINITION as GetTransaction_Tool } from '../../handlers/system/readonly/handleGetTransaction';
import { TOOL_DEFINITION as GetTypeInfo_Tool } from '../../handlers/system/readonly/handleGetTypeInfo';
import { TOOL_DEFINITION as GetWhereUsed_Tool } from '../../handlers/system/readonly/handleGetWhereUsed';
import { TOOL_DEFINITION as CreateTable_Tool } from '../../handlers/table/high/handleCreateTable';
import { TOOL_DEFINITION as GetTable_Tool } from '../../handlers/table/high/handleGetTable';
import { TOOL_DEFINITION as UpdateTableHigh_Tool } from '../../handlers/table/high/handleUpdateTable';
import { TOOL_DEFINITION as ActivateTable_Tool } from '../../handlers/table/low/handleActivateTable';
import { TOOL_DEFINITION as CheckTable_Tool } from '../../handlers/table/low/handleCheckTable';
import { TOOL_DEFINITION as CreateTableLow_Tool } from '../../handlers/table/low/handleCreateTable';
import { TOOL_DEFINITION as DeleteTable_Tool } from '../../handlers/table/low/handleDeleteTable';
import { TOOL_DEFINITION as LockTable_Tool } from '../../handlers/table/low/handleLockTable';
import { TOOL_DEFINITION as UnlockTable_Tool } from '../../handlers/table/low/handleUnlockTable';
import { TOOL_DEFINITION as UpdateTableLow_Tool } from '../../handlers/table/low/handleUpdateTable';
import { TOOL_DEFINITION as ValidateTable_Tool } from '../../handlers/table/low/handleValidateTable';
import { TOOL_DEFINITION as GetTableContents_Tool } from '../../handlers/table/readonly/handleGetTableContents';
import { TOOL_DEFINITION as CreateTransport_Tool } from '../../handlers/transport/high/handleCreateTransport';
import { TOOL_DEFINITION as CreateTransportLow_Tool } from '../../handlers/transport/low/handleCreateTransport';
import { TOOL_DEFINITION as GetTransport_Tool } from '../../handlers/transport/readonly/handleGetTransport';
import { TOOL_DEFINITION as CreateCdsUnitTest_Tool } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { TOOL_DEFINITION as CreateUnitTest_Tool } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { TOOL_DEFINITION as DeleteCdsUnitTest_Tool } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { TOOL_DEFINITION as DeleteUnitTest_Tool } from '../../handlers/unit_test/high/handleDeleteUnitTest';
import { TOOL_DEFINITION as GetCdsUnitTest_Tool } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { TOOL_DEFINITION as GetCdsUnitTestResult_Tool } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { TOOL_DEFINITION as GetCdsUnitTestStatus_Tool } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import { TOOL_DEFINITION as GetUnitTest_Tool } from '../../handlers/unit_test/high/handleGetUnitTest';
import { TOOL_DEFINITION as GetUnitTestResult_Tool } from '../../handlers/unit_test/high/handleGetUnitTestResult';
import { TOOL_DEFINITION as GetUnitTestStatus_Tool } from '../../handlers/unit_test/high/handleGetUnitTestStatus';
import { TOOL_DEFINITION as RunUnitTest_Tool } from '../../handlers/unit_test/high/handleRunUnitTest';
import { TOOL_DEFINITION as UpdateCdsUnitTest_Tool } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { TOOL_DEFINITION as UpdateUnitTest_Tool } from '../../handlers/unit_test/high/handleUpdateUnitTest';
import { TOOL_DEFINITION as CreateView_Tool } from '../../handlers/view/high/handleCreateView';
import { TOOL_DEFINITION as GetView_Tool } from '../../handlers/view/high/handleGetView';
import { TOOL_DEFINITION as UpdateViewHigh_Tool } from '../../handlers/view/high/handleUpdateView';
import { TOOL_DEFINITION as ActivateView_Tool } from '../../handlers/view/low/handleActivateView';
import { TOOL_DEFINITION as CheckView_Tool } from '../../handlers/view/low/handleCheckView';
import { TOOL_DEFINITION as CreateViewLow_Tool } from '../../handlers/view/low/handleCreateView';
import { TOOL_DEFINITION as DeleteView_Tool } from '../../handlers/view/low/handleDeleteView';
import { TOOL_DEFINITION as LockView_Tool } from '../../handlers/view/low/handleLockView';
import { TOOL_DEFINITION as UnlockView_Tool } from '../../handlers/view/low/handleUnlockView';
import { TOOL_DEFINITION as UpdateView_Tool } from '../../handlers/view/low/handleUpdateView';
import { TOOL_DEFINITION as ValidateView_Tool } from '../../handlers/view/low/handleValidateView';

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class McpHandlers {
  /**
   * Converts JSON Schema to Zod schema object (not z.object(), but object with Zod fields)
   * SDK expects inputSchema to be an object with Zod schemas as values, not z.object()
   */
  private jsonSchemaToZod(jsonSchema: any): any {
    // If already a Zod schema object (object with Zod fields), return as-is
    if (
      jsonSchema &&
      typeof jsonSchema === 'object' &&
      !jsonSchema.type &&
      !jsonSchema.properties
    ) {
      // Check if it looks like a Zod schema object (has Zod types as values)
      const firstValue = Object.values(jsonSchema)[0];
      if (
        firstValue &&
        ((firstValue as any).def ||
          (firstValue as any)._def ||
          typeof (firstValue as any).parse === 'function')
      ) {
        return jsonSchema;
      }
    }

    // If it's a JSON Schema object
    if (
      jsonSchema &&
      typeof jsonSchema === 'object' &&
      jsonSchema.type === 'object' &&
      jsonSchema.properties
    ) {
      const zodShape: Record<string, z.ZodTypeAny> = {};
      const required = jsonSchema.required || [];

      for (const [key, prop] of Object.entries(jsonSchema.properties)) {
        const propSchema = prop as any;
        let zodType: z.ZodTypeAny;

        if (propSchema.type === 'string') {
          if (
            propSchema.enum &&
            Array.isArray(propSchema.enum) &&
            propSchema.enum.length > 0
          ) {
            // Use z.enum() for enum values (requires at least 1 element, but z.enum needs 2+)
            if (propSchema.enum.length === 1) {
              zodType = z.literal(propSchema.enum[0]);
            } else {
              zodType = z.enum(propSchema.enum as [string, ...string[]]);
            }
          } else {
            zodType = z.string();
          }
        } else if (
          propSchema.type === 'number' ||
          propSchema.type === 'integer'
        ) {
          zodType = z.number();
        } else if (propSchema.type === 'boolean') {
          zodType = z.boolean();
        } else if (propSchema.type === 'array') {
          const items = propSchema.items;
          if (items?.type === 'string') {
            zodType = z.array(z.string());
          } else if (items?.type === 'number' || items?.type === 'integer') {
            zodType = z.array(z.number());
          } else if (items?.type === 'boolean') {
            zodType = z.array(z.boolean());
          } else if (items?.type === 'object' && items.properties) {
            // For nested objects in arrays, create object schema
            const nestedShape: Record<string, z.ZodTypeAny> = {};
            const nestedRequired = items.required || [];
            for (const [nestedKey, nestedProp] of Object.entries(
              items.properties,
            )) {
              const nestedPropSchema = nestedProp as any;
              let nestedZodType: z.ZodTypeAny;
              if (nestedPropSchema.type === 'string') {
                if (
                  nestedPropSchema.enum &&
                  Array.isArray(nestedPropSchema.enum) &&
                  nestedPropSchema.enum.length > 0
                ) {
                  if (nestedPropSchema.enum.length === 1) {
                    nestedZodType = z.literal(nestedPropSchema.enum[0]);
                  } else {
                    nestedZodType = z.enum(
                      nestedPropSchema.enum as [string, ...string[]],
                    );
                  }
                } else {
                  nestedZodType = z.string();
                }
              } else if (
                nestedPropSchema.type === 'number' ||
                nestedPropSchema.type === 'integer'
              ) {
                nestedZodType = z.number();
              } else if (nestedPropSchema.type === 'boolean') {
                nestedZodType = z.boolean();
              } else {
                nestedZodType = z.any();
              }
              if (nestedPropSchema.default !== undefined) {
                nestedZodType = nestedZodType.default(nestedPropSchema.default);
              }
              if (!nestedRequired.includes(nestedKey)) {
                nestedZodType = nestedZodType.optional();
              }
              if (nestedPropSchema.description) {
                nestedZodType = nestedZodType.describe(
                  nestedPropSchema.description,
                );
              }
              nestedShape[nestedKey] = nestedZodType;
            }
            zodType = z.array(z.object(nestedShape));
          } else {
            zodType = z.array(z.any());
          }
        } else if (propSchema.type === 'object' && propSchema.properties) {
          // For nested objects, create object schema
          const nestedShape: Record<string, z.ZodTypeAny> = {};
          const nestedRequired = propSchema.required || [];
          for (const [nestedKey, nestedProp] of Object.entries(
            propSchema.properties,
          )) {
            const nestedPropSchema = nestedProp as any;
            let nestedZodType: z.ZodTypeAny;
            if (nestedPropSchema.type === 'string') {
              if (
                nestedPropSchema.enum &&
                Array.isArray(nestedPropSchema.enum)
              ) {
                nestedZodType = z.enum(
                  nestedPropSchema.enum as [string, ...string[]],
                );
              } else {
                nestedZodType = z.string();
              }
            } else if (
              nestedPropSchema.type === 'number' ||
              nestedPropSchema.type === 'integer'
            ) {
              nestedZodType = z.number();
            } else if (nestedPropSchema.type === 'boolean') {
              nestedZodType = z.boolean();
            } else {
              nestedZodType = z.any();
            }
            if (nestedPropSchema.default !== undefined) {
              nestedZodType = nestedZodType.default(nestedPropSchema.default);
            }
            if (!nestedRequired.includes(nestedKey)) {
              nestedZodType = nestedZodType.optional();
            }
            if (nestedPropSchema.description) {
              nestedZodType = nestedZodType.describe(
                nestedPropSchema.description,
              );
            }
            nestedShape[nestedKey] = nestedZodType;
          }
          zodType = z.object(nestedShape);
        } else {
          zodType = z.any();
        }

        // Add default value if present (before optional)
        if (propSchema.default !== undefined) {
          zodType = zodType.default(propSchema.default);
        }

        // Make optional if not in required array (must be after default, before describe)
        if (!required.includes(key)) {
          zodType = zodType.optional();
        }

        // Add description if present (after optional)
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description);
        }

        zodShape[key] = zodType;
      }

      // Return object with Zod fields, not z.object()
      return zodShape;
    }

    // Fallback: if it's already a Zod schema object, return as-is
    if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type) {
      return jsonSchema;
    }

    // Fallback: return empty object for unknown schemas
    return {};
  }

  /**
   * Helper function to register a tool on McpServer
   * Wraps handler to convert our response format to MCP format
   */
  private registerToolOnServer(
    server: McpServer,
    toolName: string,
    description: string,
    inputSchema: any,
    handler: (args: any) => Promise<any>,
  ) {
    // Convert JSON Schema to Zod if needed, otherwise pass as-is (like in the example)
    const zodSchema =
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.type === 'object' &&
      inputSchema.properties
        ? this.jsonSchemaToZod(inputSchema)
        : inputSchema;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodSchema,
      },
      async (args: any) => {
        const result = await handler(args);

        // If error, throw it
        if (result.isError) {
          const errorText =
            result.content
              ?.map((item: any) => {
                if (item?.type === 'json' && item.json !== undefined) {
                  return JSON.stringify(item.json);
                }
                return item?.text || String(item);
              })
              .join('\n') || 'Unknown error';
          throw new McpError(ErrorCode.InternalError, errorText);
        }

        // Convert content to MCP format - JSON items become text
        const content = (result.content || []).map((item: any) => {
          if (item?.type === 'json' && item.json !== undefined) {
            return {
              type: 'text' as const,
              text: JSON.stringify(item.json),
            };
          }
          return {
            type: 'text' as const,
            text: item?.text || String(item || ''),
          };
        });

        return { content };
      },
    );
  }

  /**
   * Registers all tools on a McpServer instance
   * Used for both main server and per-session servers
   */
  public RegisterAllToolsOnServer(
    server: McpServer,
    context: HandlerContext,
    exposition: string[] = ['readonly', 'high'],
  ) {
    const includeReadOnly = exposition.includes('readonly');
    const includeHigh = exposition.includes('high');
    const includeLow = exposition.includes('low');

    // === READONLY & SYSTEM HANDLERS (included when readonly is enabled) ===
    if (includeReadOnly) {
      // Search handler
      this.registerToolOnServer(
        server,
        SearchObject_Tool.name,
        SearchObject_Tool.description,
        SearchObject_Tool.inputSchema as any,
        (args: any) => {
          return handleSearchObject(context, args);
        },
      );

      // Readonly handlers
      this.registerToolOnServer(
        server,
        GetProgram_Tool.name,
        GetProgram_Tool.description,
        GetProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleGetProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetClass_Tool.name,
        GetClass_Tool.description,
        GetClass_Tool.inputSchema as any,
        (args: any) => {
          return handleGetClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetFunction_Tool.name,
        GetFunction_Tool.description,
        GetFunction_Tool.inputSchema as any,
        (args: any) => {
          return handleGetFunction(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetFunctionGroup_Tool.name,
        GetFunctionGroup_Tool.description,
        GetFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleGetFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetTable_Tool.name,
        GetTable_Tool.description,
        GetTable_Tool.inputSchema as any,
        (args: any) => {
          return handleGetTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetStructure_Tool.name,
        GetStructure_Tool.description,
        GetStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleGetStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetTableContents_Tool.name,
        GetTableContents_Tool.description,
        GetTableContents_Tool.inputSchema as any,
        (args: any) => {
          return handleGetTableContents(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetPackage_Tool.name,
        GetPackage_Tool.description,
        GetPackage_Tool.inputSchema as any,
        (args: any) => {
          return handleGetPackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockPackage_Tool.name,
        UnlockPackage_Tool.description,
        UnlockPackage_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockPackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetInclude_Tool.name,
        GetInclude_Tool.description,
        GetInclude_Tool.inputSchema as any,
        (args: any) => {
          return handleGetInclude(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetIncludesList_Tool.name,
        GetIncludesList_Tool.description,
        GetIncludesList_Tool.inputSchema as any,
        (args: any) => {
          return handleGetIncludesList(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetTypeInfo_Tool.name,
        GetTypeInfo_Tool.description,
        GetTypeInfo_Tool.inputSchema as any,
        (args: any) => {
          return handleGetTypeInfo(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetInterface_Tool.name,
        GetInterface_Tool.description,
        GetInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleGetInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetTransaction_Tool.name,
        GetTransaction_Tool.description,
        GetTransaction_Tool.inputSchema as any,
        (args: any) => {
          return handleGetTransaction(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetEnhancements_Tool.name,
        GetEnhancements_Tool.description,
        GetEnhancements_Tool.inputSchema as any,
        (args: any) => {
          return handleGetEnhancements(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetEnhancementSpot_Tool.name,
        GetEnhancementSpot_Tool.description,
        GetEnhancementSpot_Tool.inputSchema as any,
        (args: any) => {
          return handleGetEnhancementSpot(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetEnhancementImpl_Tool.name,
        GetEnhancementImpl_Tool.description,
        GetEnhancementImpl_Tool.inputSchema as any,
        (args: any) => {
          return handleGetEnhancementImpl(context, args);
        },
      );
      // Keep GetBdef name for v1 compatibility, but use high-level handler internally
      this.registerToolOnServer(
        server,
        'GetBdef',
        GetBehaviorDefinition_Tool.description,
        {
          type: 'object',
          properties: {
            bdef_name: {
              type: 'string',
              description: 'Name of the BDEF (Behavior Definition)',
            },
          },
          required: ['bdef_name'],
        } as any,
        (args: any) => {
          // Adapter: convert bdef_name to behavior_definition_name for high-level handler
          return handleGetBehaviorDefinition(context, {
            behavior_definition_name: args.bdef_name,
            version: 'active', // Default to active version
          });
        },
      );
      this.registerToolOnServer(
        server,
        GetSqlQuery_Tool.name,
        GetSqlQuery_Tool.description,
        GetSqlQuery_Tool.inputSchema as any,
        (args: any) => {
          return handleGetSqlQuery(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetWhereUsed_Tool.name,
        GetWhereUsed_Tool.description,
        GetWhereUsed_Tool.inputSchema as any,
        (args: any) => {
          return handleGetWhereUsed(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetObjectInfo_Tool.name,
        GetObjectInfo_Tool.description,
        GetObjectInfo_Tool.inputSchema as any,
        async (args: any) => {
          if (!args || typeof args !== 'object') {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Missing or invalid arguments for GetObjectInfo',
            );
          }
          return await handleGetObjectInfo(
            context,
            args as { parent_type: string; parent_name: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        GetAbapAST_Tool.name,
        GetAbapAST_Tool.description,
        GetAbapAST_Tool.inputSchema as any,
        (args: any) => {
          return handleGetAbapAST(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetAbapSemanticAnalysis_Tool.name,
        GetAbapSemanticAnalysis_Tool.description,
        GetAbapSemanticAnalysis_Tool.inputSchema as any,
        (args: any) => {
          return handleGetAbapSemanticAnalysis(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetAbapSystemSymbols_Tool.name,
        GetAbapSystemSymbols_Tool.description,
        GetAbapSystemSymbols_Tool.inputSchema as any,
        (args: any) => {
          return handleGetAbapSystemSymbols(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetDomain_Tool.name,
        GetDomain_Tool.description,
        GetDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleGetDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetDataElement_Tool.name,
        GetDataElement_Tool.description,
        GetDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleGetDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetTransport_Tool.name,
        GetTransport_Tool.description,
        GetTransport_Tool.inputSchema as any,
        (args: any) => {
          return handleGetTransport(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetView_Tool.name,
        GetView_Tool.description,
        GetView_Tool.inputSchema as any,
        (args: any) => {
          return handleGetView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetServiceDefinition_Tool.name,
        GetServiceDefinition_Tool.description,
        GetServiceDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleGetServiceDefinition(context, args);
        },
      );
      // this.registerToolOnServer(server, ActivateObject_Tool.name, ActivateObject_Tool.description, ActivateObject_Tool.inputSchema as any, (args: any) => { return handleActivateObject(context, args) });
      // this.registerToolOnServer(server, DeleteObject_Tool.name, DeleteObject_Tool.description, DeleteObject_Tool.inputSchema as any, (args: any) => { return handleDeleteObject(context, args) });
      // this.registerToolOnServer(server, CheckObject_Tool.name, CheckObject_Tool.description, CheckObject_Tool.inputSchema as any, (args: any) => { return handleCheckObject(context, args) });
      this.registerToolOnServer(
        server,
        GetSession_Tool.name,
        GetSession_Tool.description,
        GetSession_Tool.inputSchema as any,
        (args: any) => {
          return handleGetSession(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateObject_Tool.name,
        ValidateObject_Tool.description,
        ValidateObject_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateObject(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockObject_Tool.name,
        LockObject_Tool.description,
        LockObject_Tool.inputSchema as any,
        (args: any) => {
          return handleLockObject(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockObject_Tool.name,
        UnlockObject_Tool.description,
        UnlockObject_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockObject(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateClass_Tool.name,
        ValidateClass_Tool.description,
        ValidateClass_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckClass_Tool.name,
        CheckClass_Tool.description,
        CheckClass_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateTable_Tool.name,
        ValidateTable_Tool.description,
        ValidateTable_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckTable_Tool.name,
        CheckTable_Tool.description,
        CheckTable_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateFunctionModule_Tool.name,
        ValidateFunctionModule_Tool.description,
        ValidateFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckFunctionModule_Tool.name,
        CheckFunctionModule_Tool.description,
        CheckFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetInactiveObjects_Tool.name,
        GetInactiveObjects_Tool.description,
        GetInactiveObjects_Tool.inputSchema as any,
        (args: any) => {
          return handleGetInactiveObjects(context, args);
        },
      );

      // READONLY continues with Check/Validate/Lock/Unlock handlers below...
      this.registerToolOnServer(
        server,
        LockClass_Tool.name,
        LockClass_Tool.description,
        LockClass_Tool.inputSchema as any,
        (args: any) => {
          return handleLockClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockClass_Tool.name,
        UnlockClass_Tool.description,
        UnlockClass_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockClassTestClasses_Tool.name,
        LockClassTestClasses_Tool.description,
        LockClassTestClasses_Tool.inputSchema as any,
        (args: any) => {
          return handleLockClassTestClasses(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockClassTestClasses_Tool.name,
        UnlockClassTestClasses_Tool.description,
        UnlockClassTestClasses_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockClassTestClasses(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        RunClassUnitTests_Tool.name,
        RunClassUnitTests_Tool.description,
        RunClassUnitTests_Tool.inputSchema as any,
        (args: any) => {
          return handleRunClassUnitTests(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetClassUnitTestStatus_Tool.name,
        GetClassUnitTestStatus_Tool.description,
        GetClassUnitTestStatus_Tool.inputSchema as any,
        (args: any) => {
          return handleGetClassUnitTestStatus(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetClassUnitTestResult_Tool.name,
        GetClassUnitTestResult_Tool.description,
        GetClassUnitTestResult_Tool.inputSchema as any,
        (args: any) => {
          return handleGetClassUnitTestResult(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckProgram_Tool.name,
        CheckProgram_Tool.description,
        CheckProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockProgram_Tool.name,
        LockProgram_Tool.description,
        LockProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleLockProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockProgram_Tool.name,
        UnlockProgram_Tool.description,
        UnlockProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateProgram_Tool.name,
        ValidateProgram_Tool.description,
        ValidateProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckInterface_Tool.name,
        CheckInterface_Tool.description,
        CheckInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockInterface_Tool.name,
        LockInterface_Tool.description,
        LockInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleLockInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockInterface_Tool.name,
        UnlockInterface_Tool.description,
        UnlockInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateInterface_Tool.name,
        ValidateInterface_Tool.description,
        ValidateInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckFunctionGroup_Tool.name,
        CheckFunctionGroup_Tool.description,
        CheckFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockFunctionGroup_Tool.name,
        LockFunctionGroup_Tool.description,
        LockFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleLockFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockFunctionModule_Tool.name,
        LockFunctionModule_Tool.description,
        LockFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleLockFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockFunctionGroup_Tool.name,
        UnlockFunctionGroup_Tool.description,
        UnlockFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockFunctionModule_Tool.name,
        UnlockFunctionModule_Tool.description,
        UnlockFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateFunctionGroup_Tool.name,
        ValidateFunctionGroup_Tool.description,
        ValidateFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckDataElement_Tool.name,
        CheckDataElement_Tool.description,
        CheckDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockDataElement_Tool.name,
        LockDataElement_Tool.description,
        LockDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleLockDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockDataElement_Tool.name,
        UnlockDataElement_Tool.description,
        UnlockDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateDataElement_Tool.name,
        ValidateDataElement_Tool.description,
        ValidateDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckDomain_Tool.name,
        CheckDomain_Tool.description,
        CheckDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockDomain_Tool.name,
        LockDomain_Tool.description,
        LockDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleLockDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockDomain_Tool.name,
        UnlockDomain_Tool.description,
        UnlockDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateDomain_Tool.name,
        ValidateDomain_Tool.description,
        ValidateDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckStructure_Tool.name,
        CheckStructure_Tool.description,
        CheckStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockStructure_Tool.name,
        LockStructure_Tool.description,
        LockStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleLockStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockStructure_Tool.name,
        UnlockStructure_Tool.description,
        UnlockStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateStructure_Tool.name,
        ValidateStructure_Tool.description,
        ValidateStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockTable_Tool.name,
        LockTable_Tool.description,
        LockTable_Tool.inputSchema as any,
        (args: any) => {
          return handleLockTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockTable_Tool.name,
        UnlockTable_Tool.description,
        UnlockTable_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckView_Tool.name,
        CheckView_Tool.description,
        CheckView_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockView_Tool.name,
        LockView_Tool.description,
        LockView_Tool.inputSchema as any,
        (args: any) => {
          return handleLockView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockView_Tool.name,
        UnlockView_Tool.description,
        UnlockView_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateView_Tool.name,
        ValidateView_Tool.description,
        ValidateView_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckPackage_Tool.name,
        CheckPackage_Tool.description,
        CheckPackage_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckPackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockPackage_Tool.name,
        LockPackage_Tool.description,
        LockPackage_Tool.inputSchema as any,
        (args: any) => {
          return handleLockPackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidatePackage_Tool.name,
        ValidatePackage_Tool.description,
        ValidatePackage_Tool.inputSchema as any,
        (args: any) => {
          return handleValidatePackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckBehaviorDefinition_Tool.name,
        CheckBehaviorDefinition_Tool.description,
        CheckBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockBehaviorDefinition_Tool.name,
        LockBehaviorDefinition_Tool.description,
        LockBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleLockBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockBehaviorDefinition_Tool.name,
        UnlockBehaviorDefinition_Tool.description,
        UnlockBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateBehaviorDefinition_Tool.name,
        ValidateBehaviorDefinition_Tool.description,
        ValidateBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CheckMetadataExtension_Tool.name,
        CheckMetadataExtension_Tool.description,
        CheckMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleCheckMetadataExtension(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        LockMetadataExtension_Tool.name,
        LockMetadataExtension_Tool.description,
        LockMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleLockMetadataExtension(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UnlockMetadataExtension_Tool.name,
        UnlockMetadataExtension_Tool.description,
        UnlockMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleUnlockMetadataExtension(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ValidateMetadataExtension_Tool.name,
        ValidateMetadataExtension_Tool.description,
        ValidateMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleValidateMetadataExtension(context, args);
        },
      );
      // this.registerToolOnServer(server, GetAbapAST_Tool.name, GetAbapAST_Tool.description, GetAbapAST_Tool.inputSchema as any, (args: any) => { return handleGetAbapAST(context, args); });
      this.registerToolOnServer(
        server,
        GetObjectStructure_Tool.name,
        GetObjectStructure_Tool.description,
        GetObjectStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleGetObjectStructure(
            context,
            args as { object_name: string; object_type: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        GetObjectsList_Tool.name,
        GetObjectsList_Tool.description,
        GetObjectsList_Tool.inputSchema as any,
        (args: any) => {
          return handleGetObjectsList(
            context,
            args as { package_name: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        GetObjectsByType_Tool.name,
        GetObjectsByType_Tool.description,
        GetObjectsByType_Tool.inputSchema as any,
        (args: any) => {
          return handleGetObjectsByType(
            context,
            args as { object_type: string; package_name: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        GetProgFullCode_Tool.name,
        GetProgFullCode_Tool.description,
        GetProgFullCode_Tool.inputSchema as any,
        (args: any) => {
          return handleGetProgFullCode(
            context,
            args as { name: string; type: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        GetObjectNodeFromCache_Tool.name,
        GetObjectNodeFromCache_Tool.description,
        GetObjectNodeFromCache_Tool.inputSchema as any,
        (args: any) => {
          return handleGetObjectNodeFromCache(
            context,
            args as { object_name: string; object_type: string },
          );
        },
      );
      this.registerToolOnServer(
        server,
        DescribeByList_Tool.name,
        DescribeByList_Tool.description,
        DescribeByList_Tool.inputSchema as any,
        (args: any) => {
          return handleDescribeByList(context, args as { objects: string[] });
        },
      );
    } // end if includeReadOnly

    // === HIGH LEVEL HANDLERS ===
    if (includeHigh) {
      this.registerToolOnServer(
        server,
        CreatePackage_Tool.name,
        CreatePackage_Tool.description,
        CreatePackage_Tool.inputSchema as any,
        (args: any) => {
          return handleCreatePackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateDomain_Tool.name,
        CreateDomain_Tool.description,
        CreateDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateDomainHigh_Tool.name,
        UpdateDomainHigh_Tool.description,
        UpdateDomainHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateDomainHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateDataElement_Tool.name,
        CreateDataElement_Tool.description,
        CreateDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateDataElementHigh_Tool.name,
        UpdateDataElementHigh_Tool.description,
        UpdateDataElementHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateDataElementHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateTransport_Tool.name,
        CreateTransport_Tool.description,
        CreateTransport_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateTransport(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateTable_Tool.name,
        CreateTable_Tool.description,
        CreateTable_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateTableHigh_Tool.name,
        UpdateTableHigh_Tool.description,
        UpdateTableHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateTableHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateStructure_Tool.name,
        CreateStructure_Tool.description,
        CreateStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateStructureHigh_Tool.name,
        UpdateStructureHigh_Tool.description,
        UpdateStructureHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateStructureHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateView_Tool.name,
        CreateView_Tool.description,
        CreateView_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateViewHigh_Tool.name,
        UpdateViewHigh_Tool.description,
        UpdateViewHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateViewHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateServiceDefinition_Tool.name,
        CreateServiceDefinition_Tool.description,
        CreateServiceDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateServiceDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateServiceDefinition_Tool.name,
        UpdateServiceDefinition_Tool.description,
        UpdateServiceDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateServiceDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateClass_Tool.name,
        CreateClass_Tool.description,
        CreateClass_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateClassHigh_Tool.name,
        UpdateClassHigh_Tool.description,
        UpdateClassHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateClassHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateUnitTest_Tool.name,
        CreateUnitTest_Tool.description,
        CreateUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        RunUnitTest_Tool.name,
        RunUnitTest_Tool.description,
        RunUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleRunUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetUnitTest_Tool.name,
        GetUnitTest_Tool.description,
        GetUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleGetUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetUnitTestStatus_Tool.name,
        GetUnitTestStatus_Tool.description,
        GetUnitTestStatus_Tool.inputSchema as any,
        (args: any) => {
          return handleGetUnitTestStatus(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetUnitTestResult_Tool.name,
        GetUnitTestResult_Tool.description,
        GetUnitTestResult_Tool.inputSchema as any,
        (args: any) => {
          return handleGetUnitTestResult(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateUnitTest_Tool.name,
        UpdateUnitTest_Tool.description,
        UpdateUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteUnitTest_Tool.name,
        DeleteUnitTest_Tool.description,
        DeleteUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateCdsUnitTest_Tool.name,
        CreateCdsUnitTest_Tool.description,
        CreateCdsUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateCdsUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetCdsUnitTest_Tool.name,
        GetCdsUnitTest_Tool.description,
        GetCdsUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleGetCdsUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetCdsUnitTestStatus_Tool.name,
        GetCdsUnitTestStatus_Tool.description,
        GetCdsUnitTestStatus_Tool.inputSchema as any,
        (args: any) => {
          return handleGetCdsUnitTestStatus(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        GetCdsUnitTestResult_Tool.name,
        GetCdsUnitTestResult_Tool.description,
        GetCdsUnitTestResult_Tool.inputSchema as any,
        (args: any) => {
          return handleGetCdsUnitTestResult(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateCdsUnitTest_Tool.name,
        UpdateCdsUnitTest_Tool.description,
        UpdateCdsUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateCdsUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteCdsUnitTest_Tool.name,
        DeleteCdsUnitTest_Tool.description,
        DeleteCdsUnitTest_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteCdsUnitTest(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateProgram_Tool.name,
        CreateProgram_Tool.description,
        CreateProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateProgramHigh_Tool.name,
        UpdateProgramHigh_Tool.description,
        UpdateProgramHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateProgramHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateInterface_Tool.name,
        CreateInterface_Tool.description,
        CreateInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateInterfaceHigh_Tool.name,
        UpdateInterfaceHigh_Tool.description,
        UpdateInterfaceHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateInterfaceHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateFunctionGroup_Tool.name,
        CreateFunctionGroup_Tool.description,
        CreateFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateFunctionGroup_Tool.name,
        UpdateFunctionGroup_Tool.description,
        UpdateFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateFunctionModule_Tool.name,
        CreateFunctionModule_Tool.description,
        CreateFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateFunctionModuleHigh_Tool.name,
        UpdateFunctionModuleHigh_Tool.description,
        UpdateFunctionModuleHigh_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateFunctionModuleHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateBdef_Tool.name,
        CreateBdef_Tool.description,
        CreateBdef_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateBdef_Tool.name,
        UpdateBdef_Tool.description,
        UpdateBdef_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateBehaviorDefinitionHigh(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateBehaviorImplementation_Tool.name,
        CreateBehaviorImplementation_Tool.description,
        CreateBehaviorImplementation_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateBehaviorImplementation(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateBehaviorImplementation_Tool.name,
        UpdateBehaviorImplementation_Tool.description,
        UpdateBehaviorImplementation_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateBehaviorImplementation(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateDdlx_Tool.name,
        CreateDdlx_Tool.description,
        CreateDdlx_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateMetadataExtension(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateDdlx_Tool.name,
        UpdateDdlx_Tool.description,
        UpdateDdlx_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateMetadataExtensionHigh(context, args);
        },
      );
    } // end if includeHigh

    // === LOW LEVEL HANDLERS ===
    if (includeLow) {
      this.registerToolOnServer(
        server,
        UpdatePackage_Tool.name,
        UpdatePackage_Tool.description,
        UpdatePackage_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdatePackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateDomainLow_Tool.name,
        UpdateDomainLow_Tool.description,
        UpdateDomainLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateDataElementLow_Tool.name,
        UpdateDataElementLow_Tool.description,
        UpdateDataElementLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateTableLow_Tool.name,
        UpdateTableLow_Tool.description,
        UpdateTableLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateTableLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateStructureLow_Tool.name,
        UpdateStructureLow_Tool.description,
        UpdateStructureLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateStructureLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateView_Tool.name,
        UpdateView_Tool.description,
        UpdateView_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateViewLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateClass_Tool.name,
        UpdateClass_Tool.description,
        UpdateClass_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateClassLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateProgram_Tool.name,
        UpdateProgram_Tool.description,
        UpdateProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateProgramLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateInterface_Tool.name,
        UpdateInterface_Tool.description,
        UpdateInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateInterfaceLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateFunctionModule_Tool.name,
        UpdateFunctionModule_Tool.description,
        UpdateFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateFunctionModuleLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateBehaviorDefinitionLow_Tool.name,
        UpdateBehaviorDefinitionLow_Tool.description,
        UpdateBehaviorDefinitionLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateBehaviorDefinitionLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateMetadataExtensionLow_Tool.name,
        UpdateMetadataExtensionLow_Tool.description,
        UpdateMetadataExtensionLow_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateMetadataExtensionLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteClass_Tool.name,
        DeleteClass_Tool.description,
        DeleteClass_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateClassLow_Tool.name,
        CreateClassLow_Tool.description,
        CreateClassLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateClassLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        UpdateClassTestClasses_Tool.name,
        UpdateClassTestClasses_Tool.description,
        UpdateClassTestClasses_Tool.inputSchema as any,
        (args: any) => {
          return handleUpdateClassTestClasses(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateClassTestClasses_Tool.name,
        ActivateClassTestClasses_Tool.description,
        ActivateClassTestClasses_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateClassTestClasses(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteProgram_Tool.name,
        DeleteProgram_Tool.description,
        DeleteProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateProgramLow_Tool.name,
        CreateProgramLow_Tool.description,
        CreateProgramLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateProgramLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteInterface_Tool.name,
        DeleteInterface_Tool.description,
        DeleteInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateInterfaceLow_Tool.name,
        CreateInterfaceLow_Tool.description,
        CreateInterfaceLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateInterfaceLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteFunctionGroup_Tool.name,
        DeleteFunctionGroup_Tool.description,
        DeleteFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteFunctionModule_Tool.name,
        DeleteFunctionModule_Tool.description,
        DeleteFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateFunctionGroupLow_Tool.name,
        CreateFunctionGroupLow_Tool.description,
        CreateFunctionGroupLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateFunctionGroupLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateFunctionModuleLow_Tool.name,
        CreateFunctionModuleLow_Tool.description,
        CreateFunctionModuleLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateFunctionModuleLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteDataElement_Tool.name,
        DeleteDataElement_Tool.description,
        DeleteDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateDataElementLow_Tool.name,
        CreateDataElementLow_Tool.description,
        CreateDataElementLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateDataElementLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteDomain_Tool.name,
        DeleteDomain_Tool.description,
        DeleteDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateDomainLow_Tool.name,
        CreateDomainLow_Tool.description,
        CreateDomainLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateDomainLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteStructure_Tool.name,
        DeleteStructure_Tool.description,
        DeleteStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateStructureLow_Tool.name,
        CreateStructureLow_Tool.description,
        CreateStructureLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateStructureLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteTable_Tool.name,
        DeleteTable_Tool.description,
        DeleteTable_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateTableLow_Tool.name,
        CreateTableLow_Tool.description,
        CreateTableLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateTableLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteView_Tool.name,
        DeleteView_Tool.description,
        DeleteView_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateViewLow_Tool.name,
        CreateViewLow_Tool.description,
        CreateViewLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateViewLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeletePackage_Tool.name,
        DeletePackage_Tool.description,
        DeletePackage_Tool.inputSchema as any,
        (args: any) => {
          return handleDeletePackage(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreatePackageLow_Tool.name,
        CreatePackageLow_Tool.description,
        CreatePackageLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreatePackageLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateTransportLow_Tool.name,
        CreateTransportLow_Tool.description,
        CreateTransportLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateTransportLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteBehaviorDefinition_Tool.name,
        DeleteBehaviorDefinition_Tool.description,
        DeleteBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateBehaviorDefinitionLow_Tool.name,
        CreateBehaviorDefinitionLow_Tool.description,
        CreateBehaviorDefinitionLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateBehaviorDefinitionLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        DeleteMetadataExtension_Tool.name,
        DeleteMetadataExtension_Tool.description,
        DeleteMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleDeleteMetadataExtension(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        CreateMetadataExtensionLow_Tool.name,
        CreateMetadataExtensionLow_Tool.description,
        CreateMetadataExtensionLow_Tool.inputSchema as any,
        (args: any) => {
          return handleCreateMetadataExtensionLow(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateProgram_Tool.name,
        ActivateProgram_Tool.description,
        ActivateProgram_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateProgram(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateClass_Tool.name,
        ActivateClass_Tool.description,
        ActivateClass_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateClass(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateInterface_Tool.name,
        ActivateInterface_Tool.description,
        ActivateInterface_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateInterface(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateFunctionModule_Tool.name,
        ActivateFunctionModule_Tool.description,
        ActivateFunctionModule_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateFunctionModule(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateFunctionGroup_Tool.name,
        ActivateFunctionGroup_Tool.description,
        ActivateFunctionGroup_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateFunctionGroup(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateDataElement_Tool.name,
        ActivateDataElement_Tool.description,
        ActivateDataElement_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateDataElement(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateDomain_Tool.name,
        ActivateDomain_Tool.description,
        ActivateDomain_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateDomain(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateStructure_Tool.name,
        ActivateStructure_Tool.description,
        ActivateStructure_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateStructure(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateTable_Tool.name,
        ActivateTable_Tool.description,
        ActivateTable_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateTable(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateView_Tool.name,
        ActivateView_Tool.description,
        ActivateView_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateView(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateBehaviorDefinition_Tool.name,
        ActivateBehaviorDefinition_Tool.description,
        ActivateBehaviorDefinition_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateBehaviorDefinition(context, args);
        },
      );
      this.registerToolOnServer(
        server,
        ActivateMetadataExtension_Tool.name,
        ActivateMetadataExtension_Tool.description,
        ActivateMetadataExtension_Tool.inputSchema as any,
        (args: any) => {
          return handleActivateMetadataExtension(context, args);
        },
      );
    } // end if includeLow
  }
}
