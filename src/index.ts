#!/usr/bin/env node
// Simple stdio mode detection (like reference implementation)
// No output suppression needed - dotenv removed, manual .env parsing used

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import path from "path";
// dotenv removed - using manual .env parsing for all modes to avoid stdout pollution
import { createServer, Server as HttpServer, IncomingHttpHeaders } from "http";
import { randomUUID } from "crypto";

// Import handler functions
// Import handler functions
import { handleGetProgram } from "./handlers/program/readonly/handleGetProgram";
import { handleGetClass } from "./handlers/class/readonly/handleGetClass";
import { handleGetFunctionGroup } from "./handlers/function/readonly/handleGetFunctionGroup";
import { handleGetFunction } from "./handlers/function/readonly/handleGetFunction";
import { handleGetTable } from "./handlers/table/readonly/handleGetTable";
import { handleGetStructure } from "./handlers/structure/readonly/handleGetStructure";
import { handleGetTableContents } from "./handlers/table/readonly/handleGetTableContents";
import { handleGetPackage } from "./handlers/package/readonly/handleGetPackage";
import { handleCreatePackage } from "./handlers/package/high/handleCreatePackage";
import { handleGetInclude } from "./handlers/include/readonly/handleGetInclude";
import { handleGetIncludesList } from "./handlers/include/readonly/handleGetIncludesList";
import { handleGetTypeInfo } from "./handlers/system/readonly/handleGetTypeInfo";
import { handleGetInterface } from "./handlers/interface/readonly/handleGetInterface";
import { handleGetTransaction } from "./handlers/system/readonly/handleGetTransaction";
import { handleSearchObject } from "./handlers/search/readonly/handleSearchObject";
import { handleGetEnhancements } from "./handlers/enhancement/readonly/handleGetEnhancements";
import { handleGetEnhancementImpl } from "./handlers/enhancement/readonly/handleGetEnhancementImpl";
import { handleGetEnhancementSpot } from "./handlers/enhancement/readonly/handleGetEnhancementSpot";
import { handleGetBdef } from "./handlers/behavior_definition/readonly/handleGetBdef";
import { handleGetSqlQuery } from "./handlers/system/readonly/handleGetSqlQuery";
import { handleGetWhereUsed } from "./handlers/system/readonly/handleGetWhereUsed";
import { handleGetObjectInfo } from "./handlers/system/readonly/handleGetObjectInfo";
import { handleGetAbapAST } from "./handlers/system/readonly/handleGetAbapAST";
import { handleGetAbapSemanticAnalysis } from "./handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { handleGetAbapSystemSymbols } from "./handlers/system/readonly/handleGetAbapSystemSymbols";
import { handleGetDomain } from "./handlers/domain/readonly/handleGetDomain";
import { handleCreateDomain } from "./handlers/domain/high/handleCreateDomain";
import { handleUpdateDomain as handleUpdateDomainHigh } from "./handlers/domain/high/handleUpdateDomain";
import { handleCreateDataElement } from "./handlers/data_element/high/handleCreateDataElement";
import { handleUpdateDataElement as handleUpdateDataElementHigh } from "./handlers/data_element/high/handleUpdateDataElement";
import { handleGetDataElement } from "./handlers/data_element/readonly/handleGetDataElement";
import { handleCreateTransport } from "./handlers/transport/high/handleCreateTransport";
import { handleGetTransport } from "./handlers/transport/readonly/handleGetTransport";
import { handleCreateTable } from "./handlers/table/high/handleCreateTable";
import { handleCreateStructure } from "./handlers/structure/high/handleCreateStructure";
import { handleCreateView } from "./handlers/view/high/handleCreateView";
import { handleGetView } from "./handlers/view/readonly/handleGetView";
import { handleGetServiceDefinition } from "./handlers/service_definition/readonly/handleGetServiceDefinition";
import { handleCreateClass } from "./handlers/class/high/handleCreateClass";
import { handleCreateProgram } from "./handlers/program/high/handleCreateProgram";
import { handleCreateInterface } from "./handlers/interface/high/handleCreateInterface";
import { handleCreateFunctionGroup } from "./handlers/function/high/handleCreateFunctionGroup";
import { handleCreateFunctionModule } from "./handlers/function/high/handleCreateFunctionModule";
import { handleActivateObject } from "./handlers/common/low/handleActivateObject";
import { handleDeleteObject } from "./handlers/common/low/handleDeleteObject";
import { handleCheckObject } from "./handlers/common/low/handleCheckObject";
import { handleUpdateClass as handleUpdateClassHigh } from "./handlers/class/high/handleUpdateClass";
import { handleUpdateProgram as handleUpdateProgramHigh } from "./handlers/program/high/handleUpdateProgram";
import { handleUpdateView as handleUpdateViewHigh } from "./handlers/view/high/handleUpdateView";
import { handleUpdateInterface as handleUpdateInterfaceHigh } from "./handlers/interface/high/handleUpdateInterface";
import { handleUpdateFunctionModule as handleUpdateFunctionModuleHigh } from "./handlers/function/high/handleUpdateFunctionModule";
import { handleUpdateStructure } from "./handlers/structure/low/handleUpdateStructure";
import { handleUpdatePackage } from "./handlers/package/low/handleUpdatePackage";
import { handleUpdateTable } from "./handlers/table/low/handleUpdateTable";
import { handleUnlockPackage } from "./handlers/package/low/handleUnlockPackage";
import { handleUpdateClass as handleUpdateClassLow } from "./handlers/class/low/handleUpdateClass";
import { handleUpdateProgram as handleUpdateProgramLow } from "./handlers/program/low/handleUpdateProgram";
import { handleUpdateInterface as handleUpdateInterfaceLow } from "./handlers/interface/low/handleUpdateInterface";
import { handleUpdateFunctionModule as handleUpdateFunctionModuleLow } from "./handlers/function/low/handleUpdateFunctionModule";
import { handleUpdateView as handleUpdateViewLow } from "./handlers/view/low/handleUpdateView";
import { handleUpdateDomain } from "./handlers/domain/low/handleUpdateDomain";
import { handleUpdateDataElement } from "./handlers/data_element/low/handleUpdateDataElement";
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionLow } from "./handlers/behavior_definition/low/handleUpdateBehaviorDefinition";
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionLow } from "./handlers/ddlx/low/handleUpdateMetadataExtension";
import { handleGetSession } from "./handlers/system/readonly/handleGetSession";
import { handleValidateObject } from "./handlers/common/low/handleValidateObject";
import { handleLockObject } from "./handlers/common/low/handleLockObject";
import { handleUnlockObject } from "./handlers/common/low/handleUnlockObject";
import { handleValidateClass } from "./handlers/class/low/handleValidateClass";
import { handleCheckClass } from "./handlers/class/low/handleCheckClass";
import { handleValidateTable } from "./handlers/table/low/handleValidateTable";
import { handleCheckTable } from "./handlers/table/low/handleCheckTable";
import { handleValidateFunctionModule } from "./handlers/function/low/handleValidateFunctionModule";
import { handleCheckFunctionModule } from "./handlers/function/low/handleCheckFunctionModule";
import { handleCreateBehaviorDefinition } from "./handlers/behavior_definition/high/handleCreateBehaviorDefinition";
import { handleUpdateBehaviorDefinition as handleUpdateBehaviorDefinitionHigh } from "./handlers/behavior_definition/high/handleUpdateBehaviorDefinition";
import { handleCreateMetadataExtension } from "./handlers/ddlx/high/handleCreateMetadataExtension";
import { handleUpdateMetadataExtension as handleUpdateMetadataExtensionHigh } from "./handlers/ddlx/high/handleUpdateMetadataExtension";
import { handleGetInactiveObjects } from "./handlers/system/readonly/handleGetInactiveObjects";
// New low-level handlers imports
import { handleDeleteClass } from "./handlers/class/low/handleDeleteClass";
import { handleLockClass } from "./handlers/class/low/handleLockClass";
import { handleUnlockClass } from "./handlers/class/low/handleUnlockClass";
import { handleCreateClass as handleCreateClassLow } from "./handlers/class/low/handleCreateClass";
import { handleLockClassTestClasses } from "./handlers/class/low/handleLockClassTestClasses";
import { handleUnlockClassTestClasses } from "./handlers/class/low/handleUnlockClassTestClasses";
import { handleUpdateClassTestClasses } from "./handlers/class/low/handleUpdateClassTestClasses";
import { handleActivateClassTestClasses } from "./handlers/class/low/handleActivateClassTestClasses";
import { handleRunClassUnitTests } from "./handlers/class/low/handleRunClassUnitTests";
import { handleGetClassUnitTestStatus } from "./handlers/class/low/handleGetClassUnitTestStatus";
import { handleGetClassUnitTestResult } from "./handlers/class/low/handleGetClassUnitTestResult";
import { handleCheckProgram } from "./handlers/program/low/handleCheckProgram";
import { handleDeleteProgram } from "./handlers/program/low/handleDeleteProgram";
import { handleLockProgram } from "./handlers/program/low/handleLockProgram";
import { handleUnlockProgram } from "./handlers/program/low/handleUnlockProgram";
import { handleValidateProgram } from "./handlers/program/low/handleValidateProgram";
import { handleCreateProgram as handleCreateProgramLow } from "./handlers/program/low/handleCreateProgram";
import { handleCheckInterface } from "./handlers/interface/low/handleCheckInterface";
import { handleDeleteInterface } from "./handlers/interface/low/handleDeleteInterface";
import { handleLockInterface } from "./handlers/interface/low/handleLockInterface";
import { handleUnlockInterface } from "./handlers/interface/low/handleUnlockInterface";
import { handleValidateInterface } from "./handlers/interface/low/handleValidateInterface";
import { handleCreateInterface as handleCreateInterfaceLow } from "./handlers/interface/low/handleCreateInterface";
import { handleCheckFunctionGroup } from "./handlers/function/low/handleCheckFunctionGroup";
import { handleDeleteFunctionGroup } from "./handlers/function/low/handleDeleteFunctionGroup";
import { handleDeleteFunctionModule } from "./handlers/function/low/handleDeleteFunctionModule";
import { handleLockFunctionGroup } from "./handlers/function/low/handleLockFunctionGroup";
import { handleLockFunctionModule } from "./handlers/function/low/handleLockFunctionModule";
import { handleUnlockFunctionGroup } from "./handlers/function/low/handleUnlockFunctionGroup";
import { handleUnlockFunctionModule } from "./handlers/function/low/handleUnlockFunctionModule";
import { handleValidateFunctionGroup } from "./handlers/function/low/handleValidateFunctionGroup";
import { handleCreateFunctionGroup as handleCreateFunctionGroupLow } from "./handlers/function/low/handleCreateFunctionGroup";
import { handleCreateFunctionModule as handleCreateFunctionModuleLow } from "./handlers/function/low/handleCreateFunctionModule";
import { handleCheckDataElement } from "./handlers/data_element/low/handleCheckDataElement";
import { handleDeleteDataElement } from "./handlers/data_element/low/handleDeleteDataElement";
import { handleLockDataElement } from "./handlers/data_element/low/handleLockDataElement";
import { handleUnlockDataElement } from "./handlers/data_element/low/handleUnlockDataElement";
import { handleValidateDataElement } from "./handlers/data_element/low/handleValidateDataElement";
import { handleCreateDataElement as handleCreateDataElementLow } from "./handlers/data_element/low/handleCreateDataElement";
import { handleCheckDomain } from "./handlers/domain/low/handleCheckDomain";
import { handleDeleteDomain } from "./handlers/domain/low/handleDeleteDomain";
import { handleLockDomain } from "./handlers/domain/low/handleLockDomain";
import { handleUnlockDomain } from "./handlers/domain/low/handleUnlockDomain";
import { handleValidateDomain } from "./handlers/domain/low/handleValidateDomain";
import { handleCreateDomain as handleCreateDomainLow } from "./handlers/domain/low/handleCreateDomain";
import { handleCheckStructure } from "./handlers/structure/low/handleCheckStructure";
import { handleDeleteStructure } from "./handlers/structure/low/handleDeleteStructure";
import { handleLockStructure } from "./handlers/structure/low/handleLockStructure";
import { handleUnlockStructure } from "./handlers/structure/low/handleUnlockStructure";
import { handleValidateStructure } from "./handlers/structure/low/handleValidateStructure";
import { handleCreateStructure as handleCreateStructureLow } from "./handlers/structure/low/handleCreateStructure";
import { handleDeleteTable } from "./handlers/table/low/handleDeleteTable";
import { handleLockTable } from "./handlers/table/low/handleLockTable";
import { handleUnlockTable } from "./handlers/table/low/handleUnlockTable";
import { handleCreateTable as handleCreateTableLow } from "./handlers/table/low/handleCreateTable";
import { handleCheckView } from "./handlers/view/low/handleCheckView";
import { handleDeleteView } from "./handlers/view/low/handleDeleteView";
import { handleLockView } from "./handlers/view/low/handleLockView";
import { handleUnlockView } from "./handlers/view/low/handleUnlockView";
import { handleValidateView } from "./handlers/view/low/handleValidateView";
import { handleCreateView as handleCreateViewLow } from "./handlers/view/low/handleCreateView";
import { handleCheckPackage } from "./handlers/package/low/handleCheckPackage";
import { handleDeletePackage } from "./handlers/package/low/handleDeletePackage";
import { handleLockPackage } from "./handlers/package/low/handleLockPackage";
import { handleValidatePackage } from "./handlers/package/low/handleValidatePackage";
import { handleCreatePackage as handleCreatePackageLow } from "./handlers/package/low/handleCreatePackage";
import { handleCreateTransport as handleCreateTransportLow } from "./handlers/transport/low/handleCreateTransport";
import { handleCheckBehaviorDefinition } from "./handlers/behavior_definition/low/handleCheckBehaviorDefinition";
import { handleDeleteBehaviorDefinition } from "./handlers/behavior_definition/low/handleDeleteBehaviorDefinition";
import { handleLockBehaviorDefinition } from "./handlers/behavior_definition/low/handleLockBehaviorDefinition";
import { handleUnlockBehaviorDefinition } from "./handlers/behavior_definition/low/handleUnlockBehaviorDefinition";
import { handleValidateBehaviorDefinition } from "./handlers/behavior_definition/low/handleValidateBehaviorDefinition";
import { handleCreateBehaviorDefinition as handleCreateBehaviorDefinitionLow } from "./handlers/behavior_definition/low/handleCreateBehaviorDefinition";
import { handleCheckMetadataExtension } from "./handlers/ddlx/low/handleCheckMetadataExtension";
import { handleDeleteMetadataExtension } from "./handlers/ddlx/low/handleDeleteMetadataExtension";
import { handleLockMetadataExtension } from "./handlers/ddlx/low/handleLockMetadataExtension";
import { handleUnlockMetadataExtension } from "./handlers/ddlx/low/handleUnlockMetadataExtension";
import { handleValidateMetadataExtension } from "./handlers/ddlx/low/handleValidateMetadataExtension";
import { handleCreateMetadataExtension as handleCreateMetadataExtensionLow } from "./handlers/ddlx/low/handleCreateMetadataExtension";
import { handleActivateProgram } from "./handlers/program/low/handleActivateProgram";
import { handleActivateClass } from "./handlers/class/low/handleActivateClass";
import { handleActivateInterface } from "./handlers/interface/low/handleActivateInterface";
import { handleActivateFunctionModule } from "./handlers/function/low/handleActivateFunctionModule";
import { handleActivateFunctionGroup } from "./handlers/function/low/handleActivateFunctionGroup";
import { handleActivateDataElement } from "./handlers/data_element/low/handleActivateDataElement";
import { handleActivateDomain } from "./handlers/domain/low/handleActivateDomain";
import { handleActivateStructure } from "./handlers/structure/low/handleActivateStructure";
import { handleActivateTable } from "./handlers/table/low/handleActivateTable";
import { handleActivateView } from "./handlers/view/low/handleActivateView";
import { handleActivateBehaviorDefinition } from "./handlers/behavior_definition/low/handleActivateBehaviorDefinition";
import { handleActivateMetadataExtension } from "./handlers/ddlx/low/handleActivateMetadataExtension";

