/**
 * The definitions of the read tools the compact read routes serve, by tool
 * name: a compact route is the target tool's entry (`defineTool` of its
 * definition and its handler), so a routed call is parsed with the target's
 * own schema. Read tools only: this module is part of the read barrel.
 */
import { TOOL_DEFINITION as GetBehaviorDefinition } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition.js';
import { TOOL_DEFINITION as GetBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation.js';
import { TOOL_DEFINITION as GetClass } from '../../handlers/class/high/handleGetClass.js';
import { TOOL_DEFINITION as GetLocalDefinitions } from '../../handlers/class/high/handleGetLocalDefinitions.js';
import { TOOL_DEFINITION as GetLocalMacros } from '../../handlers/class/high/handleGetLocalMacros.js';
import { TOOL_DEFINITION as GetLocalTestClass } from '../../handlers/class/high/handleGetLocalTestClass.js';
import { TOOL_DEFINITION as GetLocalTypes } from '../../handlers/class/high/handleGetLocalTypes.js';
import { TOOL_DEFINITION as GetObjectDraft } from '../../handlers/common/readonly/handleGetObjectDraft.js';
import { TOOL_DEFINITION as GetDataElement } from '../../handlers/data_element/high/handleGetDataElement.js';
import { TOOL_DEFINITION as GetDdl } from '../../handlers/ddl/high/handleGetDdl.js';
import { TOOL_DEFINITION as GetDomain } from '../../handlers/domain/high/handleGetDomain.js';
import { TOOL_DEFINITION as GetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup.js';
import { TOOL_DEFINITION as GetFunctionModule } from '../../handlers/function_module/high/handleGetFunctionModule.js';
import { TOOL_DEFINITION as GetInclude } from '../../handlers/include/readonly/handleGetInclude.js';
import { TOOL_DEFINITION as GetMainPrograms } from '../../handlers/include/readonly/handleGetMainPrograms.js';
import { TOOL_DEFINITION as GetInterface } from '../../handlers/interface/high/handleGetInterface.js';
import { TOOL_DEFINITION as GetMetadataExtension } from '../../handlers/metadata_extension/high/handleGetMetadataExtension.js';
import { TOOL_DEFINITION as GetPackage } from '../../handlers/package/high/handleGetPackage.js';
import { TOOL_DEFINITION as GetPackageContents } from '../../handlers/package/readonly/handleGetPackageContents.js';
import { TOOL_DEFINITION as GetProgram } from '../../handlers/program/high/handleGetProgram.js';
import { TOOL_DEFINITION as SearchObject } from '../../handlers/search/readonly/handleSearchObject.js';
import { TOOL_DEFINITION as GetServiceBinding } from '../../handlers/service_binding/high/handleGetServiceBinding.js';
import { TOOL_DEFINITION as GetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition.js';
import { TOOL_DEFINITION as GetStructure } from '../../handlers/structure/high/handleGetStructure.js';
import { TOOL_DEFINITION as GetNodeStructureLow } from '../../handlers/system/low/handleGetNodeStructure.js';
import { TOOL_DEFINITION as GetVirtualFoldersLow } from '../../handlers/system/low/handleGetVirtualFolders.js';
import { TOOL_DEFINITION as GetObjectStructure } from '../../handlers/system/readonly/handleGetObjectStructure.js';
import { TOOL_DEFINITION as GetServiceBindingPreviewUrl } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl.js';
import { TOOL_DEFINITION as GetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery.js';
import { TOOL_DEFINITION as GetWhereUsed } from '../../handlers/system/readonly/handleGetWhereUsed.js';
import { TOOL_DEFINITION as GetTable } from '../../handlers/table/high/handleGetTable.js';
import { TOOL_DEFINITION as GetTableContents } from '../../handlers/table/readonly/handleGetTableContents.js';
import { TOOL_DEFINITION as GetTableType } from '../../handlers/table_type/high/handleGetTableType.js';
import { TOOL_DEFINITION as ReadTransportObjects } from '../../handlers/transport/readonly/handleReadTransportObjects.js';
import { TOOL_DEFINITION as GetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult.js';
import { TOOL_DEFINITION as GetUnitTestResult } from '../../handlers/unit_test/high/handleGetUnitTestResult.js';

export const READ_DEFINITIONS = {
  GetBehaviorDefinition,
  GetBehaviorImplementation,
  GetClass,
  GetLocalDefinitions,
  GetLocalMacros,
  GetLocalTestClass,
  GetLocalTypes,
  GetDataElement,
  GetDdl,
  GetDomain,
  GetFunctionGroup,
  GetFunctionModule,
  GetInclude,
  GetMainPrograms,
  GetObjectDraft,
  GetInterface,
  GetMetadataExtension,
  GetPackage,
  GetPackageContents,
  GetProgram,
  GetServiceBinding,
  GetServiceDefinition,
  GetStructure,
  GetNodeStructureLow,
  GetVirtualFoldersLow,
  GetObjectStructure,
  GetServiceBindingPreviewUrl,
  GetTable,
  GetTableType,
  ReadTransportObjects,
  GetCdsUnitTestResult,
  GetUnitTestResult,
  SearchObject,
  GetWhereUsed,
  GetSqlQuery,
  GetTableContents,
} as const;
