import { TOOL_DEFINITION as GetProgram_Tool } from '../handlers/handleGetProgram';
import { TOOL_DEFINITION as GetClass_Tool } from '../handlers/handleGetClass';
import { TOOL_DEFINITION as GetFunction_Tool } from '../handlers/handleGetFunction';
import { TOOL_DEFINITION as GetFunctionGroup_Tool } from '../handlers/handleGetFunctionGroup';
import { TOOL_DEFINITION as GetTable_Tool } from '../handlers/handleGetTable';
import { TOOL_DEFINITION as GetStructure_Tool } from '../handlers/handleGetStructure';
import { TOOL_DEFINITION as GetTableContents_Tool } from '../handlers/handleGetTableContents';
import { TOOL_DEFINITION as GetPackage_Tool } from '../handlers/handleGetPackage';
import { TOOL_DEFINITION as GetInclude_Tool } from '../handlers/handleGetInclude';
import { TOOL_DEFINITION as GetIncludesList_Tool } from '../handlers/handleGetIncludesList';
import { TOOL_DEFINITION as GetTypeInfo_Tool } from '../handlers/handleGetTypeInfo';
import { TOOL_DEFINITION as GetInterface_Tool } from '../handlers/handleGetInterface';
import { TOOL_DEFINITION as GetTransaction_Tool } from '../handlers/handleGetTransaction';
import { TOOL_DEFINITION as SearchObject_Tool } from '../handlers/handleSearchObject';
import { TOOL_DEFINITION as GetEnhancements_Tool } from '../handlers/handleGetEnhancements';
import { TOOL_DEFINITION as GetEnhancementImpl_Tool } from '../handlers/handleGetEnhancementImpl';
import { TOOL_DEFINITION as GetEnhancementSpot_Tool } from '../handlers/handleGetEnhancementSpot';
import { TOOL_DEFINITION as GetBdef_Tool } from '../handlers/handleGetBdef';
import { TOOL_DEFINITION as GetSqlQuery_Tool } from '../handlers/handleGetSqlQuery';
import { TOOL_DEFINITION as GetWhereUsed_Tool } from '../handlers/handleGetWhereUsed';
import { TOOL_DEFINITION as GetObjectInfo_Tool } from '../handlers/handleGetObjectInfo';
import { TOOL_DEFINITION as DescribeByList_Tool } from '../handlers/handleDescribeByList';
import { TOOL_DEFINITION as GetObjectsByType_Tool } from '../handlers/handleGetObjectsByType';
import { TOOL_DEFINITION as GetObjectsList_Tool } from '../handlers/handleGetObjectsList';
import { TOOL_DEFINITION as GetProgFullCode_Tool } from '../handlers/handleGetProgFullCode';
import { TOOL_DEFINITION as GetObjectNodeFromCache_Tool } from '../handlers/handleGetObjectNodeFromCache';
import { TOOL_DEFINITION as GetAdtTypes_Tool } from '../handlers/handleGetAllTypes';
import { TOOL_DEFINITION as GetObjectStructure_Tool } from '../handlers/handleGetObjectStructure';
import { TOOL_DEFINITION as GetAbapAST_Tool } from '../handlers/handleGetAbapAST';
import { TOOL_DEFINITION as GetAbapSemanticAnalysis_Tool } from '../handlers/handleGetAbapSemanticAnalysis';
import { TOOL_DEFINITION as GetAbapSystemSymbols_Tool } from '../handlers/handleGetAbapSystemSymbols';
import { TOOL_DEFINITION as GetDomain_Tool } from '../handlers/handleGetDomain';
import { TOOL_DEFINITION as CreateDomain_Tool } from '../handlers/handleCreateDomain';
import { TOOL_DEFINITION as CreateDataElement_Tool } from '../handlers/handleCreateDataElement';
import { TOOL_DEFINITION as GetDataElement_Tool } from '../handlers/handleGetDataElement';
import { TOOL_DEFINITION as CreateTransport_Tool } from '../handlers/handleCreateTransport';
import { TOOL_DEFINITION as GetTransport_Tool } from '../handlers/handleGetTransport';
import { TOOL_DEFINITION as CreateTable_Tool } from '../handlers/handleCreateTable';
import { TOOL_DEFINITION as CreateStructure_Tool } from '../handlers/handleCreateStructure';
import { TOOL_DEFINITION as CreateView_Tool } from '../handlers/handleCreateView';
import { TOOL_DEFINITION as GetView_Tool } from '../handlers/handleGetView';

// Type that describes a tool entry
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: readonly string[];
  };
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

  // Data Element management
  GetDataElement_Tool,
  CreateDataElement_Tool,

  // Transport management
  GetTransport_Tool,
  CreateTransport_Tool,

  // Table and Structure management
  CreateTable_Tool,
  CreateStructure_Tool,

  // View management
  CreateView_Tool,
  GetView_Tool,

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