// Import shared utility functions and types
import {
  setConfigOverride,
  sessionContext,
  removeConnectionForSession,
  setConnectionOverride,
} from "./lib/utils";
import { SapConfig, AbapConnection } from "@mcp-abap-adt/connection";

// Import logger
import { logger } from "./lib/logger";

// Import tool registry

// Import TOOL_DEFINITION from handlers
import { TOOL_DEFINITION as GetProgram_Tool } from "./handlers/program/readonly/handleGetProgram";
import { TOOL_DEFINITION as GetClass_Tool } from "./handlers/class/readonly/handleGetClass";
import { TOOL_DEFINITION as GetFunction_Tool } from "./handlers/function/readonly/handleGetFunction";
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from "./handlers/function/readonly/handleGetFunctionGroup";
import { TOOL_DEFINITION as GetTable_Tool } from "./handlers/table/readonly/handleGetTable";
import { TOOL_DEFINITION as GetStructure_Tool } from "./handlers/structure/readonly/handleGetStructure";
import { TOOL_DEFINITION as GetTableContents_Tool } from "./handlers/table/readonly/handleGetTableContents";
import { TOOL_DEFINITION as GetPackage_Tool } from "./handlers/package/readonly/handleGetPackage";
import { TOOL_DEFINITION as CreatePackage_Tool } from "./handlers/package/high/handleCreatePackage";
import { TOOL_DEFINITION as GetInclude_Tool } from "./handlers/include/readonly/handleGetInclude";
import { TOOL_DEFINITION as GetIncludesList_Tool } from "./handlers/include/readonly/handleGetIncludesList";
import { TOOL_DEFINITION as GetTypeInfo_Tool } from "./handlers/system/readonly/handleGetTypeInfo";
import { TOOL_DEFINITION as GetInterface_Tool } from "./handlers/interface/readonly/handleGetInterface";
import { TOOL_DEFINITION as GetTransaction_Tool } from "./handlers/system/readonly/handleGetTransaction";
import { TOOL_DEFINITION as SearchObject_Tool } from "./handlers/search/readonly/handleSearchObject";
import { TOOL_DEFINITION as GetEnhancements_Tool } from "./handlers/enhancement/readonly/handleGetEnhancements";
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from "./handlers/enhancement/readonly/handleGetEnhancementImpl";
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from "./handlers/enhancement/readonly/handleGetEnhancementSpot";
import { TOOL_DEFINITION as GetBdef_Tool } from "./handlers/behavior_definition/readonly/handleGetBdef";
import { TOOL_DEFINITION as GetSqlQuery_Tool } from "./handlers/system/readonly/handleGetSqlQuery";
import { TOOL_DEFINITION as GetWhereUsed_Tool } from "./handlers/system/readonly/handleGetWhereUsed";
import { TOOL_DEFINITION as GetObjectInfo_Tool } from "./handlers/system/readonly/handleGetObjectInfo";
import { TOOL_DEFINITION as GetAbapAST_Tool } from "./handlers/system/readonly/handleGetAbapAST";
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from "./handlers/system/readonly/handleGetAbapSemanticAnalysis";
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from "./handlers/system/readonly/handleGetAbapSystemSymbols";
import { TOOL_DEFINITION as GetDomain_Tool } from "./handlers/domain/readonly/handleGetDomain";
import { TOOL_DEFINITION as CreateDomain_Tool } from "./handlers/domain/high/handleCreateDomain";
import { TOOL_DEFINITION as UpdateDomainHigh_Tool } from "./handlers/domain/high/handleUpdateDomain";
import { TOOL_DEFINITION as CreateDataElement_Tool } from "./handlers/data_element/high/handleCreateDataElement";
import { TOOL_DEFINITION as UpdateDataElementHigh_Tool } from "./handlers/data_element/high/handleUpdateDataElement";
import { TOOL_DEFINITION as GetDataElement_Tool } from "./handlers/data_element/readonly/handleGetDataElement";
import { TOOL_DEFINITION as CreateTransport_Tool } from "./handlers/transport/high/handleCreateTransport";
import { TOOL_DEFINITION as GetTransport_Tool } from "./handlers/transport/readonly/handleGetTransport";
import { TOOL_DEFINITION as CreateTable_Tool } from "./handlers/table/high/handleCreateTable";
import { TOOL_DEFINITION as CreateStructure_Tool } from "./handlers/structure/high/handleCreateStructure";
import { TOOL_DEFINITION as CreateView_Tool } from "./handlers/view/high/handleCreateView";
import { TOOL_DEFINITION as GetView_Tool } from "./handlers/view/readonly/handleGetView";
import { TOOL_DEFINITION as GetServiceDefinition_Tool } from "./handlers/service_definition/readonly/handleGetServiceDefinition";
import { TOOL_DEFINITION as CreateClass_Tool } from "./handlers/class/high/handleCreateClass";
import { TOOL_DEFINITION as CreateProgram_Tool } from "./handlers/program/high/handleCreateProgram";
import { TOOL_DEFINITION as CreateInterface_Tool } from "./handlers/interface/high/handleCreateInterface";
import { TOOL_DEFINITION as CreateFunctionGroup_Tool } from "./handlers/function/high/handleCreateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionModule_Tool } from "./handlers/function/high/handleCreateFunctionModule";
import { TOOL_DEFINITION as ActivateObject_Tool } from "./handlers/common/low/handleActivateObject";
import { TOOL_DEFINITION as DeleteObject_Tool } from "./handlers/common/low/handleDeleteObject";
import { TOOL_DEFINITION as CheckObject_Tool } from "./handlers/common/low/handleCheckObject";
import { TOOL_DEFINITION as UpdateClassHigh_Tool } from "./handlers/class/high/handleUpdateClass";
import { TOOL_DEFINITION as UpdateProgramHigh_Tool } from "./handlers/program/high/handleUpdateProgram";
import { TOOL_DEFINITION as UpdateViewHigh_Tool } from "./handlers/view/high/handleUpdateView";
import { TOOL_DEFINITION as UpdateInterfaceHigh_Tool } from "./handlers/interface/high/handleUpdateInterface";
import { TOOL_DEFINITION as UpdateFunctionModuleHigh_Tool } from "./handlers/function/high/handleUpdateFunctionModule";
import { TOOL_DEFINITION as UpdateStructure_Tool } from "./handlers/structure/low/handleUpdateStructure";
import { TOOL_DEFINITION as UpdatePackage_Tool } from "./handlers/package/low/handleUpdatePackage";
import { TOOL_DEFINITION as UpdateTable_Tool } from "./handlers/table/low/handleUpdateTable";
import { TOOL_DEFINITION as UnlockPackage_Tool } from "./handlers/package/low/handleUnlockPackage";
import { TOOL_DEFINITION as UpdateClass_Tool } from "./handlers/class/low/handleUpdateClass";
import { TOOL_DEFINITION as UpdateProgram_Tool } from "./handlers/program/low/handleUpdateProgram";
import { TOOL_DEFINITION as UpdateInterface_Tool } from "./handlers/interface/low/handleUpdateInterface";
import { TOOL_DEFINITION as UpdateFunctionModule_Tool } from "./handlers/function/low/handleUpdateFunctionModule";
import { TOOL_DEFINITION as UpdateView_Tool } from "./handlers/view/low/handleUpdateView";
import { TOOL_DEFINITION as UpdateDomainLow_Tool } from "./handlers/domain/low/handleUpdateDomain";
import { TOOL_DEFINITION as UpdateDataElementLow_Tool } from "./handlers/data_element/low/handleUpdateDataElement";
import { TOOL_DEFINITION as UpdateBehaviorDefinitionLow_Tool } from "./handlers/behavior_definition/low/handleUpdateBehaviorDefinition";
import { TOOL_DEFINITION as UpdateMetadataExtensionLow_Tool } from "./handlers/ddlx/low/handleUpdateMetadataExtension";
import { TOOL_DEFINITION as GetSession_Tool } from "./handlers/system/readonly/handleGetSession";
import { TOOL_DEFINITION as ValidateObject_Tool } from "./handlers/common/low/handleValidateObject";
import { TOOL_DEFINITION as LockObject_Tool } from "./handlers/common/low/handleLockObject";
import { TOOL_DEFINITION as UnlockObject_Tool } from "./handlers/common/low/handleUnlockObject";
import { TOOL_DEFINITION as ValidateClass_Tool } from "./handlers/class/low/handleValidateClass";
import { TOOL_DEFINITION as CheckClass_Tool } from "./handlers/class/low/handleCheckClass";
import { TOOL_DEFINITION as ValidateTable_Tool } from "./handlers/table/low/handleValidateTable";
import { TOOL_DEFINITION as CheckTable_Tool } from "./handlers/table/low/handleCheckTable";
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from "./handlers/function/low/handleValidateFunctionModule";
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from "./handlers/function/low/handleCheckFunctionModule";
import { TOOL_DEFINITION as ActivateProgram_Tool } from "./handlers/program/low/handleActivateProgram";
import { TOOL_DEFINITION as ActivateClass_Tool } from "./handlers/class/low/handleActivateClass";
import { TOOL_DEFINITION as ActivateInterface_Tool } from "./handlers/interface/low/handleActivateInterface";
import { TOOL_DEFINITION as ActivateFunctionModule_Tool } from "./handlers/function/low/handleActivateFunctionModule";
import { TOOL_DEFINITION as ActivateFunctionGroup_Tool } from "./handlers/function/low/handleActivateFunctionGroup";
import { TOOL_DEFINITION as ActivateDataElement_Tool } from "./handlers/data_element/low/handleActivateDataElement";
import { TOOL_DEFINITION as ActivateDomain_Tool } from "./handlers/domain/low/handleActivateDomain";
import { TOOL_DEFINITION as ActivateStructure_Tool } from "./handlers/structure/low/handleActivateStructure";
import { TOOL_DEFINITION as ActivateTable_Tool } from "./handlers/table/low/handleActivateTable";
import { TOOL_DEFINITION as ActivateView_Tool } from "./handlers/view/low/handleActivateView";
import { TOOL_DEFINITION as ActivateBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleActivateBehaviorDefinition";
import { TOOL_DEFINITION as ActivateMetadataExtension_Tool } from "./handlers/ddlx/low/handleActivateMetadataExtension";
import { TOOL_DEFINITION as CreateBdef_Tool } from "./handlers/behavior_definition/high/handleCreateBehaviorDefinition";
import { TOOL_DEFINITION as UpdateBdef_Tool } from "./handlers/behavior_definition/high/handleUpdateBehaviorDefinition";
import { TOOL_DEFINITION as CreateDdlx_Tool } from "./handlers/ddlx/high/handleCreateMetadataExtension";
import { TOOL_DEFINITION as UpdateDdlx_Tool } from "./handlers/ddlx/high/handleUpdateMetadataExtension";
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from "./handlers/system/readonly/handleGetInactiveObjects";
// New low-level handlers TOOL_DEFINITION imports
import { TOOL_DEFINITION as DeleteClass_Tool } from "./handlers/class/low/handleDeleteClass";
import { TOOL_DEFINITION as LockClass_Tool } from "./handlers/class/low/handleLockClass";
import { TOOL_DEFINITION as UnlockClass_Tool } from "./handlers/class/low/handleUnlockClass";
import { TOOL_DEFINITION as CreateClassLow_Tool } from "./handlers/class/low/handleCreateClass";
import { TOOL_DEFINITION as LockClassTestClasses_Tool } from "./handlers/class/low/handleLockClassTestClasses";
import { TOOL_DEFINITION as UnlockClassTestClasses_Tool } from "./handlers/class/low/handleUnlockClassTestClasses";
import { TOOL_DEFINITION as UpdateClassTestClasses_Tool } from "./handlers/class/low/handleUpdateClassTestClasses";
import { TOOL_DEFINITION as ActivateClassTestClasses_Tool } from "./handlers/class/low/handleActivateClassTestClasses";
import { TOOL_DEFINITION as RunClassUnitTests_Tool } from "./handlers/class/low/handleRunClassUnitTests";
import { TOOL_DEFINITION as GetClassUnitTestStatus_Tool } from "./handlers/class/low/handleGetClassUnitTestStatus";
import { TOOL_DEFINITION as GetClassUnitTestResult_Tool } from "./handlers/class/low/handleGetClassUnitTestResult";
import { TOOL_DEFINITION as CheckProgram_Tool } from "./handlers/program/low/handleCheckProgram";
import { TOOL_DEFINITION as DeleteProgram_Tool } from "./handlers/program/low/handleDeleteProgram";
import { TOOL_DEFINITION as LockProgram_Tool } from "./handlers/program/low/handleLockProgram";
import { TOOL_DEFINITION as UnlockProgram_Tool } from "./handlers/program/low/handleUnlockProgram";
import { TOOL_DEFINITION as ValidateProgram_Tool } from "./handlers/program/low/handleValidateProgram";
import { TOOL_DEFINITION as CreateProgramLow_Tool } from "./handlers/program/low/handleCreateProgram";
import { TOOL_DEFINITION as CheckInterface_Tool } from "./handlers/interface/low/handleCheckInterface";
import { TOOL_DEFINITION as DeleteInterface_Tool } from "./handlers/interface/low/handleDeleteInterface";
import { TOOL_DEFINITION as LockInterface_Tool } from "./handlers/interface/low/handleLockInterface";
import { TOOL_DEFINITION as UnlockInterface_Tool } from "./handlers/interface/low/handleUnlockInterface";
import { TOOL_DEFINITION as ValidateInterface_Tool } from "./handlers/interface/low/handleValidateInterface";
import { TOOL_DEFINITION as CreateInterfaceLow_Tool } from "./handlers/interface/low/handleCreateInterface";
import { TOOL_DEFINITION as CheckFunctionGroup_Tool } from "./handlers/function/low/handleCheckFunctionGroup";
import { TOOL_DEFINITION as DeleteFunctionGroup_Tool } from "./handlers/function/low/handleDeleteFunctionGroup";
import { TOOL_DEFINITION as DeleteFunctionModule_Tool } from "./handlers/function/low/handleDeleteFunctionModule";
import { TOOL_DEFINITION as LockFunctionGroup_Tool } from "./handlers/function/low/handleLockFunctionGroup";
import { TOOL_DEFINITION as LockFunctionModule_Tool } from "./handlers/function/low/handleLockFunctionModule";
import { TOOL_DEFINITION as UnlockFunctionGroup_Tool } from "./handlers/function/low/handleUnlockFunctionGroup";
import { TOOL_DEFINITION as UnlockFunctionModule_Tool } from "./handlers/function/low/handleUnlockFunctionModule";
import { TOOL_DEFINITION as ValidateFunctionGroup_Tool } from "./handlers/function/low/handleValidateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionGroupLow_Tool } from "./handlers/function/low/handleCreateFunctionGroup";
import { TOOL_DEFINITION as CreateFunctionModuleLow_Tool } from "./handlers/function/low/handleCreateFunctionModule";
import { TOOL_DEFINITION as CheckDataElement_Tool } from "./handlers/data_element/low/handleCheckDataElement";
import { TOOL_DEFINITION as DeleteDataElement_Tool } from "./handlers/data_element/low/handleDeleteDataElement";
import { TOOL_DEFINITION as LockDataElement_Tool } from "./handlers/data_element/low/handleLockDataElement";
import { TOOL_DEFINITION as UnlockDataElement_Tool } from "./handlers/data_element/low/handleUnlockDataElement";
import { TOOL_DEFINITION as ValidateDataElement_Tool } from "./handlers/data_element/low/handleValidateDataElement";
import { TOOL_DEFINITION as CreateDataElementLow_Tool } from "./handlers/data_element/low/handleCreateDataElement";
import { TOOL_DEFINITION as CheckDomain_Tool } from "./handlers/domain/low/handleCheckDomain";
import { TOOL_DEFINITION as DeleteDomain_Tool } from "./handlers/domain/low/handleDeleteDomain";
import { TOOL_DEFINITION as LockDomain_Tool } from "./handlers/domain/low/handleLockDomain";
import { TOOL_DEFINITION as UnlockDomain_Tool } from "./handlers/domain/low/handleUnlockDomain";
import { TOOL_DEFINITION as ValidateDomain_Tool } from "./handlers/domain/low/handleValidateDomain";
import { TOOL_DEFINITION as CreateDomainLow_Tool } from "./handlers/domain/low/handleCreateDomain";
import { TOOL_DEFINITION as CheckStructure_Tool } from "./handlers/structure/low/handleCheckStructure";
import { TOOL_DEFINITION as DeleteStructure_Tool } from "./handlers/structure/low/handleDeleteStructure";
import { TOOL_DEFINITION as LockStructure_Tool } from "./handlers/structure/low/handleLockStructure";
import { TOOL_DEFINITION as UnlockStructure_Tool } from "./handlers/structure/low/handleUnlockStructure";
import { TOOL_DEFINITION as ValidateStructure_Tool } from "./handlers/structure/low/handleValidateStructure";
import { TOOL_DEFINITION as CreateStructureLow_Tool } from "./handlers/structure/low/handleCreateStructure";
import { TOOL_DEFINITION as DeleteTable_Tool } from "./handlers/table/low/handleDeleteTable";
import { TOOL_DEFINITION as LockTable_Tool } from "./handlers/table/low/handleLockTable";
import { TOOL_DEFINITION as UnlockTable_Tool } from "./handlers/table/low/handleUnlockTable";
import { TOOL_DEFINITION as CreateTableLow_Tool } from "./handlers/table/low/handleCreateTable";
import { TOOL_DEFINITION as CheckView_Tool } from "./handlers/view/low/handleCheckView";
import { TOOL_DEFINITION as DeleteView_Tool } from "./handlers/view/low/handleDeleteView";
import { TOOL_DEFINITION as LockView_Tool } from "./handlers/view/low/handleLockView";
import { TOOL_DEFINITION as UnlockView_Tool } from "./handlers/view/low/handleUnlockView";
import { TOOL_DEFINITION as ValidateView_Tool } from "./handlers/view/low/handleValidateView";
import { TOOL_DEFINITION as CreateViewLow_Tool } from "./handlers/view/low/handleCreateView";
import { TOOL_DEFINITION as CheckPackage_Tool } from "./handlers/package/low/handleCheckPackage";
import { TOOL_DEFINITION as DeletePackage_Tool } from "./handlers/package/low/handleDeletePackage";
import { TOOL_DEFINITION as LockPackage_Tool } from "./handlers/package/low/handleLockPackage";
import { TOOL_DEFINITION as ValidatePackage_Tool } from "./handlers/package/low/handleValidatePackage";
import { TOOL_DEFINITION as CreatePackageLow_Tool } from "./handlers/package/low/handleCreatePackage";
import { TOOL_DEFINITION as CreateTransportLow_Tool } from "./handlers/transport/low/handleCreateTransport";
import { TOOL_DEFINITION as CheckBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleCheckBehaviorDefinition";
import { TOOL_DEFINITION as DeleteBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleDeleteBehaviorDefinition";
import { TOOL_DEFINITION as LockBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleLockBehaviorDefinition";
import { TOOL_DEFINITION as UnlockBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleUnlockBehaviorDefinition";
import { TOOL_DEFINITION as ValidateBehaviorDefinition_Tool } from "./handlers/behavior_definition/low/handleValidateBehaviorDefinition";
import { TOOL_DEFINITION as CreateBehaviorDefinitionLow_Tool } from "./handlers/behavior_definition/low/handleCreateBehaviorDefinition";
import { TOOL_DEFINITION as CheckMetadataExtension_Tool } from "./handlers/ddlx/low/handleCheckMetadataExtension";
import { TOOL_DEFINITION as DeleteMetadataExtension_Tool } from "./handlers/ddlx/low/handleDeleteMetadataExtension";
import { TOOL_DEFINITION as LockMetadataExtension_Tool } from "./handlers/ddlx/low/handleLockMetadataExtension";
import { TOOL_DEFINITION as UnlockMetadataExtension_Tool } from "./handlers/ddlx/low/handleUnlockMetadataExtension";
import { TOOL_DEFINITION as ValidateMetadataExtension_Tool } from "./handlers/ddlx/low/handleValidateMetadataExtension";
import { TOOL_DEFINITION as CreateMetadataExtensionLow_Tool } from "./handlers/ddlx/low/handleCreateMetadataExtension";

// --- ENV FILE LOADING LOGIC ---
import fs from "fs";

/**
 * Display help message
 */
function showHelp(): void {
  const help = `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  mcp-abap-adt [options]

DESCRIPTION:
  MCP server for interacting with SAP ABAP systems via ADT (ABAP Development Tools).
  Supports multiple transport modes: HTTP (default), stdio, and SSE.

TRANSPORT MODES:
  Default: HTTP (can work without .env file, receives config via HTTP headers)
  stdio:   --transport=stdio (for MCP clients like Cline, Cursor, Claude Desktop)
  SSE:     --transport=sse

OPTIONS:
  --help                           Show this help message

ENVIRONMENT FILE:
  --env=<path>                     Path to .env file (default: ./.env)
  --env <path>                     Alternative syntax for --env

TRANSPORT SELECTION:
  --transport=<type>               Transport type: stdio|http|streamable-http|sse
                                   Default: http (streamable-http)
                                   Shortcuts: --http (same as --transport=http)
                                             --sse (same as --transport=sse)
                                             --stdio (same as --transport=stdio)

HTTP/STREAMABLE-HTTP OPTIONS:
  --http-port=<port>               HTTP server port (default: 3000)
  --http-host=<host>               HTTP server host (default: 0.0.0.0)
  --http-json-response             Enable JSON response format
  --http-allowed-origins=<list>    Comma-separated allowed origins for CORS
                                   Example: --http-allowed-origins=http://localhost:3000,https://example.com
  --http-allowed-hosts=<list>      Comma-separated allowed hosts
  --http-enable-dns-protection     Enable DNS rebinding protection

SSE (SERVER-SENT EVENTS) OPTIONS:
  --sse-port=<port>                SSE server port (default: 3001)
  --sse-host=<host>                SSE server host (default: 0.0.0.0)
  --sse-allowed-origins=<list>     Comma-separated allowed origins for CORS
                                   Example: --sse-allowed-origins=http://localhost:3000
  --sse-allowed-hosts=<list>       Comma-separated allowed hosts
  --sse-enable-dns-protection     Enable DNS rebinding protection

ENVIRONMENT VARIABLES:
  MCP_ENV_PATH                     Path to .env file
  MCP_SKIP_ENV_LOAD                Skip automatic .env loading (true|false)
  MCP_SKIP_AUTO_START              Skip automatic server start (true|false)
  MCP_TRANSPORT                    Default transport type (stdio|http|sse)
  MCP_HTTP_PORT                    Default HTTP port (default: 3000)
  MCP_HTTP_HOST                    Default HTTP host (default: 0.0.0.0)
  MCP_HTTP_ENABLE_JSON_RESPONSE   Enable JSON responses (true|false)
  MCP_HTTP_ALLOWED_ORIGINS         Allowed CORS origins (comma-separated)
  MCP_HTTP_ALLOWED_HOSTS           Allowed hosts (comma-separated)
  MCP_HTTP_ENABLE_DNS_PROTECTION   Enable DNS protection (true|false)
  MCP_SSE_PORT                     Default SSE port (default: 3001)
  MCP_SSE_HOST                     Default SSE host (default: 0.0.0.0)
  MCP_SSE_ALLOWED_ORIGINS          Allowed CORS origins for SSE (comma-separated)
  MCP_SSE_ALLOWED_HOSTS            Allowed hosts for SSE (comma-separated)
  MCP_SSE_ENABLE_DNS_PROTECTION    Enable DNS protection for SSE (true|false)

SAP CONNECTION (.env file):
  SAP_URL                          SAP system URL (required)
                                   Example: https://your-system.sap.com
  SAP_CLIENT                       SAP client number (required)
                                   Example: 100
  SAP_AUTH_TYPE                    Authentication type: basic|jwt (default: basic)
  SAP_USERNAME                     SAP username (required for basic auth)
  SAP_PASSWORD                     SAP password (required for basic auth)
  SAP_JWT_TOKEN                    JWT token (required for jwt auth)

GENERATING .ENV FROM SERVICE KEY (JWT Authentication):
  To generate .env file from SAP BTP service key JSON file, install the
  connection package globally:

    npm install -g @mcp-abap-adt/connection

  Then use the sap-abap-auth command:

    sap-abap-auth auth -k path/to/service-key.json

  This will create/update .env file with JWT tokens and connection details.

EXAMPLES:
  # Default HTTP mode (works without .env file)
  mcp-abap-adt

  # HTTP server on custom port
  mcp-abap-adt --http-port=8080

  # Use stdio mode (for MCP clients, requires .env file)
  mcp-abap-adt --transport=stdio

  # Use custom .env file
  mcp-abap-adt --env=/path/to/my.env

  # Start HTTP server with CORS enabled
  mcp-abap-adt --transport=http --http-port=3000 \\
                --http-allowed-origins=http://localhost:3000,https://example.com

  # Start SSE server on custom port
  mcp-abap-adt --transport=sse --sse-port=3001

  # Start SSE server with CORS and DNS protection
  mcp-abap-adt --transport=sse --sse-port=3001 \\
                --sse-allowed-origins=http://localhost:3000 \\
                --sse-enable-dns-protection

  # Using shortcuts
  mcp-abap-adt --http --http-port=8080
  mcp-abap-adt --sse --sse-port=3001

QUICK REFERENCE:
  Transport types:
    http            - HTTP StreamableHTTP transport (default)
    streamable-http - Same as http
    stdio           - Standard input/output (for MCP clients, requires .env file)
    sse             - Server-Sent Events transport

  Common use cases:
    Web interfaces (HTTP):        mcp-abap-adt (default, no .env needed)
    MCP clients (Cline, Cursor):  mcp-abap-adt --transport=stdio
    Web interfaces (SSE):         mcp-abap-adt --transport=sse --sse-port=3001

DOCUMENTATION:
  https://github.com/fr0ster/mcp-abap-adt
  Installation:    doc/installation/INSTALLATION.md
  Configuration:   doc/user-guide/CLIENT_CONFIGURATION.md
  Available Tools: doc/user-guide/AVAILABLE_TOOLS.md

AUTHENTICATION:
  For JWT authentication with SAP BTP service keys:
  1. Install: npm install -g @mcp-abap-adt/connection
  2. Run:     sap-abap-auth auth -k path/to/service-key.json
  3. This generates .env file with JWT tokens automatically

`;
  console.log(help);
  process.exit(0);
}

// Check for version/help flags
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  console.log(packageJson.version);
  process.exit(0);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
}

/**
 * Helper to determine transport type early for .env loading logic
 * Returns the transport type if explicitly specified, or null if not specified
 *
 * Auto-detects stdio mode if:
 * - stdin is not a TTY (piped/redirected, e.g., by MCP Inspector)
 * - and no explicit transport was specified
 */
function getTransportType(): string | null {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--transport=")) {
      return arg.split("=")[1].toLowerCase();
    }
    if (arg === "--transport" && i + 1 < args.length) {
      return args[i + 1].toLowerCase();
    }
    if (arg === "--http") return "streamable-http";
    if (arg === "--stdio") return "stdio";
    if (arg === "--sse") return "sse";
  }
  // Check environment variable
  if (process.env.MCP_TRANSPORT) {
    return process.env.MCP_TRANSPORT.toLowerCase();
  }
  // Auto-detect stdio mode: if stdin is not a TTY, we're likely in stdio mode (piped by MCP Inspector)
  if (!process.stdin.isTTY) {
    return "stdio";
  }
  // Not explicitly specified
  return null;
}

/**
 * Parses command line arguments to find env file path
 * Supports both formats:
 * 1. --env=/path/to/.env
 * 2. --env /path/to/.env
 */
function parseEnvArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    // Format: --env=/path/to/.env
    if (args[i].startsWith("--env=")) {
      return args[i].slice("--env=".length);
    }
    // Format: --env /path/to/.env
    else if (args[i] === "--env" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

// Find .env file path from arguments
// Skip .env loading if launcher already loaded it
const skipEnvAutoload = process.env.MCP_SKIP_ENV_LOAD === "true" || process.env.MCP_ENV_LOADED_BY_LAUNCHER === "true";
const explicitTransportType = getTransportType();
// If transport not explicitly specified, default to HTTP mode
// Stdio mode is only used if explicitly specified via --transport=stdio
const transportType = explicitTransportType || "streamable-http";
const isHttp = transportType === "http" || transportType === "streamable-http" || transportType === "server";
const isSse = transportType === "sse";
const isStdio = transportType === "stdio";
// .env is mandatory only if transport is explicitly set to stdio or sse
const isEnvMandatory = explicitTransportType !== null && (isStdio || isSse);

let envFilePath = parseEnvArg() ?? process.env.MCP_ENV_PATH;

if (!skipEnvAutoload) {
  if (!envFilePath) {
    // Only search in current working directory (where user runs the command)
    const cwdEnvPath = path.resolve(process.cwd(), ".env");

    if (fs.existsSync(cwdEnvPath)) {
      envFilePath = cwdEnvPath;
      // Only write to stderr if not in stdio mode (stdio mode requires clean JSON only)
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Found .env file: ${envFilePath}\n`);
      }
    }
  } else {
    // Only write to stderr if not in stdio mode
    if (!isStdio) {
      process.stderr.write(`[MCP-ENV] Using .env from argument/env: ${envFilePath}\n`);
    }
  }

  if (envFilePath) {
    if (!path.isAbsolute(envFilePath)) {
      envFilePath = path.resolve(process.cwd(), envFilePath);
      // Only write to stderr if not in stdio mode
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Resolved relative path to: ${envFilePath}\n`);
      }
    }

    if (fs.existsSync(envFilePath)) {
      // For stdio mode, load .env manually to avoid any output from dotenv library
      if (isStdio) {
        // Manual .env parsing for stdio mode (no library output)
        try {
          const envContent = fs.readFileSync(envFilePath, "utf8");
          const lines = envContent.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith("#")) {
              continue;
            }
            // Parse KEY=VALUE format
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex === -1) {
              continue;
            }
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1);

            // Remove inline comments (everything after #)
            // This handles cases like: KEY=value # comment or KEY=value#comment
            // Find first # and remove everything after it (including the #)
            const commentIndex = value.indexOf('#');
            if (commentIndex !== -1) {
              // Remove everything from # onwards, then trim trailing whitespace
              const beforeComment = value.substring(0, commentIndex);
              value = beforeComment.trim();
            } else {
              value = value.trim();
            }

            // Aggressive cleaning for Windows compatibility (same as launcher)
            // Step 1: Remove ALL control characters (including \r from Windows line endings)
            let unquotedValue = String(value).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            // Step 2: Trim whitespace
            unquotedValue = unquotedValue.trim();
            // Step 3: Remove quotes (handle nested quotes)
            unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '');
            // Step 4: Trim again after quote removal
            unquotedValue = unquotedValue.trim();
            // Step 5: For URLs specifically, remove trailing slashes
            if (key === 'SAP_URL') {
              unquotedValue = unquotedValue.replace(/\/+$/, '').trim();
              // Debug logging for Windows
              if (process.platform === 'win32' && !isStdio) {
                process.stderr.write(`[MCP-ENV] Parsed SAP_URL: "${unquotedValue}" (length: ${unquotedValue.length})\n`);
              }
            }
            // Only set if not already in process.env (don't override launcher's cleaned values)
            if (key && !process.env[key]) {
              process.env[key] = unquotedValue;
            }
          }
        } catch (error) {
          // Silent fail for stdio mode - just exit
          process.exit(1);
        }
      } else {
        // For non-stdio modes, use manual parsing (dotenv removed to avoid stdout pollution)
        try {
          const envContent = fs.readFileSync(envFilePath, "utf8");
          const lines = envContent.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              continue;
            }
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex === -1) {
              continue;
            }
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1);

            // Remove inline comments (everything after #)
            // This handles cases like: KEY=value # comment or KEY=value#comment
            // Find first # and remove everything after it (including the #)
            const commentIndex = value.indexOf('#');
            if (commentIndex !== -1) {
              // Remove everything from # onwards, then trim trailing whitespace
              const beforeComment = value.substring(0, commentIndex);
              value = beforeComment.trim();
            } else {
              value = value.trim();
            }

            // Aggressive cleaning for Windows compatibility (same as launcher)
            // Step 1: Remove ALL control characters (including \r from Windows line endings)
            let unquotedValue = String(value).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            // Step 2: Trim whitespace
            unquotedValue = unquotedValue.trim();
            // Step 3: Remove quotes (handle nested quotes)
            unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '');
            // Step 4: Trim again after quote removal
            unquotedValue = unquotedValue.trim();
            // Step 5: For URLs specifically, remove trailing slashes
            if (key === 'SAP_URL') {
              unquotedValue = unquotedValue.replace(/\/+$/, '').trim();
              // Debug logging for Windows
              if (process.platform === 'win32' && !isStdio) {
                process.stderr.write(`[MCP-ENV] Parsed SAP_URL: "${unquotedValue}" (length: ${unquotedValue.length})\n`);
              }
            }
            // Only set if not already in process.env (don't override launcher's cleaned values)
            if (key && !process.env[key]) {
              process.env[key] = unquotedValue;
            }
          }
          process.stderr.write(`[MCP-ENV] ✓ Successfully loaded: ${envFilePath}\n`);
          // Debug: log SAP_URL if loaded (for troubleshooting on Windows)
          if (process.env.SAP_URL) {
            const urlHex = Buffer.from(process.env.SAP_URL, 'utf8').toString('hex');
            process.stderr.write(`[MCP-ENV] SAP_URL loaded: "${process.env.SAP_URL}" (length: ${process.env.SAP_URL.length})\n`);
            if (process.platform === 'win32') {
              process.stderr.write(`[MCP-ENV] SAP_URL (hex): ${urlHex.substring(0, 60)}...\n`);
              // Check for comments
              if (process.env.SAP_URL.includes('#')) {
                process.stderr.write(`[MCP-ENV] ⚠ WARNING: SAP_URL contains # character (comment not removed?)\n`);
              }
            }
          } else {
            process.stderr.write(`[MCP-ENV] ⚠ WARNING: SAP_URL not found in .env file\n`);
          }
        } catch (error) {
          process.stderr.write(`[MCP-ENV] ✗ Failed to load: ${envFilePath}\n`);
          if (error instanceof Error) {
            process.stderr.write(`[MCP-ENV] Error: ${error.message}\n`);
          }
        }
      }
    } else {
      // .env file specified but not found
      if (isEnvMandatory) {
        // Always write error to stderr (stderr is safe even in stdio mode, unlike stdout)
        logger.error(".env file not found", { path: envFilePath });
        process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found at: ${envFilePath}\n`);
        process.stderr.write(`[MCP-ENV]   Current working directory: ${process.cwd()}\n`);
        process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' requires .env file.\n`);
        process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      } else {
        // Always write error to stderr (stderr is safe even in stdio mode)
        process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found at: ${envFilePath}\n`);
        process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' was explicitly specified but .env file is missing.\n`);
        process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      }
    }
  } else {
    // No .env file found and none specified
    if (isEnvMandatory) {
      // Transport explicitly set to stdio/sse but no .env found
      const cwdEnvPath = path.resolve(process.cwd(), ".env");
      // Always write error to stderr (stderr is safe even in stdio mode)
      logger.error(".env file not found", { path: cwdEnvPath });
      process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found in current directory: ${process.cwd()}\n`);
      process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' requires .env file.\n`);
      process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
      // On Windows, add a small delay before exit to allow error message to be visible
      if (process.platform === 'win32') {
        setTimeout(() => process.exit(1), 100);
      } else {
        process.exit(1);
      }
    } else {
      // No .env found, but transport is HTTP (default) - this is OK
      if (explicitTransportType === null) {
        // Transport not specified, defaulting to HTTP mode
        // For stdio mode, don't write to stderr
        if (!isStdio) {
          process.stderr.write(`[MCP-ENV] NOTE: No .env file found in current directory: ${process.cwd()}\n`);
          process.stderr.write(`[MCP-ENV]   Starting in HTTP mode (no .env file required)\n`);
        }
      } else {
        // Transport explicitly set to HTTP - this is OK
        // For stdio mode, don't write to stderr
        if (!isStdio) {
          process.stderr.write(`[MCP-ENV] NOTE: No .env file found, continuing in ${transportType} mode\n`);
        }
      }
    }
  }
} else if (envFilePath) {
  if (!path.isAbsolute(envFilePath)) {
    envFilePath = path.resolve(process.cwd(), envFilePath);
  }
  // For stdio mode, don't write to stderr
  if (!isStdio) {
    process.stderr.write(`[MCP-ENV] Environment autoload skipped; using provided path reference: ${envFilePath}\n`);
  }
} else {
  // For stdio mode, don't write to stderr
  if (!isStdio) {
    process.stderr.write(`[MCP-ENV] Environment autoload skipped (MCP_SKIP_ENV_LOAD=true).\n`);
  }
}
// --- END ENV FILE LOADING LOGIC ---

