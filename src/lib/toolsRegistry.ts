import { TOOL_DEFINITION as GetProgram_Tool } from '../handlers/program/handleGetProgram';
import { TOOL_DEFINITION as GetClass_Tool } from '../handlers/class/handleGetClass';
import { TOOL_DEFINITION as GetFunction_Tool } from '../handlers/function/handleGetFunction';
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from '../handlers/function/handleGetFunctionGroup';
import { TOOL_DEFINITION as GetTable_Tool } from '../handlers/table/handleGetTable';
import { TOOL_DEFINITION as GetStructure_Tool } from '../handlers/structure/handleGetStructure';
import { TOOL_DEFINITION as GetTableContents_Tool } from '../handlers/table/handleGetTableContents';
import { TOOL_DEFINITION as GetPackage_Tool } from '../handlers/package/handleGetPackage';
import { TOOL_DEFINITION as CreatePackage_Tool } from '../handlers/package/handleCreatePackage';
import { TOOL_DEFINITION as GetInclude_Tool } from '../handlers/include/handleGetInclude';
import { TOOL_DEFINITION as GetIncludesList_Tool } from '../handlers/include/handleGetIncludesList';
import { TOOL_DEFINITION as GetTypeInfo_Tool } from '../handlers/system/handleGetTypeInfo';
import { TOOL_DEFINITION as GetInterface_Tool } from '../handlers/interface/handleGetInterface';
import { TOOL_DEFINITION as GetTransaction_Tool } from '../handlers/system/handleGetTransaction';
import { TOOL_DEFINITION as SearchObject_Tool } from '../handlers/search/handleSearchObject';
import { TOOL_DEFINITION as GetEnhancements_Tool } from '../handlers/enhancement/handleGetEnhancements';
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from '../handlers/enhancement/handleGetEnhancementImpl';
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from '../handlers/enhancement/handleGetEnhancementSpot';
import { TOOL_DEFINITION as GetBdef_Tool } from '../handlers/bdef/handleGetBdef';
import { TOOL_DEFINITION as CreateBdef_Tool } from '../handlers/bdef/handleCreateBehaviorDefinition';
import { TOOL_DEFINITION as UpdateBdef_Tool } from '../handlers/bdef/handleUpdateBehaviorDefinition';
import { TOOL_DEFINITION as CreateDdlx_Tool } from '../handlers/ddlx/handleCreateMetadataExtension';
import { TOOL_DEFINITION as UpdateDdlx_Tool } from '../handlers/ddlx/handleUpdateMetadataExtension';
import { TOOL_DEFINITION as GetInactiveObjects_Tool } from '../handlers/system/handleGetInactiveObjects';
import { TOOL_DEFINITION as GetSqlQuery_Tool } from '../handlers/system/handleGetSqlQuery';
import { TOOL_DEFINITION as GetWhereUsed_Tool } from '../handlers/system/handleGetWhereUsed';
import { TOOL_DEFINITION as GetObjectInfo_Tool } from '../handlers/system/handleGetObjectInfo';
import { TOOL_DEFINITION as DescribeByList_Tool } from '../handlers/system/handleDescribeByList';
import { TOOL_DEFINITION as GetObjectsByType_Tool } from '../handlers/search/handleGetObjectsByType';
import { TOOL_DEFINITION as GetObjectsList_Tool } from '../handlers/search/handleGetObjectsList';
import { TOOL_DEFINITION as GetProgFullCode_Tool } from '../handlers/program/handleGetProgFullCode';
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from '../handlers/system/handleGetObjectNodeFromCache';
import { TOOL_DEFINITION as GetAdtTypes_Tool } from '../handlers/system/handleGetAllTypes';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../handlers/system/handleGetObjectStructure';
import { TOOL_DEFINITION as GetAbapAST_Tool } from '../handlers/system/handleGetAbapAST';
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from '../handlers/system/handleGetAbapSemanticAnalysis';
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from '../handlers/system/handleGetAbapSystemSymbols';
import { TOOL_DEFINITION as GetDomain_Tool } from '../handlers/domain/handleGetDomain';
import { TOOL_DEFINITION as CreateDomain_Tool } from '../handlers/domain/handleCreateDomain';
import { TOOL_DEFINITION as UpdateDomain_Tool } from '../handlers/domain/handleUpdateDomain';
import { TOOL_DEFINITION as CreateDataElement_Tool } from '../handlers/data_element/handleCreateDataElement';
import { TOOL_DEFINITION as UpdateDataElement_Tool } from '../handlers/data_element/handleUpdateDataElement';
import { TOOL_DEFINITION as GetDataElement_Tool } from '../handlers/data_element/handleGetDataElement';
import { TOOL_DEFINITION as CreateTransport_Tool } from '../handlers/transport/handleCreateTransport';
import { TOOL_DEFINITION as GetTransport_Tool } from '../handlers/transport/handleGetTransport';
import { TOOL_DEFINITION as CreateTable_Tool } from '../handlers/table/handleCreateTable';
import { TOOL_DEFINITION as CreateStructure_Tool } from '../handlers/structure/handleCreateStructure';
import { TOOL_DEFINITION as CreateView_Tool } from '../handlers/view/handleCreateView';
import { TOOL_DEFINITION as GetView_Tool } from '../handlers/view/handleGetView';
import { TOOL_DEFINITION as CreateClass_Tool } from '../handlers/class/handleCreateClass';
import { TOOL_DEFINITION as CreateProgram_Tool } from '../handlers/program/handleCreateProgram';
import { TOOL_DEFINITION as CreateInterface_Tool } from '../handlers/interface/handleCreateInterface';
import { TOOL_DEFINITION as CreateFunctionGroup_Tool } from '../handlers/function/handleCreateFunctionGroup';
import { TOOL_DEFINITION as CreateFunctionModule_Tool } from '../handlers/function/handleCreateFunctionModule';
import { TOOL_DEFINITION as ActivateObject_Tool } from '../handlers/common/handleActivateObject';
import { TOOL_DEFINITION as DeleteObject_Tool } from '../handlers/common/handleDeleteObject';
import { TOOL_DEFINITION as CheckObject_Tool } from '../handlers/common/handleCheckObject';
import { TOOL_DEFINITION as UpdateClassSource_Tool } from '../handlers/class/handleUpdateClassSource';
import { TOOL_DEFINITION as UpdateProgramSource_Tool } from '../handlers/program/handleUpdateProgramSource';
import { TOOL_DEFINITION as UpdateViewSource_Tool } from '../handlers/view/handleUpdateViewSource';
import { TOOL_DEFINITION as UpdateInterfaceSource_Tool } from '../handlers/interface/handleUpdateInterfaceSource';
import { TOOL_DEFINITION as UpdateFunctionModuleSource_Tool } from '../handlers/function/handleUpdateFunctionModuleSource';
import { TOOL_DEFINITION as GetSession_Tool } from '../handlers/system/handleGetSession';
import { TOOL_DEFINITION as ValidateObject_Tool } from '../handlers/common/handleValidateObject';
import { TOOL_DEFINITION as LockObject_Tool } from '../handlers/common/handleLockObject';
import { TOOL_DEFINITION as UnlockObject_Tool } from '../handlers/common/handleUnlockObject';
import { TOOL_DEFINITION as ValidateClass_Tool } from '../handlers/class/handleValidateClass';
import { TOOL_DEFINITION as CheckClass_Tool } from '../handlers/class/handleCheckClass';
import { TOOL_DEFINITION as ValidateTable_Tool } from '../handlers/table/handleValidateTable';
import { TOOL_DEFINITION as CheckTable_Tool } from '../handlers/table/handleCheckTable';
import { TOOL_DEFINITION as ValidateFunctionModule_Tool } from '../handlers/function/handleValidateFunctionModule';
import { TOOL_DEFINITION as CheckFunctionModule_Tool } from '../handlers/function/handleCheckFunctionModule';

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
  CreateDdlx_Tool,
  UpdateDdlx_Tool,
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
  UpdateDomain_Tool,

  // Data Element management
  GetDataElement_Tool,
  CreateDataElement_Tool,
  UpdateDataElement_Tool,

  // Transport management
  GetTransport_Tool,
  CreateTransport_Tool,

  // Table and Structure management
  CreateTable_Tool,
  CreateStructure_Tool,

  // Class management
  CreateClass_Tool,
  UpdateClassSource_Tool,

  // Program management
  CreateProgram_Tool,
  UpdateProgramSource_Tool,

  // Interface management
  CreateInterface_Tool,
  UpdateInterfaceSource_Tool,

  // Function Group management
  CreateFunctionGroup_Tool,

  // Function Module management
  CreateFunctionModule_Tool,
  UpdateFunctionModuleSource_Tool,

  // View management
  CreateView_Tool,
  GetView_Tool,
  UpdateViewSource_Tool,

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
