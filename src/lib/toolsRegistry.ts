import { TOOL_DEFINITION as GetProgram_Tool } from '../handlers/program/readonly/handleGetProgram';
import { TOOL_DEFINITION as GetClass_Tool } from '../handlers/class/readonly/handleGetClass';
import { TOOL_DEFINITION as GetFunction_Tool } from '../handlers/function/readonly/handleGetFunction';
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from '../handlers/function/readonly/handleGetFunctionGroup';
import { TOOL_DEFINITION as GetTable_Tool } from '../handlers/table/readonly/handleGetTable';
import { TOOL_DEFINITION as GetStructure_Tool } from '../handlers/structure/readonly/handleGetStructure';
import { TOOL_DEFINITION as GetTableContents_Tool } from '../handlers/table/readonly/handleGetTableContents';
import { TOOL_DEFINITION as GetPackage_Tool } from '../handlers/package/readonly/handleGetPackage';
import { TOOL_DEFINITION as CreatePackage_Tool } from '../handlers/package/high/handleCreatePackage';
import { TOOL_DEFINITION as GetInclude_Tool } from '../handlers/include/readonly/handleGetInclude';
import { TOOL_DEFINITION as GetIncludesList_Tool } from '../handlers/include/readonly/handleGetIncludesList';
import { TOOL_DEFINITION as GetTypeInfo_Tool } from '../handlers/system/readonly/handleGetTypeInfo';
import { TOOL_DEFINITION as GetInterface_Tool } from '../handlers/interface/readonly/handleGetInterface';
import { TOOL_DEFINITION as GetTransaction_Tool } from '../handlers/system/readonly/handleGetTransaction';
import { TOOL_DEFINITION as SearchObject_Tool } from '../handlers/search/readonly/handleSearchObject';
import { TOOL_DEFINITION as GetEnhancements_Tool } from '../handlers/enhancement/readonly/handleGetEnhancements';
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from '../handlers/enhancement/readonly/handleGetEnhancementImpl';
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from '../handlers/enhancement/readonly/handleGetEnhancementSpot';
import { TOOL_DEFINITION as GetBdef_Tool } from '../handlers/bdef/readonly/handleGetBdef';
import { TOOL_DEFINITION as CreateBdef_Tool } from '../handlers/bdef/high/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBdef_Tool } from '../handlers/bdef/high/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBehaviorDefinitionLow_Tool } from '../handlers/bdef/low/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as CreateDdlx_Tool } from '../handlers/ddlx/high/handleCreateMetadataExtension';
import { TOOL_DEFINITION as UpdateDdlx_Tool } from '../handlers/ddlx/high/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as UpdateMetadataExtensionLow_Tool } from '../handlers/ddlx/low/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from '../handlers/system/readonly/handleGetInactiveObjects';
// New low-level handlers TOOL_DEFINITION imports
import { TOOL_DEFINITION as DeleteClass_Tool } from '../handlers/class/low/handleDeleteClass';
import { TOOL_DEFINITION as LockClass_Tool } from '../handlers/class/low/handleLockClass';
import { TOOL_DEFINITION as UnlockClass_Tool } from '../handlers/class/low/handleUnlockClass';
import { TOOL_DEFINITION as CreateClassLow_Tool } from '../handlers/class/low/handleCreateClass';
import { TOOL_DEFINITION as CheckProgram_Tool } from '../handlers/program/low/handleCheckProgram';
import { TOOL_DEFINITION as DeleteProgram_Tool } from '../handlers/program/low/handleDeleteProgram';
import { TOOL_DEFINITION as LockProgram_Tool } from '../handlers/program/low/handleLockProgram';
import { TOOL_DEFINITION as UnlockProgram_Tool } from '../handlers/program/low/handleUnlockProgram';
import { TOOL_DEFINITION as ValidateProgram_Tool } from '../handlers/program/low/handleValidateProgram';
import { TOOL_DEFINITION as CreateProgramLow_Tool } from '../handlers/program/low/handleCreateProgram';
import { TOOL_DEFINITION as CheckInterface_Tool } from '../handlers/interface/low/handleCheckInterface';
import { TOOL_DEFINITION as DeleteInterface_Tool } from '../handlers/interface/low/handleDeleteInterface';
import { TOOL_DEFINITION as LockInterface_Tool } from '../handlers/interface/low/handleLockInterface';
import { TOOL_DEFINITION as UnlockInterface_Tool } from '../handlers/interface/low/handleUnlockInterface';
import { TOOL_DEFINITION as ValidateInterface_Tool } from '../handlers/interface/low/handleValidateInterface';
import { TOOL_DEFINITION as CreateInterfaceLow_Tool } from '../handlers/interface/low/handleCreateInterface';
import { TOOL_DEFINITION as CheckFunctionGroup_Tool } from '../handlers/function/low/handleCheckFunctionGroup';
import { TOOL_DEFINITION as DeleteFunctionGroup_Tool } from '../handlers/function/low/handleDeleteFunctionGroup';
import { TOOL_DEFINITION as DeleteFunctionModule_Tool } from '../handlers/function/low/handleDeleteFunctionModule';
import { TOOL_DEFINITION as LockFunctionGroup_Tool } from '../handlers/function/low/handleLockFunctionGroup';
import { TOOL_DEFINITION as LockFunctionModule_Tool } from '../handlers/function/low/handleLockFunctionModule';
import { TOOL_DEFINITION as UnlockFunctionGroup_Tool } from '../handlers/function/low/handleUnlockFunctionGroup';
import { TOOL_DEFINITION as UnlockFunctionModule_Tool } from '../handlers/function/low/handleUnlockFunctionModule';
import { TOOL_DEFINITION as ValidateFunctionGroup_Tool } from '../handlers/function/low/handleValidateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionGroupLow_Tool } from '../handlers/function/low/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModuleLow_Tool } from '../handlers/function/low/handleCreateFunctionModule';
import { TOOL_DEFINITION as CheckDataElement_Tool } from '../handlers/data_element/low/handleCheckDataElement';
import { TOOL_DEFINITION as DeleteDataElement_Tool } from '../handlers/data_element/low/handleDeleteDataElement';
import { TOOL_DEFINITION as LockDataElement_Tool } from '../handlers/data_element/low/handleLockDataElement';
import { TOOL_DEFINITION as UnlockDataElement_Tool } from '../handlers/data_element/low/handleUnlockDataElement';
import { TOOL_DEFINITION as ValidateDataElement_Tool } from '../handlers/data_element/low/handleValidateDataElement';
import { TOOL_DEFINITION as CreateDataElementLow_Tool } from '../handlers/data_element/low/handleCreateDataElement';
import { TOOL_DEFINITION as CheckDomain_Tool } from '../handlers/domain/low/handleCheckDomain';
import { TOOL_DEFINITION as DeleteDomain_Tool } from '../handlers/domain/low/handleDeleteDomain';
import { TOOL_DEFINITION as LockDomain_Tool } from '../handlers/domain/low/handleLockDomain';
import { TOOL_DEFINITION as UnlockDomain_Tool } from '../handlers/domain/low/handleUnlockDomain';
import { TOOL_DEFINITION as ValidateDomain_Tool } from '../handlers/domain/low/handleValidateDomain';
import { TOOL_DEFINITION as CreateDomainLow_Tool } from '../handlers/domain/low/handleCreateDomain';
import { TOOL_DEFINITION as CheckStructure_Tool } from '../handlers/structure/low/handleCheckStructure';
import { TOOL_DEFINITION as DeleteStructure_Tool } from '../handlers/structure/low/handleDeleteStructure';
import { TOOL_DEFINITION as LockStructure_Tool } from '../handlers/structure/low/handleLockStructure';
import { TOOL_DEFINITION as UnlockStructure_Tool } from '../handlers/structure/low/handleUnlockStructure';
import { TOOL_DEFINITION as ValidateStructure_Tool } from '../handlers/structure/low/handleValidateStructure';
import { TOOL_DEFINITION as CreateStructureLow_Tool } from '../handlers/structure/low/handleCreateStructure';
import { TOOL_DEFINITION as DeleteTable_Tool } from '../handlers/table/low/handleDeleteTable';
import { TOOL_DEFINITION as LockTable_Tool } from '../handlers/table/low/handleLockTable';
import { TOOL_DEFINITION as UnlockTable_Tool } from '../handlers/table/low/handleUnlockTable';
import { TOOL_DEFINITION as CreateTableLow_Tool } from '../handlers/table/low/handleCreateTable';
import { TOOL_DEFINITION as CheckView_Tool } from '../handlers/view/low/handleCheckView';
import { TOOL_DEFINITION as DeleteView_Tool } from '../handlers/view/low/handleDeleteView';
import { TOOL_DEFINITION as LockView_Tool } from '../handlers/view/low/handleLockView';
import { TOOL_DEFINITION as UnlockView_Tool } from '../handlers/view/low/handleUnlockView';
import { TOOL_DEFINITION as ValidateView_Tool } from '../handlers/view/low/handleValidateView';
import { TOOL_DEFINITION as CreateViewLow_Tool } from '../handlers/view/low/handleCreateView';
import { TOOL_DEFINITION as CheckPackage_Tool } from '../handlers/package/low/handleCheckPackage';
import { TOOL_DEFINITION as DeletePackage_Tool } from '../handlers/package/low/handleDeletePackage';
import { TOOL_DEFINITION as LockPackage_Tool } from '../handlers/package/low/handleLockPackage';
import { TOOL_DEFINITION as ValidatePackage_Tool } from '../handlers/package/low/handleValidatePackage';
import { TOOL_DEFINITION as CreatePackageLow_Tool } from '../handlers/package/low/handleCreatePackage';
import { TOOL_DEFINITION as CreateTransportLow_Tool } from '../handlers/transport/low/handleCreateTransport';
import { TOOL_DEFINITION as CheckBehaviorDefinition_Tool } from '../handlers/bdef/low/handleCheckBehaviorDefinition';
import { TOOL_DEFINITION as DeleteBehaviorDefinition_Tool } from '../handlers/bdef/low/handleDeleteBehaviorDefinition';
import { TOOL_DEFINITION as LockBehaviorDefinition_Tool } from '../handlers/bdef/low/handleLockBehaviorDefinition';
import { TOOL_DEFINITION as UnlockBehaviorDefinition_Tool } from '../handlers/bdef/low/handleUnlockBehaviorDefinition';
import { TOOL_DEFINITION as ValidateBehaviorDefinition_Tool } from '../handlers/bdef/low/handleValidateBehaviorDefinition';
import { TOOL_DEFINITION as CreateBehaviorDefinitionLow_Tool } from '../handlers/bdef/low/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as CheckMetadataExtension_Tool } from '../handlers/ddlx/low/handleCheckMetadataExtension';
import { TOOL_DEFINITION as DeleteMetadataExtension_Tool } from '../handlers/ddlx/low/handleDeleteMetadataExtension';
import { TOOL_DEFINITION as LockMetadataExtension_Tool } from '../handlers/ddlx/low/handleLockMetadataExtension';
import { TOOL_DEFINITION as UnlockMetadataExtension_Tool } from '../handlers/ddlx/low/handleUnlockMetadataExtension';
import { TOOL_DEFINITION as ValidateMetadataExtension_Tool } from '../handlers/ddlx/low/handleValidateMetadataExtension';
import { TOOL_DEFINITION as CreateMetadataExtensionLow_Tool } from '../handlers/ddlx/low/handleCreateMetadataExtension';
import { TOOL_DEFINITION as GetSqlQuery_Tool } from '../handlers/system/readonly/handleGetSqlQuery';
import { TOOL_DEFINITION as GetWhereUsed_Tool } from '../handlers/system/readonly/handleGetWhereUsed';
import { TOOL_DEFINITION as GetObjectInfo_Tool } from '../handlers/system/readonly/handleGetObjectInfo';
import { TOOL_DEFINITION as DescribeByList_Tool } from '../handlers/system/readonly/handleDescribeByList';
import { TOOL_DEFINITION as GetObjectsByType_Tool } from '../handlers/search/readonly/handleGetObjectsByType';
import { TOOL_DEFINITION as GetObjectsList_Tool } from '../handlers/search/readonly/handleGetObjectsList';
import { TOOL_DEFINITION as GetProgFullCode_Tool } from '../handlers/program/readonly/handleGetProgFullCode';
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from '../handlers/system/readonly/handleGetObjectNodeFromCache';
import { TOOL_DEFINITION as GetAdtTypes_Tool } from '../handlers/system/readonly/handleGetAllTypes';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../handlers/system/readonly/handleGetObjectStructure';
import { TOOL_DEFINITION as GetAbapAST_Tool } from '../handlers/system/readonly/handleGetAbapAST';
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from '../handlers/system/readonly/handleGetAbapSemanticAnalysis';
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from '../handlers/system/readonly/handleGetAbapSystemSymbols';
import { TOOL_DEFINITION as GetDomain_Tool } from '../handlers/domain/readonly/handleGetDomain';
import { TOOL_DEFINITION as CreateDomain_Tool } from '../handlers/domain/high/handleCreateDomain';
import { TOOL_DEFINITION as UpdateDomainHigh_Tool } from '../handlers/domain/high/handleUpdateDomain';
import { TOOL_DEFINITION as UpdateDomainLow_Tool } from '../handlers/domain/low/handleUpdateDomain';
import { TOOL_DEFINITION as CreateDataElement_Tool } from '../handlers/data_element/high/handleCreateDataElement';
import { TOOL_DEFINITION as UpdateDataElementHigh_Tool } from '../handlers/data_element/high/handleUpdateDataElement';
import { TOOL_DEFINITION as UpdateDataElementLow_Tool } from '../handlers/data_element/low/handleUpdateDataElement';
import { TOOL_DEFINITION as GetDataElement_Tool } from '../handlers/data_element/readonly/handleGetDataElement';
import { TOOL_DEFINITION as CreateTransport_Tool } from '../handlers/transport/high/handleCreateTransport';
import { TOOL_DEFINITION as GetTransport_Tool } from '../handlers/transport/readonly/handleGetTransport';
import { TOOL_DEFINITION as CreateTable_Tool } from '../handlers/table/high/handleCreateTable';
import { TOOL_DEFINITION as CreateStructure_Tool } from '../handlers/structure/high/handleCreateStructure';
import { TOOL_DEFINITION as CreateView_Tool } from '../handlers/view/high/handleCreateView';
import { TOOL_DEFINITION as GetView_Tool } from '../handlers/view/readonly/handleGetView';
import { TOOL_DEFINITION as CreateClass_Tool } from '../handlers/class/high/handleCreateClass';
import { TOOL_DEFINITION as CreateProgram_Tool } from '../handlers/program/high/handleCreateProgram';
import { TOOL_DEFINITION as CreateInterface_Tool } from '../handlers/interface/high/handleCreateInterface';
import { TOOL_DEFINITION as CreateFunctionGroup_Tool } from '../handlers/function/high/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModule_Tool } from '../handlers/function/high/handleCreateFunctionModule';
import { TOOL_DEFINITION as ActivateObject_Tool } from '../handlers/common/low/handleActivateObject';
import { TOOL_DEFINITION as DeleteObject_Tool } from '../handlers/common/low/handleDeleteObject';
import { TOOL_DEFINITION as CheckObject_Tool } from '../handlers/common/low/handleCheckObject';
import { TOOL_DEFINITION as UpdateClassHigh_Tool } from '../handlers/class/high/handleUpdateClass';
import { TOOL_DEFINITION as UpdateProgramHigh_Tool } from '../handlers/program/high/handleUpdateProgram';
import { TOOL_DEFINITION as UpdateViewHigh_Tool } from '../handlers/view/high/handleUpdateView';
import { TOOL_DEFINITION as UpdateInterfaceHigh_Tool } from '../handlers/interface/high/handleUpdateInterface';
import { TOOL_DEFINITION as UpdateFunctionModuleHigh_Tool } from '../handlers/function/high/handleUpdateFunctionModule';
import { TOOL_DEFINITION as UpdateStructure_Tool } from '../handlers/structure/low/handleUpdateStructure';
import { TOOL_DEFINITION as UpdatePackage_Tool } from '../handlers/package/low/handleUpdatePackage';
import { TOOL_DEFINITION as UpdateTable_Tool } from '../handlers/table/low/handleUpdateTable';
import { TOOL_DEFINITION as UnlockPackage_Tool } from '../handlers/package/low/handleUnlockPackage';
import { TOOL_DEFINITION as UpdateClass_Tool } from '../handlers/class/low/handleUpdateClass';
import { TOOL_DEFINITION as UpdateProgram_Tool } from '../handlers/program/low/handleUpdateProgram';
import { TOOL_DEFINITION as UpdateInterface_Tool } from '../handlers/interface/low/handleUpdateInterface';
import { TOOL_DEFINITION as UpdateFunctionModule_Tool } from '../handlers/function/low/handleUpdateFunctionModule';
import { TOOL_DEFINITION as UpdateView_Tool } from '../handlers/view/low/handleUpdateView';
import { TOOL_DEFINITION as UpdateDomain_Tool } from '../handlers/domain/low/handleUpdateDomain';
import { TOOL_DEFINITION as UpdateDataElement_Tool } from '../handlers/data_element/low/handleUpdateDataElement';
import { TOOL_DEFINITION as UpdateBehaviorDefinition_Tool } from '../handlers/bdef/low/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as UpdateMetadataExtension_Tool } from '../handlers/ddlx/low/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as GetSession_Tool } from '../handlers/system/readonly/handleGetSession';
import { TOOL_DEFINITION as ValidateObject_Tool } from '../handlers/common/low/handleValidateObject';
import { TOOL_DEFINITION as LockObject_Tool } from '../handlers/common/low/handleLockObject';
import { TOOL_DEFINITION as UnlockObject_Tool } from '../handlers/common/low/handleUnlockObject';
import { TOOL_DEFINITION as ValidateClass_Tool } from '../handlers/class/low/handleValidateClass';
import { TOOL_DEFINITION as CheckClass_Tool } from '../handlers/class/low/handleCheckClass';
import { TOOL_DEFINITION as ValidateTable_Tool } from '../handlers/table/low/handleValidateTable';
import { TOOL_DEFINITION as CheckTable_Tool } from '../handlers/table/low/handleCheckTable';
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from '../handlers/function/low/handleValidateFunctionModule';
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from '../handlers/function/low/handleCheckFunctionModule';