// Debug: Log loaded SAP_URL and SAP_CLIENT using the MCP-compatible logger
// Skip logging in stdio mode (MCP protocol requires clean JSON only)
if (!isStdio) {
  const envLogPath = envFilePath ?? "(skipped)";
  logger.info("SAP configuration loaded", {
    type: "CONFIG_INFO",
    SAP_URL: process.env.SAP_URL,
    SAP_CLIENT: process.env.SAP_CLIENT || "(not set)",
    SAP_AUTH_TYPE: process.env.SAP_AUTH_TYPE || "(not set)",
    SAP_JWT_TOKEN: process.env.SAP_JWT_TOKEN ? "[set]" : "(not set)",
    ENV_PATH: envLogPath,
    CWD: process.cwd(),
    DIRNAME: __dirname,
    TRANSPORT: transportType
  });
}

type TransportConfig =
  | { type: "stdio" }
  | {
    type: "streamable-http";
    host: string;
    port: number;
    enableJsonResponse: boolean;
    allowedOrigins?: string[];
    allowedHosts?: string[];
    enableDnsRebindingProtection: boolean;
  }
  | {
    type: "sse";
    host: string;
    port: number;
    allowedOrigins?: string[];
    allowedHosts?: string[];
    enableDnsRebindingProtection: boolean;
  };

function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
    if (arg === name && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolvePortOption(argName: string, envName: string, defaultValue: number): number {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return defaultValue;
  }

  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port value for ${argName}: ${rawValue}`);
  }

  return port;
}

function resolveBooleanOption(argName: string, envName: string, defaultValue: boolean): boolean {
  const argValue = getArgValue(argName);
  if (argValue !== undefined) {
    return parseBoolean(argValue);
  }
  if (hasFlag(argName)) {
    return true;
  }
  const envValue = process.env[envName];
  if (envValue !== undefined) {
    return parseBoolean(envValue);
  }
  return defaultValue;
}

function resolveListOption(argName: string, envName: string): string[] | undefined {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return undefined;
  }
  const items = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function parseTransportConfig(): TransportConfig {
  // Use the transport type we already determined (handles explicit args, env vars, and defaults)
  const normalized = transportType;

  if (
    normalized &&
    normalized !== "stdio" &&
    normalized !== "http" &&
    normalized !== "streamable-http" &&
    normalized !== "server" &&
    normalized !== "sse"
  ) {
    throw new Error(`Unsupported transport: ${normalized}`);
  }

  const sseRequested =
    normalized === "sse" ||
    hasFlag("--sse");

  if (sseRequested) {
    const port = resolvePortOption("--sse-port", "MCP_SSE_PORT", 3001);
    const host = getArgValue("--sse-host") ?? process.env.MCP_SSE_HOST ?? "0.0.0.0";
    const allowedOrigins = resolveListOption("--sse-allowed-origins", "MCP_SSE_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--sse-allowed-hosts", "MCP_SSE_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--sse-enable-dns-protection",
      "MCP_SSE_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "sse",
      host,
      port,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  const httpRequested =
    normalized === "http" ||
    normalized === "streamable-http" ||
    normalized === "server" ||
    hasFlag("--http") ||
    // Default to HTTP if not stdio/sse
    (!sseRequested && normalized !== "stdio");

  if (httpRequested) {
    const port = resolvePortOption("--http-port", "MCP_HTTP_PORT", 3000);
    const host = getArgValue("--http-host") ?? process.env.MCP_HTTP_HOST ?? "0.0.0.0";
    const enableJsonResponse = resolveBooleanOption(
      "--http-json-response",
      "MCP_HTTP_ENABLE_JSON_RESPONSE",
      false
    );
    const allowedOrigins = resolveListOption("--http-allowed-origins", "MCP_HTTP_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--http-allowed-hosts", "MCP_HTTP_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--http-enable-dns-protection",
      "MCP_HTTP_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "streamable-http",
      host,
      port,
      enableJsonResponse,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  return { type: "stdio" };
}

let sapConfigOverride: SapConfig | undefined;

export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: AbapConnection;
  transportConfig?: TransportConfig;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

export function setSapConfigOverride(config?: SapConfig) {
  sapConfigOverride = config;
  setConfigOverride(config);
}

export function setAbapConnectionOverride(connection?: AbapConnection) {
  setConnectionOverride(connection);
}

/**
 * Retrieves SAP configuration from environment variables.
 * Reads configuration from process.env (caller is responsible for loading .env file if needed).
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  if (sapConfigOverride) {
    return sapConfigOverride;
  }

  // Read from process.env (already loaded and cleaned by launcher or at startup)
  // No need to reload .env here - it's already in process.env
  let url = process.env.SAP_URL;
  let client = process.env.SAP_CLIENT;

  // Final cleaning for Windows compatibility (in case values weren't cleaned properly)
  // This is a safety net, not a reload
  if (url) {
    const originalUrl = url;

    // Remove inline comments (safety net - should already be removed)
    const commentIndex = url.indexOf('#');
    if (commentIndex !== -1) {
      url = url.substring(0, commentIndex).trim();
      // Log if comment was found (indicates .env parsing issue)
      if (process.platform === 'win32') {
        process.stderr.write(`[MCP-CONFIG] ⚠ Found comment in URL, removed: "${originalUrl}" → "${url}"\n`);
      }
    }

    // Remove ALL control characters (safety net)
    url = String(url).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    url = url.trim();
    // Remove quotes (safety net)
    url = url.replace(/^["']+|["']+$/g, '');
    url = url.trim();
    // Remove trailing slashes
    url = url.replace(/\/+$/, '');
    url = url.trim();

    // Log cleaned URL for debugging on Windows
    if (process.platform === 'win32' && url !== originalUrl) {
      const urlHex = Buffer.from(url, 'utf8').toString('hex');
      process.stderr.write(`[MCP-CONFIG] Cleaned URL: "${url}" (length: ${url.length}, hex: ${urlHex.substring(0, 60)}...)\n`);
    }
  } else {
    // Log if URL is missing
    if (process.platform === 'win32') {
      process.stderr.write(`[MCP-CONFIG] ✗ SAP_URL is missing from process.env\n`);
      process.stderr.write(`[MCP-CONFIG] Available env vars: ${Object.keys(process.env).filter(k => k.startsWith('SAP_')).join(', ')}\n`);
    }
  }

  if (client) {
    client = client.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    client = client.replace(/^["']|["']$/g, '');
  }

  // Auto-detect auth type: if JWT token is present, use JWT; otherwise check SAP_AUTH_TYPE or default to basic
  let authType: SapConfig["authType"] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const rawAuthType = process.env.SAP_AUTH_TYPE.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    authType = rawAuthType === 'xsuaa' ? 'jwt' : (rawAuthType as SapConfig["authType"]);
  }

  if (!url) {
    throw new Error(`Missing SAP_URL in environment variables. Please check your .env file.`);
  }

  // Final validation - URL should be clean now
  if (!/^https?:\/\//.test(url)) {
    // Log URL in hex for debugging
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL format: "${url}" (hex: ${urlHex.substring(0, 100)}...). Expected format: https://your-system.sap.com`);
  }

  // Additional validation: try to create URL object to catch any remaining issues
  try {
    const testUrl = new URL(url);
    // If URL object creation succeeds, use the normalized URL
    url = testUrl.href.replace(/\/$/, ''); // Remove trailing slash if present
  } catch (urlError) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL: "${url}" (hex: ${urlHex.substring(0, 100)}...). Error: ${urlError instanceof Error ? urlError.message : urlError}`);
  }

  // Log cleaned URL for debugging (always log on Windows for troubleshooting)
  if (process.platform === 'win32' || !process.stdin.isTTY) {
    const cleanedUrlHex = Buffer.from(url, 'utf8').toString('hex');
    process.stderr.write(`[MCP-CONFIG] Final SAP_URL: "${url}" (length: ${url.length}, hex: ${cleanedUrlHex.substring(0, 60)}...)\n`);
    // Verify URL is clean
    if (url.includes('#')) {
      process.stderr.write(`[MCP-CONFIG] ✗ ERROR: URL still contains # character!\n`);
    }
    if (/[\x00-\x1F\x7F-\x9F]/.test(url)) {
      process.stderr.write(`[MCP-CONFIG] ✗ ERROR: URL still contains control characters!\n`);
    }
  }

  const config: SapConfig = {
    url, // Already cleaned and validated above
    authType,
  };

  if (client) {
    config.client = client;
  }

  if (authType === 'jwt') {
    const jwtToken = process.env.SAP_JWT_TOKEN;
    if (!jwtToken) {
      throw new Error('Missing SAP_JWT_TOKEN for JWT authentication');
    }
    // Clean JWT token (remove control characters)
    config.jwtToken = jwtToken.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    const refreshToken = process.env.SAP_REFRESH_TOKEN;
    if (refreshToken) {
      config.refreshToken = refreshToken.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    }
    const uaaUrl = process.env.SAP_UAA_URL || process.env.UAA_URL;
    const uaaClientId = process.env.SAP_UAA_CLIENT_ID || process.env.UAA_CLIENT_ID;
    const uaaClientSecret = process.env.SAP_UAA_CLIENT_SECRET || process.env.UAA_CLIENT_SECRET;
    if (uaaUrl) config.uaaUrl = uaaUrl.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (uaaClientId) config.uaaClientId = uaaClientId.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (uaaClientSecret) config.uaaClientSecret = uaaClientSecret.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing SAP_USERNAME or SAP_PASSWORD for basic authentication');
    }
    // Clean username and password (remove control characters)
    config.username = username.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    config.password = password.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  }

  return config;
}

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
  private readonly allowProcessExit: boolean;
  private readonly registerSignalHandlers: boolean;
  private mcpServer: McpServer; // MCP server for all transports
  private sapConfig: SapConfig; // SAP configuration
  private readonly hasEnvFile: boolean; // Track if .env file was found at startup
  private transportConfig: TransportConfig;
  private httpServer?: HttpServer;
  private shuttingDown = false;

  // Client session tracking for StreamableHTTP (like the example)
  private streamableHttpSessions = new Map<string, {
    sessionId: string;
    clientIP: string;
    connectedAt: Date;
    requestCount: number;
    sapConfig?: SapConfig; // Store SAP config per session
  }>();

  // SSE session tracking (McpServer + SSEServerTransport per session)
  private sseSessions = new Map<string, {
    server: McpServer;
    transport: SSEServerTransport;
  }>();
  private applyAuthHeaders(headers?: IncomingHttpHeaders, sessionId?: string) {
    if (!headers) {
      return;
    }

    const getHeaderValue = (value?: string | string[]) => {
      if (!value) {
        return undefined;
      }
      return Array.isArray(value) ? value[0] : value;
    };

    // Extract SAP URL and auth type from headers
    const sapUrl = getHeaderValue(headers["x-sap-url"])?.trim();
    const sapAuthType = getHeaderValue(headers["x-sap-auth-type"])?.trim();

    // If no URL or auth type, skip processing
    if (!sapUrl || !sapAuthType) {
      return;
    }

    const isJwtAuth = sapAuthType === "jwt" || sapAuthType === "xsuaa";
    const isBasicAuth = sapAuthType === "basic";

    // Process JWT authentication
    if (isJwtAuth) {
      // Extract JWT token - required for JWT auth
      const jwtToken = getHeaderValue(headers["x-sap-jwt-token"])?.trim();
      if (!jwtToken) {
        return; // JWT token is required for JWT authentication
      }

      // Extract refresh token - optional for JWT auth
      const refreshToken = getHeaderValue(headers["x-sap-refresh-token"]);

      // Process JWT config update
      this.processJwtConfigUpdate(sapUrl, jwtToken, refreshToken, sessionId);
      return;
    }

    // Process basic authentication
    if (isBasicAuth) {
      // Extract username and password - required for basic auth
      const username = getHeaderValue(headers["x-sap-login"])?.trim();
      const password = getHeaderValue(headers["x-sap-password"])?.trim();

      if (!username || !password) {
        return; // Username and password are required for basic authentication
      }

      // Process basic auth config update
      this.processBasicAuthConfigUpdate(sapUrl, username, password, sessionId);
      return;
    }
  }

  private processJwtConfigUpdate(sapUrl: string, jwtToken: string, refreshToken?: string, sessionId?: string) {
    const sanitizeToken = (token: string) =>
      token.length <= 10 ? token : `${token.substring(0, 6)}…${token.substring(token.length - 4)}`;

    let baseConfig: SapConfig | undefined = this.sapConfig;
    if (!baseConfig || baseConfig.url === "http://placeholder") {
      try {
        baseConfig = getConfig();
      } catch (error) {
        logger.warn("Failed to load base SAP config when applying headers", {
          type: "SAP_CONFIG_HEADER_APPLY_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        baseConfig = {
          url: sapUrl,
          authType: "jwt",
        };
      }
    }

    // Check if any configuration changed
    const urlChanged = sapUrl !== baseConfig.url;
    const authTypeChanged = "jwt" !== baseConfig.authType;
    const tokenChanged =
      baseConfig.jwtToken !== jwtToken ||
      (!!refreshToken && refreshToken.trim() !== baseConfig.refreshToken);

    if (!urlChanged && !authTypeChanged && !tokenChanged) {
      return;
    }

    const newConfig: SapConfig = {
      ...baseConfig,
      url: sapUrl,
      authType: "jwt",
      jwtToken,
    };

    if (refreshToken && refreshToken.trim()) {
      newConfig.refreshToken = refreshToken.trim();
    }

    setSapConfigOverride(newConfig);
    this.sapConfig = newConfig;

    // Store config in session if sessionId is provided
    if (sessionId) {
      const session = this.streamableHttpSessions.get(sessionId);
      if (session) {
        session.sapConfig = newConfig;
      }
    }

    // Force connection cache invalidation (for backward compatibility)
    const { invalidateConnectionCache } = require('./lib/utils');
    try {
      invalidateConnectionCache();
    } catch (error) {
      logger.debug("Connection cache invalidation failed", {
        type: "CONNECTION_CACHE_INVALIDATION_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("Updated SAP configuration from HTTP headers (JWT)", {
      type: "SAP_CONFIG_UPDATED",
      urlChanged: Boolean(urlChanged),
      authTypeChanged: Boolean(authTypeChanged),
      tokenChanged: Boolean(tokenChanged),
      hasRefreshToken: Boolean(refreshToken),
      jwtPreview: sanitizeToken(jwtToken),
      sessionId: sessionId?.substring(0, 8),
    });
  }

  private processBasicAuthConfigUpdate(sapUrl: string, username: string, password: string, sessionId?: string) {
    let baseConfig: SapConfig | undefined = this.sapConfig;
    if (!baseConfig || baseConfig.url === "http://placeholder") {
      try {
        baseConfig = getConfig();
      } catch (error) {
        logger.warn("Failed to load base SAP config when applying headers", {
          type: "SAP_CONFIG_HEADER_APPLY_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        baseConfig = {
          url: sapUrl,
          authType: "basic",
        };
      }
    }

    // Check if any configuration changed
    const urlChanged = sapUrl !== baseConfig.url;
    const authTypeChanged = "basic" !== baseConfig.authType;
    const credentialsChanged =
      baseConfig.username !== username ||
      baseConfig.password !== password;

    if (!urlChanged && !authTypeChanged && !credentialsChanged) {
      return;
    }

    const newConfig: SapConfig = {
      ...baseConfig,
      url: sapUrl,
      authType: "basic",
      username,
      password,
    };

    setSapConfigOverride(newConfig);
    this.sapConfig = newConfig;

    // Store config in session if sessionId is provided
    if (sessionId) {
      const session = this.streamableHttpSessions.get(sessionId);
      if (session) {
        session.sapConfig = newConfig;
      }
    }

    // Force connection cache invalidation (for backward compatibility)
    const { invalidateConnectionCache } = require('./lib/utils');
    try {
      invalidateConnectionCache();
    } catch (error) {
      logger.debug("Connection cache invalidation failed", {
        type: "CONNECTION_CACHE_INVALIDATION_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("Updated SAP configuration from HTTP headers (Basic)", {
      type: "SAP_CONFIG_UPDATED",
      urlChanged: Boolean(urlChanged),
      authTypeChanged: Boolean(authTypeChanged),
      credentialsChanged: Boolean(credentialsChanged),
      hasUsername: Boolean(username),
      sessionId: sessionId?.substring(0, 8),
    });
  }

  /**
   * Check if connection is from localhost
   */
  private isLocalConnection(remoteAddress?: string): boolean {
    if (!remoteAddress) {
      return false;
    }
    // Check for IPv4 localhost
    if (remoteAddress === "127.0.0.1" || remoteAddress === "localhost") {
      return true;
    }
    // Check for IPv6 localhost
    if (remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1") {
      return true;
    }
    // Check if it's a loopback interface
    if (remoteAddress.startsWith("127.") || remoteAddress.startsWith("::1")) {
      return true;
    }
    return false;
  }

  /**
   * Check if request has SAP connection headers
   */
  private hasSapHeaders(headers?: IncomingHttpHeaders): boolean {
    if (!headers) {
      return false;
    }
    const sapUrl = headers["x-sap-url"];
    const sapAuthType = headers["x-sap-auth-type"];
    return !!(sapUrl && sapAuthType);
  }

  /**
   * Constructor for the mcp_abap_adt_server class.
   */
  constructor(options?: ServerOptions) {
    this.allowProcessExit = options?.allowProcessExit ?? true;
    this.registerSignalHandlers = options?.registerSignalHandlers ?? true;

    // Check if .env file exists (was loaded at startup)
    // This is used to determine if we should restrict non-local connections
    this.hasEnvFile = fs.existsSync(envFilePath || path.resolve(process.cwd(), ".env"));

    if (options?.connection) {
      setAbapConnectionOverride(options.connection);
    } else {
      setAbapConnectionOverride(undefined);
    }

    if (!options?.connection) {
      setSapConfigOverride(options?.sapConfig);
    }

    // CHANGED: Don't validate config in constructor - will validate on actual ABAP requests
    // This allows creating server instance without .env file when using runtime config (e.g., from HTTP headers)
    try {
      if (options?.sapConfig) {
        this.sapConfig = options.sapConfig;
      } else if (!options?.connection) {
        // Try to get config, but don't fail if it's invalid - server should still initialize
        // Invalid config will be caught when handlers try to use it
        try {
          this.sapConfig = getConfig();
        } catch (configError) {
          // For stdio mode, we want the server to initialize even with invalid config
          // The error will be shown when user tries to use a tool
          // Check stdio mode using environment variable or stdin check (transportConfig not set yet)
          const isStdioMode = process.env.MCP_TRANSPORT === "stdio" || !process.stdin.isTTY;

          if (isStdioMode) {
            // In stdio mode, write error to stderr (safe for MCP protocol)
            process.stderr.write(`[MCP] ⚠ WARNING: Invalid SAP configuration: ${configError instanceof Error ? configError.message : String(configError)}\n`);
            process.stderr.write(`[MCP]   Server will start, but tools will fail until configuration is fixed.\n`);
          }

          logger.warn("SAP config invalid at initialization, will use placeholder", {
            type: "CONFIG_INVALID",
            error: configError instanceof Error ? configError.message : String(configError),
          });
          // Set a placeholder that will be replaced when valid config is provided
          this.sapConfig = { url: "http://placeholder", authType: "jwt", jwtToken: "placeholder" };
        }
      } else {
        this.sapConfig = { url: "http://injected-connection", authType: "jwt", jwtToken: "injected" };
      }
    } catch (error) {
      // If config is not available yet, that's OK - it will be provided later via setSapConfigOverride or DI
      logger.warn("SAP config not available at initialization, will use runtime config", {
        type: "CONFIG_DEFERRED",
        error: error instanceof Error ? error.message : String(error),
      });
      // Set a placeholder that will be replaced
      this.sapConfig = { url: "http://placeholder", authType: "jwt", jwtToken: "placeholder" };
    }

    try {
      this.transportConfig = options?.transportConfig ?? parseTransportConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Always write error to stderr (stderr is safe even in stdio mode)
      logger.error("Failed to parse transport configuration", {
        type: "TRANSPORT_CONFIG_ERROR",
        error: message,
      });
      process.stderr.write(`[MCP] ✗ ERROR: Failed to parse transport configuration: ${message}\n`);
      if (this.allowProcessExit) {
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      }
      throw error instanceof Error ? error : new Error(message);
    }

    // Create McpServer (for all transports)
    this.mcpServer = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    this.setupMcpServerHandlers(); // Setup handlers for McpServer
    if (this.registerSignalHandlers) {
      this.setupSignalHandlers();
    }

    if (this.transportConfig.type === "streamable-http") {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        enableJsonResponse: this.transportConfig.enableJsonResponse,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else if (this.transportConfig.type === "sse") {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else {
      logger.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
      });
    }
  }

  /**
   * Creates a new McpServer instance with all handlers registered
   * Used for SSE sessions where each session needs its own server instance
   * @private
   */
  private createMcpServerForSession(): McpServer {
    const server = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    // Register all tools using the same method as main server
    this.registerAllToolsOnServer(server);

    return server;
  }

  /**
   * Converts JSON Schema to Zod schema object (not z.object(), but object with Zod fields)
   * SDK expects inputSchema to be an object with Zod schemas as values, not z.object()
   */
  private jsonSchemaToZod(jsonSchema: any): any {
    // If already a Zod schema object (object with Zod fields), return as-is
    if (jsonSchema && typeof jsonSchema === 'object' && !jsonSchema.type && !jsonSchema.properties) {
      // Check if it looks like a Zod schema object (has Zod types as values)
      const firstValue = Object.values(jsonSchema)[0];
      if (firstValue && ((firstValue as any).def || (firstValue as any)._def || typeof (firstValue as any).parse === 'function')) {
        return jsonSchema;
      }
    }

    // If it's a JSON Schema object
    if (jsonSchema && typeof jsonSchema === 'object' && jsonSchema.type === 'object' && jsonSchema.properties) {
      const zodShape: Record<string, z.ZodTypeAny> = {};
      const required = jsonSchema.required || [];

      for (const [key, prop] of Object.entries(jsonSchema.properties)) {
        const propSchema = prop as any;
        let zodType: z.ZodTypeAny;

        if (propSchema.type === 'string') {
          if (propSchema.enum && Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
            // Use z.enum() for enum values (requires at least 1 element, but z.enum needs 2+)
            if (propSchema.enum.length === 1) {
              zodType = z.literal(propSchema.enum[0]);
            } else {
              zodType = z.enum(propSchema.enum as [string, ...string[]]);
            }
          } else {
            zodType = z.string();
          }
        } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
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
            for (const [nestedKey, nestedProp] of Object.entries(items.properties)) {
              const nestedPropSchema = nestedProp as any;
              let nestedZodType: z.ZodTypeAny;
              if (nestedPropSchema.type === 'string') {
                if (nestedPropSchema.enum && Array.isArray(nestedPropSchema.enum) && nestedPropSchema.enum.length > 0) {
                  if (nestedPropSchema.enum.length === 1) {
                    nestedZodType = z.literal(nestedPropSchema.enum[0]);
                  } else {
                    nestedZodType = z.enum(nestedPropSchema.enum as [string, ...string[]]);
                  }
                } else {
                  nestedZodType = z.string();
                }
              } else if (nestedPropSchema.type === 'number' || nestedPropSchema.type === 'integer') {
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
                nestedZodType = nestedZodType.describe(nestedPropSchema.description);
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
          for (const [nestedKey, nestedProp] of Object.entries(propSchema.properties)) {
            const nestedPropSchema = nestedProp as any;
            let nestedZodType: z.ZodTypeAny;
            if (nestedPropSchema.type === 'string') {
              if (nestedPropSchema.enum && Array.isArray(nestedPropSchema.enum)) {
                nestedZodType = z.enum(nestedPropSchema.enum as [string, ...string[]]);
              } else {
                nestedZodType = z.string();
              }
            } else if (nestedPropSchema.type === 'number' || nestedPropSchema.type === 'integer') {
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
              nestedZodType = nestedZodType.describe(nestedPropSchema.description);
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
    handler: (args: any) => Promise<any>
  ) {
    // Convert JSON Schema to Zod if needed, otherwise pass as-is (like in the example)
    const zodSchema = (inputSchema && typeof inputSchema === 'object' && inputSchema.type === 'object' && inputSchema.properties)
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
          const errorText = result.content
            ?.map((item: any) => {
              if (item?.type === "json" && item.json !== undefined) {
                return JSON.stringify(item.json);
              }
              return item?.text || String(item);
            })
            .join("\n") || "Unknown error";
          throw new McpError(ErrorCode.InternalError, errorText);
        }

        // Convert content to MCP format - JSON items become text
        const content = (result.content || []).map((item: any) => {
          if (item?.type === "json" && item.json !== undefined) {
            return {
              type: "text" as const,
              text: JSON.stringify(item.json),
            };
          }
          return {
            type: "text" as const,
            text: item?.text || String(item || ""),
          };
        });

        return { content };
      }
    );
  }

  /**
   * Registers all tools on a McpServer instance
   * Used for both main server and per-session servers
   */
  private registerAllToolsOnServer(server: McpServer) {
    this.registerToolOnServer(server, GetProgram_Tool.name, GetProgram_Tool.description, GetProgram_Tool.inputSchema as any, handleGetProgram);
    this.registerToolOnServer(server, GetClass_Tool.name, GetClass_Tool.description, GetClass_Tool.inputSchema as any, handleGetClass);
    this.registerToolOnServer(server, GetFunction_Tool.name, GetFunction_Tool.description, GetFunction_Tool.inputSchema as any, handleGetFunction);
    this.registerToolOnServer(server, GetFunctionGroup_Tool.name, GetFunctionGroup_Tool.description, GetFunctionGroup_Tool.inputSchema as any, handleGetFunctionGroup);
    this.registerToolOnServer(server, GetTable_Tool.name, GetTable_Tool.description, GetTable_Tool.inputSchema as any, handleGetTable);
    this.registerToolOnServer(server, GetStructure_Tool.name, GetStructure_Tool.description, GetStructure_Tool.inputSchema as any, handleGetStructure);
    this.registerToolOnServer(server, GetTableContents_Tool.name, GetTableContents_Tool.description, GetTableContents_Tool.inputSchema as any, handleGetTableContents);
    this.registerToolOnServer(server, GetPackage_Tool.name, GetPackage_Tool.description, GetPackage_Tool.inputSchema as any, handleGetPackage);
    this.registerToolOnServer(server, CreatePackage_Tool.name, CreatePackage_Tool.description, CreatePackage_Tool.inputSchema as any, handleCreatePackage);
    this.registerToolOnServer(server, UpdatePackage_Tool.name, UpdatePackage_Tool.description, UpdatePackage_Tool.inputSchema as any, handleUpdatePackage);
    this.registerToolOnServer(server, UnlockPackage_Tool.name, UnlockPackage_Tool.description, UnlockPackage_Tool.inputSchema as any, handleUnlockPackage);
    this.registerToolOnServer(server, GetInclude_Tool.name, GetInclude_Tool.description, GetInclude_Tool.inputSchema as any, handleGetInclude);
    this.registerToolOnServer(server, GetIncludesList_Tool.name, GetIncludesList_Tool.description, GetIncludesList_Tool.inputSchema as any, handleGetIncludesList);
    this.registerToolOnServer(server, GetTypeInfo_Tool.name, GetTypeInfo_Tool.description, GetTypeInfo_Tool.inputSchema as any, handleGetTypeInfo);
    this.registerToolOnServer(server, GetInterface_Tool.name, GetInterface_Tool.description, GetInterface_Tool.inputSchema as any, handleGetInterface);
    this.registerToolOnServer(server, GetTransaction_Tool.name, GetTransaction_Tool.description, GetTransaction_Tool.inputSchema as any, handleGetTransaction);
    this.registerToolOnServer(server, SearchObject_Tool.name, SearchObject_Tool.description, SearchObject_Tool.inputSchema as any, handleSearchObject);
    this.registerToolOnServer(server, GetEnhancements_Tool.name, GetEnhancements_Tool.description, GetEnhancements_Tool.inputSchema as any, handleGetEnhancements);
    this.registerToolOnServer(server, GetEnhancementSpot_Tool.name, GetEnhancementSpot_Tool.description, GetEnhancementSpot_Tool.inputSchema as any, handleGetEnhancementSpot);
    this.registerToolOnServer(server, GetEnhancementImpl_Tool.name, GetEnhancementImpl_Tool.description, GetEnhancementImpl_Tool.inputSchema as any, handleGetEnhancementImpl);
    this.registerToolOnServer(server, GetBdef_Tool.name, GetBdef_Tool.description, GetBdef_Tool.inputSchema as any, handleGetBdef);
    this.registerToolOnServer(server, GetSqlQuery_Tool.name, GetSqlQuery_Tool.description, GetSqlQuery_Tool.inputSchema as any, handleGetSqlQuery);
    this.registerToolOnServer(server, GetWhereUsed_Tool.name, GetWhereUsed_Tool.description, GetWhereUsed_Tool.inputSchema as any, handleGetWhereUsed);
    this.registerToolOnServer(server, GetObjectInfo_Tool.name, GetObjectInfo_Tool.description, GetObjectInfo_Tool.inputSchema as any, async (args: any) => {
      if (!args || typeof args !== "object") {
        throw new McpError(ErrorCode.InvalidParams, "Missing or invalid arguments for GetObjectInfo");
      }
      return await handleGetObjectInfo(args as { parent_type: string; parent_name: string });
    });
    this.registerToolOnServer(server, GetAbapAST_Tool.name, GetAbapAST_Tool.description, GetAbapAST_Tool.inputSchema as any, handleGetAbapAST);
    this.registerToolOnServer(server, GetAbapSemanticAnalysis_Tool.name, GetAbapSemanticAnalysis_Tool.description, GetAbapSemanticAnalysis_Tool.inputSchema as any, handleGetAbapSemanticAnalysis);
    this.registerToolOnServer(server, GetAbapSystemSymbols_Tool.name, GetAbapSystemSymbols_Tool.description, GetAbapSystemSymbols_Tool.inputSchema as any, handleGetAbapSystemSymbols);
    this.registerToolOnServer(server, GetDomain_Tool.name, GetDomain_Tool.description, GetDomain_Tool.inputSchema as any, handleGetDomain);
    this.registerToolOnServer(server, CreateDomain_Tool.name, CreateDomain_Tool.description, CreateDomain_Tool.inputSchema as any, handleCreateDomain);
    this.registerToolOnServer(server, UpdateDomainLow_Tool.name, UpdateDomainLow_Tool.description, UpdateDomainLow_Tool.inputSchema as any, handleUpdateDomain);
    this.registerToolOnServer(server, UpdateDomainHigh_Tool.name, UpdateDomainHigh_Tool.description, UpdateDomainHigh_Tool.inputSchema as any, handleUpdateDomainHigh);
    this.registerToolOnServer(server, CreateDataElement_Tool.name, CreateDataElement_Tool.description, CreateDataElement_Tool.inputSchema as any, handleCreateDataElement);
    this.registerToolOnServer(server, UpdateDataElementLow_Tool.name, UpdateDataElementLow_Tool.description, UpdateDataElementLow_Tool.inputSchema as any, handleUpdateDataElement);
    this.registerToolOnServer(server, UpdateDataElementHigh_Tool.name, UpdateDataElementHigh_Tool.description, UpdateDataElementHigh_Tool.inputSchema as any, handleUpdateDataElementHigh);
    this.registerToolOnServer(server, GetDataElement_Tool.name, GetDataElement_Tool.description, GetDataElement_Tool.inputSchema as any, handleGetDataElement);
    this.registerToolOnServer(server, CreateTransport_Tool.name, CreateTransport_Tool.description, CreateTransport_Tool.inputSchema as any, handleCreateTransport);
    this.registerToolOnServer(server, GetTransport_Tool.name, GetTransport_Tool.description, GetTransport_Tool.inputSchema as any, handleGetTransport);
    this.registerToolOnServer(server, CreateTable_Tool.name, CreateTable_Tool.description, CreateTable_Tool.inputSchema as any, handleCreateTable);
    this.registerToolOnServer(server, UpdateTable_Tool.name, UpdateTable_Tool.description, UpdateTable_Tool.inputSchema as any, handleUpdateTable);
    this.registerToolOnServer(server, CreateStructure_Tool.name, CreateStructure_Tool.description, CreateStructure_Tool.inputSchema as any, handleCreateStructure);
    this.registerToolOnServer(server, UpdateStructure_Tool.name, UpdateStructure_Tool.description, UpdateStructure_Tool.inputSchema as any, handleUpdateStructure);
    this.registerToolOnServer(server, CreateView_Tool.name, CreateView_Tool.description, CreateView_Tool.inputSchema as any, handleCreateView);
    this.registerToolOnServer(server, GetView_Tool.name, GetView_Tool.description, GetView_Tool.inputSchema as any, handleGetView);
    this.registerToolOnServer(server, GetServiceDefinition_Tool.name, GetServiceDefinition_Tool.description, GetServiceDefinition_Tool.inputSchema as any, handleGetServiceDefinition);
    this.registerToolOnServer(server, UpdateView_Tool.name, UpdateView_Tool.description, UpdateView_Tool.inputSchema as any, handleUpdateViewLow);
    this.registerToolOnServer(server, CreateClass_Tool.name, CreateClass_Tool.description, CreateClass_Tool.inputSchema as any, handleCreateClass);
    this.registerToolOnServer(server, UpdateClass_Tool.name, UpdateClass_Tool.description, UpdateClass_Tool.inputSchema as any, handleUpdateClassLow);
    this.registerToolOnServer(server, UpdateClassHigh_Tool.name, UpdateClassHigh_Tool.description, UpdateClassHigh_Tool.inputSchema as any, handleUpdateClassHigh);
    this.registerToolOnServer(server, CreateProgram_Tool.name, CreateProgram_Tool.description, CreateProgram_Tool.inputSchema as any, handleCreateProgram);
    this.registerToolOnServer(server, UpdateProgram_Tool.name, UpdateProgram_Tool.description, UpdateProgram_Tool.inputSchema as any, handleUpdateProgramLow);
    this.registerToolOnServer(server, UpdateProgramHigh_Tool.name, UpdateProgramHigh_Tool.description, UpdateProgramHigh_Tool.inputSchema as any, handleUpdateProgramHigh);
    this.registerToolOnServer(server, CreateInterface_Tool.name, CreateInterface_Tool.description, CreateInterface_Tool.inputSchema as any, handleCreateInterface);
    this.registerToolOnServer(server, UpdateInterface_Tool.name, UpdateInterface_Tool.description, UpdateInterface_Tool.inputSchema as any, handleUpdateInterfaceLow);
    this.registerToolOnServer(server, CreateFunctionGroup_Tool.name, CreateFunctionGroup_Tool.description, CreateFunctionGroup_Tool.inputSchema as any, handleCreateFunctionGroup);
    this.registerToolOnServer(server, CreateFunctionModule_Tool.name, CreateFunctionModule_Tool.description, CreateFunctionModule_Tool.inputSchema as any, handleCreateFunctionModule);
    this.registerToolOnServer(server, UpdateFunctionModule_Tool.name, UpdateFunctionModule_Tool.description, UpdateFunctionModule_Tool.inputSchema as any, handleUpdateFunctionModuleLow);
    this.registerToolOnServer(server, UpdateViewHigh_Tool.name, UpdateViewHigh_Tool.description, UpdateViewHigh_Tool.inputSchema as any, handleUpdateViewHigh);
    this.registerToolOnServer(server, UpdateInterfaceHigh_Tool.name, UpdateInterfaceHigh_Tool.description, UpdateInterfaceHigh_Tool.inputSchema as any, handleUpdateInterfaceHigh);
    this.registerToolOnServer(server, UpdateFunctionModuleHigh_Tool.name, UpdateFunctionModuleHigh_Tool.description, UpdateFunctionModuleHigh_Tool.inputSchema as any, handleUpdateFunctionModuleHigh);
    this.registerToolOnServer(server, ActivateObject_Tool.name, ActivateObject_Tool.description, ActivateObject_Tool.inputSchema as any, handleActivateObject);
    this.registerToolOnServer(server, DeleteObject_Tool.name, DeleteObject_Tool.description, DeleteObject_Tool.inputSchema as any, handleDeleteObject);
    this.registerToolOnServer(server, CheckObject_Tool.name, CheckObject_Tool.description, CheckObject_Tool.inputSchema as any, handleCheckObject);
    this.registerToolOnServer(server, GetSession_Tool.name, GetSession_Tool.description, GetSession_Tool.inputSchema as any, handleGetSession);
    this.registerToolOnServer(server, ValidateObject_Tool.name, ValidateObject_Tool.description, ValidateObject_Tool.inputSchema as any, handleValidateObject);
    this.registerToolOnServer(server, LockObject_Tool.name, LockObject_Tool.description, LockObject_Tool.inputSchema as any, handleLockObject);
    this.registerToolOnServer(server, UnlockObject_Tool.name, UnlockObject_Tool.description, UnlockObject_Tool.inputSchema as any, handleUnlockObject);
    this.registerToolOnServer(server, ValidateClass_Tool.name, ValidateClass_Tool.description, ValidateClass_Tool.inputSchema as any, handleValidateClass);
    this.registerToolOnServer(server, CheckClass_Tool.name, CheckClass_Tool.description, CheckClass_Tool.inputSchema as any, handleCheckClass);
    this.registerToolOnServer(server, ValidateTable_Tool.name, ValidateTable_Tool.description, ValidateTable_Tool.inputSchema as any, handleValidateTable);
    this.registerToolOnServer(server, CheckTable_Tool.name, CheckTable_Tool.description, CheckTable_Tool.inputSchema as any, handleCheckTable);
    this.registerToolOnServer(server, ValidateFunctionModule_Tool.name, ValidateFunctionModule_Tool.description, ValidateFunctionModule_Tool.inputSchema as any, handleValidateFunctionModule);
    this.registerToolOnServer(server, CheckFunctionModule_Tool.name, CheckFunctionModule_Tool.description, CheckFunctionModule_Tool.inputSchema as any, handleCheckFunctionModule);
    this.registerToolOnServer(server, CreateBdef_Tool.name, CreateBdef_Tool.description, CreateBdef_Tool.inputSchema as any, handleCreateBehaviorDefinition);
    this.registerToolOnServer(server, UpdateBdef_Tool.name, UpdateBdef_Tool.description, UpdateBdef_Tool.inputSchema as any, handleUpdateBehaviorDefinitionHigh);
    this.registerToolOnServer(server, UpdateBehaviorDefinitionLow_Tool.name, UpdateBehaviorDefinitionLow_Tool.description, UpdateBehaviorDefinitionLow_Tool.inputSchema as any, handleUpdateBehaviorDefinitionLow);
    this.registerToolOnServer(server, CreateDdlx_Tool.name, CreateDdlx_Tool.description, CreateDdlx_Tool.inputSchema as any, handleCreateMetadataExtension);
    this.registerToolOnServer(server, UpdateDdlx_Tool.name, UpdateDdlx_Tool.description, UpdateDdlx_Tool.inputSchema as any, handleUpdateMetadataExtensionHigh);
    this.registerToolOnServer(server, UpdateMetadataExtensionLow_Tool.name, UpdateMetadataExtensionLow_Tool.description, UpdateMetadataExtensionLow_Tool.inputSchema as any, handleUpdateMetadataExtensionLow);
    this.registerToolOnServer(server, GetInactiveObjects_Tool.name, GetInactiveObjects_Tool.description, GetInactiveObjects_Tool.inputSchema as any, handleGetInactiveObjects);

    // New low-level handlers registration
    this.registerToolOnServer(server, DeleteClass_Tool.name, DeleteClass_Tool.description, DeleteClass_Tool.inputSchema as any, handleDeleteClass);
    this.registerToolOnServer(server, LockClass_Tool.name, LockClass_Tool.description, LockClass_Tool.inputSchema as any, handleLockClass);
    this.registerToolOnServer(server, UnlockClass_Tool.name, UnlockClass_Tool.description, UnlockClass_Tool.inputSchema as any, handleUnlockClass);
    this.registerToolOnServer(server, CreateClassLow_Tool.name, CreateClassLow_Tool.description, CreateClassLow_Tool.inputSchema as any, handleCreateClassLow);
    this.registerToolOnServer(server, LockClassTestClasses_Tool.name, LockClassTestClasses_Tool.description, LockClassTestClasses_Tool.inputSchema as any, handleLockClassTestClasses);
    this.registerToolOnServer(server, UnlockClassTestClasses_Tool.name, UnlockClassTestClasses_Tool.description, UnlockClassTestClasses_Tool.inputSchema as any, handleUnlockClassTestClasses);
    this.registerToolOnServer(server, UpdateClassTestClasses_Tool.name, UpdateClassTestClasses_Tool.description, UpdateClassTestClasses_Tool.inputSchema as any, handleUpdateClassTestClasses);
    this.registerToolOnServer(server, ActivateClassTestClasses_Tool.name, ActivateClassTestClasses_Tool.description, ActivateClassTestClasses_Tool.inputSchema as any, handleActivateClassTestClasses);
    this.registerToolOnServer(server, RunClassUnitTests_Tool.name, RunClassUnitTests_Tool.description, RunClassUnitTests_Tool.inputSchema as any, handleRunClassUnitTests);
    this.registerToolOnServer(server, GetClassUnitTestStatus_Tool.name, GetClassUnitTestStatus_Tool.description, GetClassUnitTestStatus_Tool.inputSchema as any, handleGetClassUnitTestStatus);
    this.registerToolOnServer(server, GetClassUnitTestResult_Tool.name, GetClassUnitTestResult_Tool.description, GetClassUnitTestResult_Tool.inputSchema as any, handleGetClassUnitTestResult);
    this.registerToolOnServer(server, CheckProgram_Tool.name, CheckProgram_Tool.description, CheckProgram_Tool.inputSchema as any, handleCheckProgram);
    this.registerToolOnServer(server, DeleteProgram_Tool.name, DeleteProgram_Tool.description, DeleteProgram_Tool.inputSchema as any, handleDeleteProgram);
    this.registerToolOnServer(server, LockProgram_Tool.name, LockProgram_Tool.description, LockProgram_Tool.inputSchema as any, handleLockProgram);
    this.registerToolOnServer(server, UnlockProgram_Tool.name, UnlockProgram_Tool.description, UnlockProgram_Tool.inputSchema as any, handleUnlockProgram);
    this.registerToolOnServer(server, ValidateProgram_Tool.name, ValidateProgram_Tool.description, ValidateProgram_Tool.inputSchema as any, handleValidateProgram);
    this.registerToolOnServer(server, CreateProgramLow_Tool.name, CreateProgramLow_Tool.description, CreateProgramLow_Tool.inputSchema as any, handleCreateProgramLow);
    this.registerToolOnServer(server, CheckInterface_Tool.name, CheckInterface_Tool.description, CheckInterface_Tool.inputSchema as any, handleCheckInterface);
    this.registerToolOnServer(server, DeleteInterface_Tool.name, DeleteInterface_Tool.description, DeleteInterface_Tool.inputSchema as any, handleDeleteInterface);
    this.registerToolOnServer(server, LockInterface_Tool.name, LockInterface_Tool.description, LockInterface_Tool.inputSchema as any, handleLockInterface);
    this.registerToolOnServer(server, UnlockInterface_Tool.name, UnlockInterface_Tool.description, UnlockInterface_Tool.inputSchema as any, handleUnlockInterface);
    this.registerToolOnServer(server, ValidateInterface_Tool.name, ValidateInterface_Tool.description, ValidateInterface_Tool.inputSchema as any, handleValidateInterface);
    this.registerToolOnServer(server, CreateInterfaceLow_Tool.name, CreateInterfaceLow_Tool.description, CreateInterfaceLow_Tool.inputSchema as any, handleCreateInterfaceLow);
    this.registerToolOnServer(server, CheckFunctionGroup_Tool.name, CheckFunctionGroup_Tool.description, CheckFunctionGroup_Tool.inputSchema as any, handleCheckFunctionGroup);
    this.registerToolOnServer(server, DeleteFunctionGroup_Tool.name, DeleteFunctionGroup_Tool.description, DeleteFunctionGroup_Tool.inputSchema as any, handleDeleteFunctionGroup);
    this.registerToolOnServer(server, DeleteFunctionModule_Tool.name, DeleteFunctionModule_Tool.description, DeleteFunctionModule_Tool.inputSchema as any, handleDeleteFunctionModule);
    this.registerToolOnServer(server, LockFunctionGroup_Tool.name, LockFunctionGroup_Tool.description, LockFunctionGroup_Tool.inputSchema as any, handleLockFunctionGroup);
    this.registerToolOnServer(server, LockFunctionModule_Tool.name, LockFunctionModule_Tool.description, LockFunctionModule_Tool.inputSchema as any, handleLockFunctionModule);
    this.registerToolOnServer(server, UnlockFunctionGroup_Tool.name, UnlockFunctionGroup_Tool.description, UnlockFunctionGroup_Tool.inputSchema as any, handleUnlockFunctionGroup);
    this.registerToolOnServer(server, UnlockFunctionModule_Tool.name, UnlockFunctionModule_Tool.description, UnlockFunctionModule_Tool.inputSchema as any, handleUnlockFunctionModule);
    this.registerToolOnServer(server, ValidateFunctionGroup_Tool.name, ValidateFunctionGroup_Tool.description, ValidateFunctionGroup_Tool.inputSchema as any, handleValidateFunctionGroup);
    this.registerToolOnServer(server, CreateFunctionGroupLow_Tool.name, CreateFunctionGroupLow_Tool.description, CreateFunctionGroupLow_Tool.inputSchema as any, handleCreateFunctionGroupLow);
    this.registerToolOnServer(server, CreateFunctionModuleLow_Tool.name, CreateFunctionModuleLow_Tool.description, CreateFunctionModuleLow_Tool.inputSchema as any, handleCreateFunctionModuleLow);
    this.registerToolOnServer(server, CheckDataElement_Tool.name, CheckDataElement_Tool.description, CheckDataElement_Tool.inputSchema as any, handleCheckDataElement);
    this.registerToolOnServer(server, DeleteDataElement_Tool.name, DeleteDataElement_Tool.description, DeleteDataElement_Tool.inputSchema as any, handleDeleteDataElement);
    this.registerToolOnServer(server, LockDataElement_Tool.name, LockDataElement_Tool.description, LockDataElement_Tool.inputSchema as any, handleLockDataElement);
    this.registerToolOnServer(server, UnlockDataElement_Tool.name, UnlockDataElement_Tool.description, UnlockDataElement_Tool.inputSchema as any, handleUnlockDataElement);
    this.registerToolOnServer(server, ValidateDataElement_Tool.name, ValidateDataElement_Tool.description, ValidateDataElement_Tool.inputSchema as any, handleValidateDataElement);
    this.registerToolOnServer(server, CreateDataElementLow_Tool.name, CreateDataElementLow_Tool.description, CreateDataElementLow_Tool.inputSchema as any, handleCreateDataElementLow);
    this.registerToolOnServer(server, CheckDomain_Tool.name, CheckDomain_Tool.description, CheckDomain_Tool.inputSchema as any, handleCheckDomain);
    this.registerToolOnServer(server, DeleteDomain_Tool.name, DeleteDomain_Tool.description, DeleteDomain_Tool.inputSchema as any, handleDeleteDomain);
    this.registerToolOnServer(server, LockDomain_Tool.name, LockDomain_Tool.description, LockDomain_Tool.inputSchema as any, handleLockDomain);
    this.registerToolOnServer(server, UnlockDomain_Tool.name, UnlockDomain_Tool.description, UnlockDomain_Tool.inputSchema as any, handleUnlockDomain);
    this.registerToolOnServer(server, ValidateDomain_Tool.name, ValidateDomain_Tool.description, ValidateDomain_Tool.inputSchema as any, handleValidateDomain);
    this.registerToolOnServer(server, CreateDomainLow_Tool.name, CreateDomainLow_Tool.description, CreateDomainLow_Tool.inputSchema as any, handleCreateDomainLow);
    this.registerToolOnServer(server, CheckStructure_Tool.name, CheckStructure_Tool.description, CheckStructure_Tool.inputSchema as any, handleCheckStructure);
    this.registerToolOnServer(server, DeleteStructure_Tool.name, DeleteStructure_Tool.description, DeleteStructure_Tool.inputSchema as any, handleDeleteStructure);
    this.registerToolOnServer(server, LockStructure_Tool.name, LockStructure_Tool.description, LockStructure_Tool.inputSchema as any, handleLockStructure);
    this.registerToolOnServer(server, UnlockStructure_Tool.name, UnlockStructure_Tool.description, UnlockStructure_Tool.inputSchema as any, handleUnlockStructure);
    this.registerToolOnServer(server, ValidateStructure_Tool.name, ValidateStructure_Tool.description, ValidateStructure_Tool.inputSchema as any, handleValidateStructure);
    this.registerToolOnServer(server, CreateStructureLow_Tool.name, CreateStructureLow_Tool.description, CreateStructureLow_Tool.inputSchema as any, handleCreateStructureLow);
    this.registerToolOnServer(server, DeleteTable_Tool.name, DeleteTable_Tool.description, DeleteTable_Tool.inputSchema as any, handleDeleteTable);
    this.registerToolOnServer(server, LockTable_Tool.name, LockTable_Tool.description, LockTable_Tool.inputSchema as any, handleLockTable);
    this.registerToolOnServer(server, UnlockTable_Tool.name, UnlockTable_Tool.description, UnlockTable_Tool.inputSchema as any, handleUnlockTable);
    this.registerToolOnServer(server, CreateTableLow_Tool.name, CreateTableLow_Tool.description, CreateTableLow_Tool.inputSchema as any, handleCreateTableLow);
    this.registerToolOnServer(server, CheckView_Tool.name, CheckView_Tool.description, CheckView_Tool.inputSchema as any, handleCheckView);
    this.registerToolOnServer(server, DeleteView_Tool.name, DeleteView_Tool.description, DeleteView_Tool.inputSchema as any, handleDeleteView);
    this.registerToolOnServer(server, LockView_Tool.name, LockView_Tool.description, LockView_Tool.inputSchema as any, handleLockView);
    this.registerToolOnServer(server, UnlockView_Tool.name, UnlockView_Tool.description, UnlockView_Tool.inputSchema as any, handleUnlockView);
    this.registerToolOnServer(server, ValidateView_Tool.name, ValidateView_Tool.description, ValidateView_Tool.inputSchema as any, handleValidateView);
    this.registerToolOnServer(server, CreateViewLow_Tool.name, CreateViewLow_Tool.description, CreateViewLow_Tool.inputSchema as any, handleCreateViewLow);
    this.registerToolOnServer(server, CheckPackage_Tool.name, CheckPackage_Tool.description, CheckPackage_Tool.inputSchema as any, handleCheckPackage);
    this.registerToolOnServer(server, DeletePackage_Tool.name, DeletePackage_Tool.description, DeletePackage_Tool.inputSchema as any, handleDeletePackage);
    this.registerToolOnServer(server, LockPackage_Tool.name, LockPackage_Tool.description, LockPackage_Tool.inputSchema as any, handleLockPackage);
    this.registerToolOnServer(server, ValidatePackage_Tool.name, ValidatePackage_Tool.description, ValidatePackage_Tool.inputSchema as any, handleValidatePackage);
    this.registerToolOnServer(server, CreatePackageLow_Tool.name, CreatePackageLow_Tool.description, CreatePackageLow_Tool.inputSchema as any, handleCreatePackageLow);
    this.registerToolOnServer(server, CreateTransportLow_Tool.name, CreateTransportLow_Tool.description, CreateTransportLow_Tool.inputSchema as any, handleCreateTransportLow);
    this.registerToolOnServer(server, CheckBehaviorDefinition_Tool.name, CheckBehaviorDefinition_Tool.description, CheckBehaviorDefinition_Tool.inputSchema as any, handleCheckBehaviorDefinition);
    this.registerToolOnServer(server, DeleteBehaviorDefinition_Tool.name, DeleteBehaviorDefinition_Tool.description, DeleteBehaviorDefinition_Tool.inputSchema as any, handleDeleteBehaviorDefinition);
    this.registerToolOnServer(server, LockBehaviorDefinition_Tool.name, LockBehaviorDefinition_Tool.description, LockBehaviorDefinition_Tool.inputSchema as any, handleLockBehaviorDefinition);
    this.registerToolOnServer(server, UnlockBehaviorDefinition_Tool.name, UnlockBehaviorDefinition_Tool.description, UnlockBehaviorDefinition_Tool.inputSchema as any, handleUnlockBehaviorDefinition);
    this.registerToolOnServer(server, ValidateBehaviorDefinition_Tool.name, ValidateBehaviorDefinition_Tool.description, ValidateBehaviorDefinition_Tool.inputSchema as any, handleValidateBehaviorDefinition);
    this.registerToolOnServer(server, CreateBehaviorDefinitionLow_Tool.name, CreateBehaviorDefinitionLow_Tool.description, CreateBehaviorDefinitionLow_Tool.inputSchema as any, handleCreateBehaviorDefinitionLow);
    this.registerToolOnServer(server, CheckMetadataExtension_Tool.name, CheckMetadataExtension_Tool.description, CheckMetadataExtension_Tool.inputSchema as any, handleCheckMetadataExtension);
    this.registerToolOnServer(server, DeleteMetadataExtension_Tool.name, DeleteMetadataExtension_Tool.description, DeleteMetadataExtension_Tool.inputSchema as any, handleDeleteMetadataExtension);
    this.registerToolOnServer(server, LockMetadataExtension_Tool.name, LockMetadataExtension_Tool.description, LockMetadataExtension_Tool.inputSchema as any, handleLockMetadataExtension);
    this.registerToolOnServer(server, UnlockMetadataExtension_Tool.name, UnlockMetadataExtension_Tool.description, UnlockMetadataExtension_Tool.inputSchema as any, handleUnlockMetadataExtension);
    this.registerToolOnServer(server, ValidateMetadataExtension_Tool.name, ValidateMetadataExtension_Tool.description, ValidateMetadataExtension_Tool.inputSchema as any, handleValidateMetadataExtension);
    this.registerToolOnServer(server, CreateMetadataExtensionLow_Tool.name, CreateMetadataExtensionLow_Tool.description, CreateMetadataExtensionLow_Tool.inputSchema as any, handleCreateMetadataExtensionLow);
    this.registerToolOnServer(server, ActivateProgram_Tool.name, ActivateProgram_Tool.description, ActivateProgram_Tool.inputSchema as any, handleActivateProgram);
    this.registerToolOnServer(server, ActivateClass_Tool.name, ActivateClass_Tool.description, ActivateClass_Tool.inputSchema as any, handleActivateClass);
    this.registerToolOnServer(server, ActivateInterface_Tool.name, ActivateInterface_Tool.description, ActivateInterface_Tool.inputSchema as any, handleActivateInterface);
    this.registerToolOnServer(server, ActivateFunctionModule_Tool.name, ActivateFunctionModule_Tool.description, ActivateFunctionModule_Tool.inputSchema as any, handleActivateFunctionModule);
    this.registerToolOnServer(server, ActivateFunctionGroup_Tool.name, ActivateFunctionGroup_Tool.description, ActivateFunctionGroup_Tool.inputSchema as any, handleActivateFunctionGroup);
    this.registerToolOnServer(server, ActivateDataElement_Tool.name, ActivateDataElement_Tool.description, ActivateDataElement_Tool.inputSchema as any, handleActivateDataElement);
    this.registerToolOnServer(server, ActivateDomain_Tool.name, ActivateDomain_Tool.description, ActivateDomain_Tool.inputSchema as any, handleActivateDomain);
    this.registerToolOnServer(server, ActivateStructure_Tool.name, ActivateStructure_Tool.description, ActivateStructure_Tool.inputSchema as any, handleActivateStructure);
    this.registerToolOnServer(server, ActivateTable_Tool.name, ActivateTable_Tool.description, ActivateTable_Tool.inputSchema as any, handleActivateTable);
    this.registerToolOnServer(server, ActivateView_Tool.name, ActivateView_Tool.description, ActivateView_Tool.inputSchema as any, handleActivateView);
    this.registerToolOnServer(server, ActivateBehaviorDefinition_Tool.name, ActivateBehaviorDefinition_Tool.description, ActivateBehaviorDefinition_Tool.inputSchema as any, handleActivateBehaviorDefinition);
    this.registerToolOnServer(server, ActivateMetadataExtension_Tool.name, ActivateMetadataExtension_Tool.description, ActivateMetadataExtension_Tool.inputSchema as any, handleActivateMetadataExtension);

    // Dynamic import tools
    this.registerToolOnServer(server, "GetAdtTypes", "Get all ADT types available in the system", { type: "object", properties: {}, required: [] } as any, async (args: any) => {
      return await (await import("./handlers/system/readonly/handleGetAllTypes.js")).handleGetAdtTypes(args);
    });
    this.registerToolOnServer(server, "GetObjectStructure", "Get object structure with includes hierarchy", { type: "object", properties: { object_name: { type: "string" }, object_type: { type: "string" } }, required: ["object_name", "object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/system/readonly/handleGetObjectStructure.js")).handleGetObjectStructure(args);
    });
    this.registerToolOnServer(server, "GetObjectsList", "Get list of objects by package", { type: "object", properties: { package_name: { type: "string" } }, required: ["package_name"] } as any, async (args: any) => {
      return await (await import("./handlers/search/readonly/handleGetObjectsList.js")).handleGetObjectsList(args);
    });
    this.registerToolOnServer(server, "GetObjectsByType", "Get objects by type", { type: "object", properties: { object_type: { type: "string" }, package_name: { type: "string" } }, required: ["object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/search/readonly/handleGetObjectsByType.js")).handleGetObjectsByType(args);
    });
    this.registerToolOnServer(server, "GetProgFullCode", "Get full program code with includes", { type: "object", properties: { program_name: { type: "string" } }, required: ["program_name"] } as any, async (args: any) => {
      return await (await import("./handlers/program/readonly/handleGetProgFullCode.js")).handleGetProgFullCode(args);
    });
    this.registerToolOnServer(server, "GetObjectNodeFromCache", "Get object node from cache", { type: "object", properties: { object_name: { type: "string" }, object_type: { type: "string" } }, required: ["object_name", "object_type"] } as any, async (args: any) => {
      return await (await import("./handlers/system/readonly/handleGetObjectNodeFromCache.js")).handleGetObjectNodeFromCache(args);
    });
    this.registerToolOnServer(server, "DescribeByList", "Describe objects by list", { type: "object", properties: { objects: { type: "array", items: { type: "string" } } }, required: ["objects"] } as any, async (args: any) => {
      return await (await import("./handlers/system/readonly/handleDescribeByList.js")).handleDescribeByList(args);
    });
  }

  /**
   * Sets up handlers for new McpServer using registerTool (recommended API)
   * @private
   */
  private setupMcpServerHandlers() {
    // Register all tools using TOOL_DEFINITION from handlers
    // McpServer automatically handles listTools requests for registered tools
    this.registerAllToolsOnServer(this.mcpServer);
  }

  private setupSignalHandlers() {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, () => {
        if (this.shuttingDown) {
          return;
        }
        this.shuttingDown = true;
        logger.info("Received shutdown signal", {
          type: "SERVER_SHUTDOWN_SIGNAL",
          signal,
          transport: this.transportConfig.type,
        });
        void this.shutdown().finally(() => {
          if (this.allowProcessExit) {
            process.exit(0);
          }
        });
      });
    }
  }

  private async shutdown() {
    try {
      await this.mcpServer.close();
    } catch (error) {
      logger.error("Failed to close MCP server", {
        type: "SERVER_SHUTDOWN_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Close all SSE sessions
    for (const [sessionId, session] of this.sseSessions.entries()) {
      try {
        await session.transport.close();
        session.server.server.close();
        logger.debug("SSE session closed during shutdown", {
          type: "SSE_SESSION_SHUTDOWN",
          sessionId,
        });
      } catch (error) {
        logger.error("Failed to close SSE session", {
          type: "SSE_SHUTDOWN_ERROR",
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }
    }
    this.sseSessions.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close((closeError) => {
          if (closeError) {
            logger.error("Failed to close HTTP server", {
              type: "HTTP_SERVER_SHUTDOWN_ERROR",
              error: closeError instanceof Error ? closeError.message : String(closeError),
            });
          }
          resolve();
        });
      });
      this.httpServer = undefined;
    }
  }

  /**
   * Starts the MCP server and connects it to the transport.
   */
  async run() {
    if (this.transportConfig.type === "stdio") {
      // Simple stdio setup like reference implementation
      const transport = new StdioServerTransport();
      await this.mcpServer.server.connect(transport);
      // Process stays alive waiting for messages from stdin
      return;
    }

    if (this.transportConfig.type === "streamable-http") {
      const httpConfig = this.transportConfig;

      // HTTP Server wrapper for StreamableHTTP transport (like the SDK example)
      const httpServer = createServer(async (req, res) => {
        // Only handle POST requests (like the example)
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        // HTTP: Restrict non-local connections if .env file exists and no SAP headers provided
        const remoteAddress = req.socket.remoteAddress;
        if (this.hasEnvFile && !this.hasSapHeaders(req.headers)) {
          if (!this.isLocalConnection(remoteAddress)) {
            logger.warn("HTTP: Non-local connection rejected (has .env but no SAP headers)", {
              type: "HTTP_NON_LOCAL_REJECTED",
              remoteAddress,
              hasEnvFile: this.hasEnvFile,
            });
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("Forbidden: Non-local connections require SAP connection headers (x-sap-url, x-sap-auth-type)");
            return;
          }
        }

        // Track client (like the example)
        const clientID = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        logger.debug("Client connected", {
          type: "STREAMABLE_HTTP_CLIENT_CONNECTED",
          clientID,
        });

        // Extract session ID from headers (like the example)
        const clientSessionId = (req.headers["x-session-id"] || req.headers["mcp-session-id"]) as string | undefined;

        let session = this.streamableHttpSessions.get(clientID);

        // If client sent session ID, try to find existing session
        if (clientSessionId && !session) {
          // Search for existing session by sessionId (client might have new IP:PORT)
          for (const [key, sess] of this.streamableHttpSessions.entries()) {
            if (sess.sessionId === clientSessionId) {
              session = sess;
              // Update clientID (port might have changed)
              this.streamableHttpSessions.delete(key);
              this.streamableHttpSessions.set(clientID, session);
              logger.debug("Existing session restored", {
                type: "STREAMABLE_HTTP_SESSION_RESTORED",
                sessionId: session.sessionId,
                clientID,
              });
              break;
            }
          }
        }

        // If no session found, create new one
        if (!session) {
          session = {
            sessionId: randomUUID(),
            clientIP: req.socket.remoteAddress || "unknown",
            connectedAt: new Date(),
            requestCount: 0,
          };
          this.streamableHttpSessions.set(clientID, session);
          logger.debug("New session created", {
            type: "STREAMABLE_HTTP_SESSION_CREATED",
            sessionId: session.sessionId,
            clientID,
            totalSessions: this.streamableHttpSessions.size,
          });
        }

        session.requestCount++;

        logger.debug("Request received", {
          type: "STREAMABLE_HTTP_REQUEST",
          sessionId: session.sessionId,
          requestNumber: session.requestCount,
          clientID,
        });

        // Handle client disconnect (like the example)
        req.on("close", () => {
          const closedSession = this.streamableHttpSessions.get(clientID);
          if (closedSession) {
            // Clean up connection cache for this session
            if (closedSession.sapConfig) {
              removeConnectionForSession(closedSession.sessionId, closedSession.sapConfig);
            }
            this.streamableHttpSessions.delete(clientID);
            logger.debug("Session closed", {
              type: "STREAMABLE_HTTP_SESSION_CLOSED",
              sessionId: closedSession.sessionId,
              requestCount: closedSession.requestCount,
              totalSessions: this.streamableHttpSessions.size,
            });
          }
        });

        try {
          // Apply auth headers before processing and store config in session
          this.applyAuthHeaders(req.headers, session.sessionId);

          // Get SAP config for this session (from headers or existing session)
          const sessionSapConfig = session.sapConfig || this.sapConfig;

          // Read request body (like the SDK example with Express)
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
            } catch (parseError) {
              // If body is not JSON, pass as string or null
              body = bodyString || null;
            }
          }

          // KEY MOMENT: Create new StreamableHTTP transport for each request (like the SDK example)
          // SDK automatically handles:
          // - Chunked transfer encoding
          // - Session tracking
          // - JSON-RPC protocol
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Stateless mode (like the SDK example)
            enableJsonResponse: httpConfig.enableJsonResponse,
            allowedOrigins: httpConfig.allowedOrigins,
            allowedHosts: httpConfig.allowedHosts,
            enableDnsRebindingProtection: httpConfig.enableDnsRebindingProtection,
          });

          // Close transport when response closes (like the SDK example)
          res.on("close", () => {
            transport.close();
          });

          // Connect transport to new McpServer (like the SDK example)
          await this.mcpServer.connect(transport);

          logger.debug("Transport connected", {
            type: "STREAMABLE_HTTP_TRANSPORT_CONNECTED",
            sessionId: session.sessionId,
            clientID,
          });

          // Run handlers in AsyncLocalStorage context with session info
          // This allows getManagedConnection() to access sessionId and config
          await sessionContext.run(
            {
              sessionId: session.sessionId,
              sapConfig: sessionSapConfig,
            },
            async () => {
              // Handle HTTP request through transport (like the SDK example)
              // Pass body as third parameter if available (like the SDK example)
              await transport.handleRequest(req, res, body);
            }
          );

          logger.debug("Request completed", {
            type: "STREAMABLE_HTTP_REQUEST_COMPLETED",
            sessionId: session.sessionId,
            clientID,
          });
        } catch (error) {
          logger.error("Failed to handle HTTP request", {
            type: "HTTP_REQUEST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId: session.sessionId,
            clientID,
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
      });

      httpServer.on("clientError", (err, socket) => {
        logger.error("HTTP client error", {
          type: "HTTP_CLIENT_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          logger.error("HTTP server failed to start", {
            type: "HTTP_SERVER_ERROR",
            error: error.message,
          });
          httpServer.off("error", onError);
          reject(error);
        };

        httpServer.once("error", onError);
        httpServer.listen(httpConfig.port, httpConfig.host, () => {
          httpServer.off("error", onError);
          logger.info("HTTP server listening", {
            type: "HTTP_SERVER_LISTENING",
            host: httpConfig.host,
            port: httpConfig.port,
            enableJsonResponse: httpConfig.enableJsonResponse,
          });
          resolve();
        });
      });

      this.httpServer = httpServer;
      return;
    }

    const sseConfig = this.transportConfig;
    const streamPathMap = new Map<string, string>([
      ["/", "/messages"],
      ["/mcp/events", "/mcp/messages"],
      ["/sse", "/messages"],
    ]);
    const streamPaths = Array.from(streamPathMap.keys());
    const postPathSet = new Set(streamPathMap.values());
    postPathSet.add("/messages");
    postPathSet.add("/mcp/messages");

    const httpServer = createServer(async (req, res) => {
      // SSE: Always restrict to local connections only
      const remoteAddress = req.socket.remoteAddress;
      if (!this.isLocalConnection(remoteAddress)) {
        logger.warn("SSE: Non-local connection rejected", {
          type: "SSE_NON_LOCAL_REJECTED",
          remoteAddress,
        });
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: SSE transport only accepts local connections");
        return;
      }

      const requestUrl = req.url ? new URL(req.url, `http://${req.headers.host ?? `${sseConfig.host}:${sseConfig.port}`}`) : undefined;
      let pathname = requestUrl?.pathname ?? "/";
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      this.applyAuthHeaders(req.headers);

      logger.debug("SSE request received", {
        type: "SSE_HTTP_REQUEST",
        method: req.method,
        pathname,
        originalUrl: req.url,
        headers: {
          accept: req.headers.accept,
          "content-type": req.headers["content-type"],
        },
      });

      // GET /sse, /mcp/events, or / - establish SSE connection
      if (req.method === "GET" && streamPathMap.has(pathname)) {
        const postEndpoint = streamPathMap.get(pathname) ?? "/messages";

        logger.debug("SSE client connecting", {
          type: "SSE_CLIENT_CONNECTING",
          pathname,
          postEndpoint,
        });

        // Create new McpServer instance for this session (like the working example)
        const server = this.createMcpServerForSession();

        // Create SSE transport
        const transport = new SSEServerTransport(postEndpoint, res, {
          allowedHosts: sseConfig.allowedHosts,
          allowedOrigins: sseConfig.allowedOrigins,
          enableDnsRebindingProtection: sseConfig.enableDnsRebindingProtection,
        });

        const sessionId = transport.sessionId;
        logger.info("New SSE session created", {
          type: "SSE_SESSION_CREATED",
          sessionId,
          pathname,
        });

        // Store transport and server for this session
        this.sseSessions.set(sessionId, {
          server,
          transport,
        });

        // Connect transport to server (using server.server like in the example)
        try {
          await server.server.connect(transport);
          logger.info("SSE transport connected", {
            type: "SSE_CONNECTION_READY",
            sessionId,
            pathname,
            postEndpoint,
          });
        } catch (error) {
          logger.error("Failed to connect SSE transport", {
            type: "SSE_CONNECT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          this.sseSessions.delete(sessionId);
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
          return;
        }

        // Cleanup on connection close
        res.on("close", () => {
          logger.info("SSE connection closed", {
            type: "SSE_CONNECTION_CLOSED",
            sessionId,
            pathname,
          });
          this.sseSessions.delete(sessionId);
          server.server.close();
        });

        transport.onerror = (error) => {
          logger.error("SSE transport error", {
            type: "SSE_TRANSPORT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
        };

        return;
      }

      // POST /messages or /mcp/messages - handle client messages
      if (req.method === "POST" && postPathSet.has(pathname)) {
        // Extract sessionId from query string or header
        let sessionId: string | undefined;
        if (requestUrl) {
          sessionId = requestUrl.searchParams.get("sessionId") || undefined;
        }
        if (!sessionId) {
          sessionId = req.headers["x-session-id"] as string | undefined;
        }

        logger.debug("SSE POST request received", {
          type: "SSE_POST_REQUEST",
          sessionId,
          pathname,
        });

        if (!sessionId || !this.sseSessions.has(sessionId)) {
          logger.error("Invalid or missing SSE session", {
            type: "SSE_INVALID_SESSION",
            sessionId,
          });
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid or missing sessionId",
              },
              id: null,
            })
          );
          return;
        }

        const session = this.sseSessions.get(sessionId)!;
        const { transport } = session;

        try {
          // Read request body
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
            } catch (parseError) {
              body = bodyString || null;
            }
          }

          // Handle POST message through transport (like the working example)
          await transport.handlePostMessage(req, res, body);

          logger.debug("SSE POST request processed", {
            type: "SSE_POST_PROCESSED",
            sessionId,
          });
        } catch (error) {
          logger.error("Failed to handle SSE POST message", {
            type: "SSE_POST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
        return;
      }

      // OPTIONS - CORS preflight
      if (req.method === "OPTIONS" && (streamPathMap.has(pathname) || postPathSet.has(pathname))) {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }).end();
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Not Found" })
      );
    });

    httpServer.on("clientError", (err, socket) => {
      logger.error("SSE HTTP client error", {
        type: "SSE_HTTP_CLIENT_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        logger.error("SSE HTTP server failed to start", {
          type: "SSE_HTTP_SERVER_ERROR",
          error: error.message,
        });
        httpServer.off("error", onError);
        reject(error);
      };

      httpServer.once("error", onError);
      httpServer.listen(sseConfig.port, sseConfig.host, () => {
        httpServer.off("error", onError);
        logger.info("SSE HTTP server listening", {
          type: "SSE_HTTP_SERVER_LISTENING",
          host: sseConfig.host,
          port: sseConfig.port,
          streamPaths,
          postPaths: Array.from(postPathSet.values()),
        });
        resolve();
      });
    });

    this.httpServer = httpServer;
  }
}

if (process.env.MCP_SKIP_AUTO_START !== "true") {
  const server = new mcp_abap_adt_server();
  server.run().catch((error) => {
    logger.error("Fatal error while running MCP server", {
      type: "SERVER_FATAL_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
    // Always write to stderr (safe even in stdio mode)
    process.stderr.write(`[MCP] ✗ Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    // On Windows, add a small delay before exit to allow error message to be visible
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 100);
    } else {
      process.exit(1);
    }
  });
}