// Type that describes a tool entry
// Supports both JSON Schema format and Zod schema format (object with Zod fields)
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema:
  | {
    // JSON Schema format
    type: string;
    properties: Record<string, any>;
    required: readonly string[];
  }
  | Record<string, any>; // Zod schema format (object with Zod fields)
}

// Static descriptors for tools that rely on dynamic import
const DYNAMIC_IMPORT_TOOLS: ToolDefinition[] = [
  GetObjectsByType_Tool,
  GetObjectsList_Tool,
  GetProgFullCode_Tool,
  GetObjectNodeFromCache_Tool,
  DescribeByList_Tool
];

// Aggregate every tool definition into a single list
export const ALL_TOOLS: ToolDefinition[] = [
  // Programs, classes, functions
  GetClass_Tool,
  GetFunction_Tool,
  GetFunctionGroup_Tool,
  GetProgram_Tool,

  // Tables, structures
  GetStructure_Tool,
  GetTable_Tool,
  GetTableContents_Tool,

  // Packages, interfaces
  GetInterface_Tool,
  GetPackage_Tool,
  CreatePackage_Tool,
  UpdatePackage_Tool,
  UnlockPackage_Tool,

  // Includes, hierarchies
  GetInclude_Tool,
  GetIncludesList_Tool,
  GetObjectStructure_Tool,

  // Types, descriptions, metadata
  GetAdtTypes_Tool,
  GetTypeInfo_Tool,
  GetObjectInfo_Tool,

  // Search, SQL, transactions
  GetSqlQuery_Tool,
  GetTransaction_Tool,
  SearchObject_Tool,
  GetWhereUsed_Tool,

  // Enhancement
  GetBdef_Tool,
  CreateBdef_Tool,
  UpdateBdef_Tool,
  UpdateBehaviorDefinitionLow_Tool,
  CreateDdlx_Tool,
  UpdateDdlx_Tool,
  UpdateMetadataExtensionLow_Tool,
  GetInactiveObjects_Tool,
  GetEnhancementImpl_Tool,
  GetEnhancements_Tool,
  GetEnhancementSpot_Tool,

  // ABAP Parser & Semantic Analysis
  GetAbapAST_Tool,
  GetAbapSemanticAnalysis_Tool,
  GetAbapSystemSymbols_Tool,

  // Domain management
  GetDomain_Tool,
  CreateDomain_Tool,
  UpdateDomainLow_Tool,
  UpdateDomainHigh_Tool,

  // Data Element management
  GetDataElement_Tool,
  CreateDataElement_Tool,
  UpdateDataElementLow_Tool,
  UpdateDataElementHigh_Tool,

  // Transport management
  GetTransport_Tool,
  CreateTransport_Tool,

  // Table and Structure management
  CreateTable_Tool,
  UpdateTable_Tool,
  CreateStructure_Tool,
  UpdateStructure_Tool,

  // Class management
  CreateClass_Tool,
  UpdateClass_Tool,
  UpdateClassHigh_Tool,

  // Program management
  CreateProgram_Tool,
  UpdateProgram_Tool,
  UpdateProgramHigh_Tool,

  // Interface management
  CreateInterface_Tool,
  UpdateInterface_Tool,
  UpdateInterfaceHigh_Tool,

  // Function Group management
  CreateFunctionGroup_Tool,

  // Function Module management
  CreateFunctionModule_Tool,
  UpdateFunctionModule_Tool,
  UpdateFunctionModuleHigh_Tool,

  // View management
  CreateView_Tool,
  GetView_Tool,
  UpdateView_Tool,
  UpdateViewHigh_Tool,

  // Activation
  ActivateObject_Tool,

  // Deletion
  DeleteObject_Tool,

  // Syntax check
  CheckObject_Tool,

  // Session and lock management
  GetSession_Tool,
  ValidateObject_Tool,
  LockObject_Tool,
  UnlockObject_Tool,

  // Class-specific validation and checking
  ValidateClass_Tool,
  CheckClass_Tool,

  // Table-specific validation and checking
  ValidateTable_Tool,
  CheckTable_Tool,

  // Function module-specific validation and checking
  ValidateFunctionModule_Tool,
  CheckFunctionModule_Tool,

  // New low-level handlers
  DeleteClass_Tool,
  LockClass_Tool,
  UnlockClass_Tool,
  CreateClassLow_Tool,
  CheckProgram_Tool,
  DeleteProgram_Tool,
  LockProgram_Tool,
  UnlockProgram_Tool,
  ValidateProgram_Tool,
  CreateProgramLow_Tool,
  CheckInterface_Tool,
  DeleteInterface_Tool,
  LockInterface_Tool,
  UnlockInterface_Tool,
  ValidateInterface_Tool,
  CreateInterfaceLow_Tool,
  CheckFunctionGroup_Tool,
  DeleteFunctionGroup_Tool,
  DeleteFunctionModule_Tool,
  LockFunctionGroup_Tool,
  LockFunctionModule_Tool,
  UnlockFunctionGroup_Tool,
  UnlockFunctionModule_Tool,
  ValidateFunctionGroup_Tool,
  CreateFunctionGroupLow_Tool,
  CreateFunctionModuleLow_Tool,
  CheckDataElement_Tool,
  DeleteDataElement_Tool,
  LockDataElement_Tool,
  UnlockDataElement_Tool,
  ValidateDataElement_Tool,
  CreateDataElementLow_Tool,
  CheckDomain_Tool,
  DeleteDomain_Tool,
  LockDomain_Tool,
  UnlockDomain_Tool,
  ValidateDomain_Tool,
  CreateDomainLow_Tool,
  CheckStructure_Tool,
  DeleteStructure_Tool,
  LockStructure_Tool,
  UnlockStructure_Tool,
  ValidateStructure_Tool,
  CreateStructureLow_Tool,
  DeleteTable_Tool,
  LockTable_Tool,
  UnlockTable_Tool,
  CreateTableLow_Tool,
  CheckView_Tool,
  DeleteView_Tool,
  LockView_Tool,
  UnlockView_Tool,
  ValidateView_Tool,
  CreateViewLow_Tool,
  CheckPackage_Tool,
  DeletePackage_Tool,
  LockPackage_Tool,
  ValidatePackage_Tool,
  CreatePackageLow_Tool,
  CreateTransportLow_Tool,
  CheckBehaviorDefinition_Tool,
  DeleteBehaviorDefinition_Tool,
  LockBehaviorDefinition_Tool,
  UnlockBehaviorDefinition_Tool,
  ValidateBehaviorDefinition_Tool,
  CreateBehaviorDefinitionLow_Tool,
  CheckMetadataExtension_Tool,
  DeleteMetadataExtension_Tool,
  LockMetadataExtension_Tool,
  UnlockMetadataExtension_Tool,
  ValidateMetadataExtension_Tool,
  CreateMetadataExtensionLow_Tool,

  // Dynamically imported tools
  ...DYNAMIC_IMPORT_TOOLS
];

// Returns the entire tool list
export function getAllTools(): ToolDefinition[] {
  return ALL_TOOLS;
}

// Finds a tool definition by name
export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(tool => tool.name === name);
}
