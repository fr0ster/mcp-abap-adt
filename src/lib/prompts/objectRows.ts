/**
 * The rows of the six object prompts: per operation and type, the tool a
 * family calls and which of its arguments the prompt's `name` fills. A row
 * holds only what no definition states; everything else is read from the
 * listed tools. Each name key is typed against the tool's input, so a key
 * the tool does not take does not compile.
 */
import type * as z from 'zod';
import { TOOL_DEFINITION as CheckBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCheckBehaviorDefinition.js';
import { TOOL_DEFINITION as CreateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition.js';
import { TOOL_DEFINITION as DeleteBehaviorDefinition } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition.js';
import { TOOL_DEFINITION as GetBehaviorDefinition } from '../../handlers/behavior_definition/high/handleGetBehaviorDefinition.js';
import { TOOL_DEFINITION as UpdateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition.js';
import { TOOL_DEFINITION as ActivateBehaviorDefinition } from '../../handlers/behavior_definition/low/handleActivateBehaviorDefinition.js';
import { TOOL_DEFINITION as CreateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation.js';
import { TOOL_DEFINITION as DeleteBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.js';
import { TOOL_DEFINITION as GetBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleGetBehaviorImplementation.js';
import { TOOL_DEFINITION as UpdateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.js';
import { TOOL_DEFINITION as CheckClass } from '../../handlers/class/high/handleCheckClass.js';
import { TOOL_DEFINITION as CreateClass } from '../../handlers/class/high/handleCreateClass.js';
import { TOOL_DEFINITION as DeleteClass } from '../../handlers/class/high/handleDeleteClass.js';
import { TOOL_DEFINITION as DeleteLocalDefinitions } from '../../handlers/class/high/handleDeleteLocalDefinitions.js';
import { TOOL_DEFINITION as DeleteLocalMacros } from '../../handlers/class/high/handleDeleteLocalMacros.js';
import { TOOL_DEFINITION as DeleteLocalTestClass } from '../../handlers/class/high/handleDeleteLocalTestClass.js';
import { TOOL_DEFINITION as DeleteLocalTypes } from '../../handlers/class/high/handleDeleteLocalTypes.js';
import { TOOL_DEFINITION as GetClass } from '../../handlers/class/high/handleGetClass.js';
import { TOOL_DEFINITION as GetLocalDefinitions } from '../../handlers/class/high/handleGetLocalDefinitions.js';
import { TOOL_DEFINITION as GetLocalMacros } from '../../handlers/class/high/handleGetLocalMacros.js';
import { TOOL_DEFINITION as GetLocalTestClass } from '../../handlers/class/high/handleGetLocalTestClass.js';
import { TOOL_DEFINITION as GetLocalTypes } from '../../handlers/class/high/handleGetLocalTypes.js';
import { TOOL_DEFINITION as UpdateClass } from '../../handlers/class/high/handleUpdateClass.js';
import { TOOL_DEFINITION as UpdateLocalDefinitions } from '../../handlers/class/high/handleUpdateLocalDefinitions.js';
import { TOOL_DEFINITION as UpdateLocalMacros } from '../../handlers/class/high/handleUpdateLocalMacros.js';
import { TOOL_DEFINITION as UpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass.js';
import { TOOL_DEFINITION as UpdateLocalTypes } from '../../handlers/class/high/handleUpdateLocalTypes.js';
import { TOOL_DEFINITION as ActivateClass } from '../../handlers/class/low/handleActivateClass.js';
import { TOOL_DEFINITION as CheckDataElement } from '../../handlers/data_element/high/handleCheckDataElement.js';
import { TOOL_DEFINITION as CreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement.js';
import { TOOL_DEFINITION as DeleteDataElement } from '../../handlers/data_element/high/handleDeleteDataElement.js';
import { TOOL_DEFINITION as GetDataElement } from '../../handlers/data_element/high/handleGetDataElement.js';
import { TOOL_DEFINITION as UpdateDataElement } from '../../handlers/data_element/high/handleUpdateDataElement.js';
import { TOOL_DEFINITION as ActivateDataElement } from '../../handlers/data_element/low/handleActivateDataElement.js';
import { TOOL_DEFINITION as CheckDdl } from '../../handlers/ddl/high/handleCheckDdl.js';
import { TOOL_DEFINITION as CreateDdl } from '../../handlers/ddl/high/handleCreateDdl.js';
import { TOOL_DEFINITION as DeleteDdl } from '../../handlers/ddl/high/handleDeleteDdl.js';
import { TOOL_DEFINITION as GetDdl } from '../../handlers/ddl/high/handleGetDdl.js';
import { TOOL_DEFINITION as UpdateDdl } from '../../handlers/ddl/high/handleUpdateDdl.js';
import { TOOL_DEFINITION as ActivateDdl } from '../../handlers/ddl/low/handleActivateDdl.js';
import { TOOL_DEFINITION as CheckMetadataExtension } from '../../handlers/ddlx/high/handleCheckMetadataExtension.js';
import { TOOL_DEFINITION as CreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension.js';
import { TOOL_DEFINITION as UpdateMetadataExtension } from '../../handlers/ddlx/high/handleUpdateMetadataExtension.js';
import { TOOL_DEFINITION as ActivateMetadataExtension } from '../../handlers/ddlx/low/handleActivateMetadataExtension.js';
import { TOOL_DEFINITION as CheckDomain } from '../../handlers/domain/high/handleCheckDomain.js';
import { TOOL_DEFINITION as CreateDomain } from '../../handlers/domain/high/handleCreateDomain.js';
import { TOOL_DEFINITION as DeleteDomain } from '../../handlers/domain/high/handleDeleteDomain.js';
import { TOOL_DEFINITION as GetDomain } from '../../handlers/domain/high/handleGetDomain.js';
import { TOOL_DEFINITION as UpdateDomain } from '../../handlers/domain/high/handleUpdateDomain.js';
import { TOOL_DEFINITION as ActivateDomain } from '../../handlers/domain/low/handleActivateDomain.js';
import { TOOL_DEFINITION as CheckFunctionGroup } from '../../handlers/function/high/handleCheckFunctionGroup.js';
import { TOOL_DEFINITION as CheckFunctionModule } from '../../handlers/function/high/handleCheckFunctionModule.js';
import { TOOL_DEFINITION as CreateFunctionGroup } from '../../handlers/function/high/handleCreateFunctionGroup.js';
import { TOOL_DEFINITION as CreateFunctionModule } from '../../handlers/function/high/handleCreateFunctionModule.js';
import { TOOL_DEFINITION as UpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup.js';
import { TOOL_DEFINITION as UpdateFunctionModule } from '../../handlers/function/high/handleUpdateFunctionModule.js';
import { TOOL_DEFINITION as ActivateFunctionGroup } from '../../handlers/function/low/handleActivateFunctionGroup.js';
import { TOOL_DEFINITION as ActivateFunctionModule } from '../../handlers/function/low/handleActivateFunctionModule.js';
import { TOOL_DEFINITION as DeleteFunctionGroup } from '../../handlers/function_group/high/handleDeleteFunctionGroup.js';
import { TOOL_DEFINITION as GetFunctionGroup } from '../../handlers/function_group/high/handleGetFunctionGroup.js';
import { TOOL_DEFINITION as DeleteFunctionModule } from '../../handlers/function_module/high/handleDeleteFunctionModule.js';
import { TOOL_DEFINITION as GetFunctionModule } from '../../handlers/function_module/high/handleGetFunctionModule.js';
import { TOOL_DEFINITION as CreateInclude } from '../../handlers/include/high/handleCreateInclude.js';
import { TOOL_DEFINITION as DeleteInclude } from '../../handlers/include/high/handleDeleteInclude.js';
import { TOOL_DEFINITION as UpdateInclude } from '../../handlers/include/high/handleUpdateInclude.js';
import { TOOL_DEFINITION as ActivateInclude } from '../../handlers/include/low/handleActivateInclude.js';
import { TOOL_DEFINITION as GetInclude } from '../../handlers/include/readonly/handleGetInclude.js';
import { TOOL_DEFINITION as CheckInterface } from '../../handlers/interface/high/handleCheckInterface.js';
import { TOOL_DEFINITION as CreateInterface } from '../../handlers/interface/high/handleCreateInterface.js';
import { TOOL_DEFINITION as DeleteInterface } from '../../handlers/interface/high/handleDeleteInterface.js';
import { TOOL_DEFINITION as GetInterface } from '../../handlers/interface/high/handleGetInterface.js';
import { TOOL_DEFINITION as UpdateInterface } from '../../handlers/interface/high/handleUpdateInterface.js';
import { TOOL_DEFINITION as ActivateInterface } from '../../handlers/interface/low/handleActivateInterface.js';
import { TOOL_DEFINITION as DeleteMetadataExtension } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension.js';
import { TOOL_DEFINITION as GetMetadataExtension } from '../../handlers/metadata_extension/high/handleGetMetadataExtension.js';
import { TOOL_DEFINITION as CheckPackage } from '../../handlers/package/high/handleCheckPackage.js';
import { TOOL_DEFINITION as CreatePackage } from '../../handlers/package/high/handleCreatePackage.js';
import { TOOL_DEFINITION as DeletePackage } from '../../handlers/package/high/handleDeletePackage.js';
import { TOOL_DEFINITION as GetPackage } from '../../handlers/package/high/handleGetPackage.js';
import { TOOL_DEFINITION as UpdatePackage } from '../../handlers/package/high/handleUpdatePackage.js';
import { TOOL_DEFINITION as CheckProgram } from '../../handlers/program/high/handleCheckProgram.js';
import { TOOL_DEFINITION as CreateProgram } from '../../handlers/program/high/handleCreateProgram.js';
import { TOOL_DEFINITION as DeleteProgram } from '../../handlers/program/high/handleDeleteProgram.js';
import { TOOL_DEFINITION as GetProgram } from '../../handlers/program/high/handleGetProgram.js';
import { TOOL_DEFINITION as UpdateProgram } from '../../handlers/program/high/handleUpdateProgram.js';
import { TOOL_DEFINITION as ActivateProgram } from '../../handlers/program/low/handleActivateProgram.js';
import { TOOL_DEFINITION as CreateServiceBinding } from '../../handlers/service_binding/high/handleCreateServiceBinding.js';
import { TOOL_DEFINITION as DeleteServiceBinding } from '../../handlers/service_binding/high/handleDeleteServiceBinding.js';
import { TOOL_DEFINITION as GetServiceBinding } from '../../handlers/service_binding/high/handleGetServiceBinding.js';
import { TOOL_DEFINITION as UpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding.js';
import { TOOL_DEFINITION as ActivateServiceBinding } from '../../handlers/service_binding/low/handleActivateServiceBinding.js';
import { TOOL_DEFINITION as CreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition.js';
import { TOOL_DEFINITION as DeleteServiceDefinition } from '../../handlers/service_definition/high/handleDeleteServiceDefinition.js';
import { TOOL_DEFINITION as GetServiceDefinition } from '../../handlers/service_definition/high/handleGetServiceDefinition.js';
import { TOOL_DEFINITION as UpdateServiceDefinition } from '../../handlers/service_definition/high/handleUpdateServiceDefinition.js';
import { TOOL_DEFINITION as ActivateServiceDefinition } from '../../handlers/service_definition/low/handleActivateServiceDefinition.js';
import { TOOL_DEFINITION as CheckStructure } from '../../handlers/structure/high/handleCheckStructure.js';
import { TOOL_DEFINITION as CreateStructure } from '../../handlers/structure/high/handleCreateStructure.js';
import { TOOL_DEFINITION as DeleteStructure } from '../../handlers/structure/high/handleDeleteStructure.js';
import { TOOL_DEFINITION as GetStructure } from '../../handlers/structure/high/handleGetStructure.js';
import { TOOL_DEFINITION as UpdateStructure } from '../../handlers/structure/high/handleUpdateStructure.js';
import { TOOL_DEFINITION as ActivateStructure } from '../../handlers/structure/low/handleActivateStructure.js';
import { TOOL_DEFINITION as CheckTable } from '../../handlers/table/high/handleCheckTable.js';
import { TOOL_DEFINITION as CreateTable } from '../../handlers/table/high/handleCreateTable.js';
import { TOOL_DEFINITION as DeleteTable } from '../../handlers/table/high/handleDeleteTable.js';
import { TOOL_DEFINITION as GetTable } from '../../handlers/table/high/handleGetTable.js';
import { TOOL_DEFINITION as UpdateTable } from '../../handlers/table/high/handleUpdateTable.js';
import { TOOL_DEFINITION as ActivateTable } from '../../handlers/table/low/handleActivateTable.js';
import { TOOL_DEFINITION as CheckTableType } from '../../handlers/table_type/high/handleCheckTableType.js';
import { TOOL_DEFINITION as CreateTableType } from '../../handlers/table_type/high/handleCreateTableType.js';
import { TOOL_DEFINITION as DeleteTableType } from '../../handlers/table_type/high/handleDeleteTableType.js';
import { TOOL_DEFINITION as GetTableType } from '../../handlers/table_type/high/handleGetTableType.js';
import { TOOL_DEFINITION as UpdateTableType } from '../../handlers/table_type/high/handleUpdateTableType.js';
import { TOOL_DEFINITION as ActivateTableType } from '../../handlers/table_type/low/handleActivateTableType.js';
import { TOOL_DEFINITION as CreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest.js';
import { TOOL_DEFINITION as CreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest.js';
import { TOOL_DEFINITION as DeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest.js';
import { TOOL_DEFINITION as DeleteUnitTest } from '../../handlers/unit_test/high/handleDeleteUnitTest.js';
import { TOOL_DEFINITION as UpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest.js';
import { TOOL_DEFINITION as UpdateUnitTest } from '../../handlers/unit_test/high/handleUpdateUnitTest.js';
import {
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  type COMPACT_LOCK,
  COMPACT_READ,
  COMPACT_UPDATE,
} from '../adtProjections.js';
import {
  activateToken,
  checkToken,
  createToken,
  deleteToken,
  readToken,
  updateToken,
} from '../compact/compactDescriptions.js';
import {
  COMPACT_OBJECT_TYPES,
  type CompactObjectType,
} from '../compact/compactObjectTypes.js';
import type {
  COMPACT_ACTIVATE_TAKES,
  COMPACT_CHECK_TAKES,
  COMPACT_CREATE_TAKES,
  COMPACT_DELETE_TAKES,
  COMPACT_READ_TAKES,
  COMPACT_UPDATE_TAKES,
} from '../compact/compactSchemas.js';
import { isSourceless } from '../compact/sourceless.js';
import type { ToolDefinition } from '../handlers/interfaces.js';
import type { ObjectOperation } from './types.js';

/**
 * The types only the compact family serves (spec §2.2): in no prompt's
 * vocabulary, whatever a tool's members say.
 */
export type ONE_FAMILY_TYPES =
  | 'TABLE_SETTINGS'
  | 'PROGRAM_TEXT_ELEMENTS'
  | 'FUNCTION_GROUP_TEXT_ELEMENTS'
  | 'CLASS_TEXT_ELEMENTS';

/** A type of the prompts' vocabulary. */
export type PromptObjectType = Exclude<CompactObjectType, ONE_FAMILY_TYPES>;

/** A full-set row: the per-type tool and the argument the prompt's name fills. */
export interface FullRow {
  /** The tool's name as the server lists it. */
  readonly tool: string;
  /** The argument the prompt's `name` fills. */
  readonly name: string;
  /** The argument an update's new content goes in; none for a write of fields. */
  readonly content?: string;
}

/** What a full row holds besides its tool and name key: an update's content argument. */
export interface FullRowExtra<D extends ToolDefinition> {
  readonly content: keyof z.input<D['inputSchema']> & string;
}

/** The full row of `definition`, its name and content keys typed against the tool's input. */
export function fullRow<D extends ToolDefinition>(
  definition: D,
  name: keyof z.input<D['inputSchema']> & string,
  extra?: FullRowExtra<D>,
): FullRow {
  return extra === undefined
    ? { tool: definition.name, name }
    : { tool: definition.name, name, content: extra.content };
}

/** A definition listed under another name (an activation of the full set). */
function listedAs<D extends ToolDefinition>(definition: D, name: string): D {
  return { ...definition, name };
}

/** The full set's rows, per operation. */
export const FULL_ROWS: {
  readonly [O in ObjectOperation]: Partial<Record<PromptObjectType, FullRow>>;
} = {
  create: {
    PACKAGE: fullRow(CreatePackage, 'package_name'),
    DOMAIN: fullRow(CreateDomain, 'domain_name'),
    DATA_ELEMENT: fullRow(CreateDataElement, 'data_element_name'),
    TABLE: fullRow(CreateTable, 'table_name'),
    STRUCTURE: fullRow(CreateStructure, 'structure_name'),
    TABLE_TYPE: fullRow(CreateTableType, 'table_type_name'),
    DDL: fullRow(CreateDdl, 'ddl_name'),
    SERVICE_DEFINITION: fullRow(
      CreateServiceDefinition,
      'service_definition_name',
    ),
    SERVICE_BINDING: fullRow(CreateServiceBinding, 'service_binding_name'),
    CLASS: fullRow(CreateClass, 'class_name'),
    UNIT_TEST: fullRow(CreateUnitTest, 'class_name'),
    CDS_UNIT_TEST: fullRow(CreateCdsUnitTest, 'class_name'),
    PROGRAM: fullRow(CreateProgram, 'program_name'),
    INCLUDE: fullRow(CreateInclude, 'include_name'),
    INTERFACE: fullRow(CreateInterface, 'interface_name'),
    FUNCTION_GROUP: fullRow(CreateFunctionGroup, 'function_group_name'),
    FUNCTION_MODULE: fullRow(CreateFunctionModule, 'function_module_name'),
    BEHAVIOR_DEFINITION: fullRow(CreateBehaviorDefinition, 'name'),
    BEHAVIOR_IMPLEMENTATION: fullRow(
      CreateBehaviorImplementation,
      'class_name',
    ),
    METADATA_EXTENSION: fullRow(CreateMetadataExtension, 'name'),
  },
  get: {
    PACKAGE: fullRow(GetPackage, 'package_name'),
    DOMAIN: fullRow(GetDomain, 'domain_name'),
    DATA_ELEMENT: fullRow(GetDataElement, 'data_element_name'),
    TABLE: fullRow(GetTable, 'table_name'),
    STRUCTURE: fullRow(GetStructure, 'structure_name'),
    TABLE_TYPE: fullRow(GetTableType, 'table_type_name'),
    DDL: fullRow(GetDdl, 'ddl_name'),
    SERVICE_DEFINITION: fullRow(
      GetServiceDefinition,
      'service_definition_name',
    ),
    SERVICE_BINDING: fullRow(GetServiceBinding, 'service_binding_name'),
    CLASS: fullRow(GetClass, 'class_name'),
    LOCAL_TEST_CLASS: fullRow(GetLocalTestClass, 'class_name'),
    LOCAL_TYPES: fullRow(GetLocalTypes, 'class_name'),
    LOCAL_DEFINITIONS: fullRow(GetLocalDefinitions, 'class_name'),
    LOCAL_MACROS: fullRow(GetLocalMacros, 'class_name'),
    PROGRAM: fullRow(GetProgram, 'program_name'),
    INCLUDE: fullRow(GetInclude, 'include_name'),
    INTERFACE: fullRow(GetInterface, 'interface_name'),
    FUNCTION_GROUP: fullRow(GetFunctionGroup, 'function_group_name'),
    FUNCTION_MODULE: fullRow(GetFunctionModule, 'function_module_name'),
    BEHAVIOR_DEFINITION: fullRow(
      GetBehaviorDefinition,
      'behavior_definition_name',
    ),
    BEHAVIOR_IMPLEMENTATION: fullRow(
      GetBehaviorImplementation,
      'behavior_implementation_name',
    ),
    METADATA_EXTENSION: fullRow(
      GetMetadataExtension,
      'metadata_extension_name',
    ),
  },
  update: {
    PACKAGE: fullRow(UpdatePackage, 'package_name'),
    DOMAIN: fullRow(UpdateDomain, 'domain_name'),
    DATA_ELEMENT: fullRow(UpdateDataElement, 'data_element_name'),
    TABLE: fullRow(UpdateTable, 'table_name', { content: 'ddl_code' }),
    STRUCTURE: fullRow(UpdateStructure, 'structure_name', {
      content: 'ddl_code',
    }),
    TABLE_TYPE: fullRow(UpdateTableType, 'table_type_name'),
    DDL: fullRow(UpdateDdl, 'ddl_name', { content: 'ddl_source' }),
    SERVICE_DEFINITION: fullRow(
      UpdateServiceDefinition,
      'service_definition_name',
      { content: 'source_code' },
    ),
    SERVICE_BINDING: fullRow(UpdateServiceBinding, 'service_binding_name'),
    CLASS: fullRow(UpdateClass, 'class_name', { content: 'source_code' }),
    UNIT_TEST: fullRow(UpdateUnitTest, 'class_name', {
      content: 'test_class_source',
    }),
    CDS_UNIT_TEST: fullRow(UpdateCdsUnitTest, 'class_name', {
      content: 'test_class_source',
    }),
    LOCAL_TEST_CLASS: fullRow(UpdateLocalTestClass, 'class_name', {
      content: 'test_class_code',
    }),
    LOCAL_TYPES: fullRow(UpdateLocalTypes, 'class_name', {
      content: 'local_types_code',
    }),
    LOCAL_DEFINITIONS: fullRow(UpdateLocalDefinitions, 'class_name', {
      content: 'definitions_code',
    }),
    LOCAL_MACROS: fullRow(UpdateLocalMacros, 'class_name', {
      content: 'macros_code',
    }),
    PROGRAM: fullRow(UpdateProgram, 'program_name', { content: 'source_code' }),
    INCLUDE: fullRow(UpdateInclude, 'include_name', { content: 'source_code' }),
    INTERFACE: fullRow(UpdateInterface, 'interface_name', {
      content: 'source_code',
    }),
    FUNCTION_GROUP: fullRow(UpdateFunctionGroup, 'function_group_name'),
    FUNCTION_MODULE: fullRow(UpdateFunctionModule, 'function_module_name', {
      content: 'source_code',
    }),
    BEHAVIOR_DEFINITION: fullRow(UpdateBehaviorDefinition, 'name', {
      content: 'source_code',
    }),
    BEHAVIOR_IMPLEMENTATION: fullRow(
      UpdateBehaviorImplementation,
      'class_name',
      { content: 'implementation_code' },
    ),
    METADATA_EXTENSION: fullRow(UpdateMetadataExtension, 'name', {
      content: 'source_code',
    }),
  },
  delete: {
    PACKAGE: fullRow(DeletePackage, 'package_name'),
    DOMAIN: fullRow(DeleteDomain, 'domain_name'),
    DATA_ELEMENT: fullRow(DeleteDataElement, 'data_element_name'),
    TABLE: fullRow(DeleteTable, 'table_name'),
    STRUCTURE: fullRow(DeleteStructure, 'structure_name'),
    TABLE_TYPE: fullRow(DeleteTableType, 'table_type_name'),
    DDL: fullRow(DeleteDdl, 'ddl_name'),
    SERVICE_DEFINITION: fullRow(
      DeleteServiceDefinition,
      'service_definition_name',
    ),
    SERVICE_BINDING: fullRow(DeleteServiceBinding, 'service_binding_name'),
    CLASS: fullRow(DeleteClass, 'class_name'),
    UNIT_TEST: fullRow(DeleteUnitTest, 'class_name'),
    CDS_UNIT_TEST: fullRow(DeleteCdsUnitTest, 'class_name'),
    LOCAL_TEST_CLASS: fullRow(DeleteLocalTestClass, 'class_name'),
    LOCAL_TYPES: fullRow(DeleteLocalTypes, 'class_name'),
    LOCAL_DEFINITIONS: fullRow(DeleteLocalDefinitions, 'class_name'),
    LOCAL_MACROS: fullRow(DeleteLocalMacros, 'class_name'),
    PROGRAM: fullRow(DeleteProgram, 'program_name'),
    INCLUDE: fullRow(DeleteInclude, 'include_name'),
    INTERFACE: fullRow(DeleteInterface, 'interface_name'),
    FUNCTION_GROUP: fullRow(DeleteFunctionGroup, 'function_group_name'),
    FUNCTION_MODULE: fullRow(DeleteFunctionModule, 'function_module_name'),
    BEHAVIOR_DEFINITION: fullRow(
      DeleteBehaviorDefinition,
      'behavior_definition_name',
    ),
    BEHAVIOR_IMPLEMENTATION: fullRow(
      DeleteBehaviorImplementation,
      'behavior_implementation_name',
    ),
    METADATA_EXTENSION: fullRow(
      DeleteMetadataExtension,
      'metadata_extension_name',
    ),
  },
  activate: {
    DOMAIN: fullRow(listedAs(ActivateDomain, 'ActivateDomain'), 'domain_name'),
    DATA_ELEMENT: fullRow(
      listedAs(ActivateDataElement, 'ActivateDataElement'),
      'data_element_name',
    ),
    TABLE: fullRow(listedAs(ActivateTable, 'ActivateTable'), 'table_name'),
    STRUCTURE: fullRow(
      listedAs(ActivateStructure, 'ActivateStructure'),
      'structure_name',
    ),
    TABLE_TYPE: fullRow(
      listedAs(ActivateTableType, 'ActivateTableType'),
      'table_type_name',
    ),
    DDL: fullRow(listedAs(ActivateDdl, 'ActivateDdl'), 'ddl_name'),
    SERVICE_DEFINITION: fullRow(
      listedAs(ActivateServiceDefinition, 'ActivateServiceDefinition'),
      'name',
    ),
    SERVICE_BINDING: fullRow(
      listedAs(ActivateServiceBinding, 'ActivateServiceBinding'),
      'name',
    ),
    CLASS: fullRow(listedAs(ActivateClass, 'ActivateClass'), 'class_name'),
    PROGRAM: fullRow(
      listedAs(ActivateProgram, 'ActivateProgram'),
      'program_name',
    ),
    INCLUDE: fullRow(
      listedAs(ActivateInclude, 'ActivateInclude'),
      'include_name',
    ),
    INTERFACE: fullRow(
      listedAs(ActivateInterface, 'ActivateInterface'),
      'interface_name',
    ),
    FUNCTION_GROUP: fullRow(
      listedAs(ActivateFunctionGroup, 'ActivateFunctionGroup'),
      'function_group_name',
    ),
    FUNCTION_MODULE: fullRow(
      listedAs(ActivateFunctionModule, 'ActivateFunctionModule'),
      'function_module_name',
    ),
    BEHAVIOR_DEFINITION: fullRow(
      listedAs(ActivateBehaviorDefinition, 'ActivateBehaviorDefinition'),
      'name',
    ),
    METADATA_EXTENSION: fullRow(
      listedAs(ActivateMetadataExtension, 'ActivateMetadataExtension'),
      'name',
    ),
  },
  check: {
    PACKAGE: fullRow(CheckPackage, 'package_name'),
    DOMAIN: fullRow(CheckDomain, 'domain_name'),
    DATA_ELEMENT: fullRow(CheckDataElement, 'data_element_name'),
    TABLE: fullRow(CheckTable, 'table_name'),
    STRUCTURE: fullRow(CheckStructure, 'structure_name'),
    TABLE_TYPE: fullRow(CheckTableType, 'table_type_name'),
    DDL: fullRow(CheckDdl, 'ddl_name'),
    CLASS: fullRow(CheckClass, 'class_name'),
    PROGRAM: fullRow(CheckProgram, 'program_name'),
    INTERFACE: fullRow(CheckInterface, 'interface_name'),
    FUNCTION_GROUP: fullRow(CheckFunctionGroup, 'function_group_name'),
    FUNCTION_MODULE: fullRow(CheckFunctionModule, 'function_module_name'),
    BEHAVIOR_DEFINITION: fullRow(CheckBehaviorDefinition, 'name'),
    METADATA_EXTENSION: fullRow(CheckMetadataExtension, 'name'),
  },
};

/** The properties a compact tool's takes `T` give member `M`: `every`'s and the member's own. */
export type CompactNameKey<T, M extends string> = T extends {
  readonly every: readonly (infer E)[];
  readonly members: infer Ms;
}
  ?
      | E
      | (M extends keyof Ms
          ? NonNullable<Ms[M]> extends readonly (infer X)[]
            ? X
            : never
          : never)
  : never;

/** A compact row: the tool, its members of the vocabulary in member order, each one's name key and token. */
export interface CompactRow<M extends PromptObjectType> {
  readonly tool: string;
  /** The members the row serves, in the tool's member order. */
  readonly members: readonly M[];
  /** The argument the prompt's `name` fills, per member. */
  readonly name: { readonly [K in M]: string };
  /** The argument an update's new content goes in, per member; none for a write of fields. */
  readonly content?: { readonly [K in M]: string | undefined };
  /** The member with the arguments it takes, as the tool's description names it. */
  readonly token: (member: M) => string;
}

/** A compact row whose name and content keys are typed against the tool's takes `T`. */
function compactRow<T>() {
  return <M extends PromptObjectType>(row: {
    readonly tool: string;
    readonly members: readonly M[];
    readonly name: { readonly [K in M]: CompactNameKey<T, K> & string };
    readonly content?: {
      readonly [K in M]: (CompactNameKey<T, K> & string) | undefined;
    };
    readonly token: (member: M) => string;
  }): CompactRow<M> => row;
}

/** A member of a compact list that is in the vocabulary. */
function inVocabulary<T extends CompactObjectType>(
  type: T,
): type is Exclude<T, ONE_FAMILY_TYPES> {
  return (
    type !== 'TABLE_SETTINGS' &&
    type !== 'PROGRAM_TEXT_ELEMENTS' &&
    type !== 'FUNCTION_GROUP_TEXT_ELEMENTS' &&
    type !== 'CLASS_TEXT_ELEMENTS'
  );
}

/** The vocabulary, in the order of the compact type names. */
export const PROMPT_OBJECT_TYPES: readonly PromptObjectType[] =
  COMPACT_OBJECT_TYPES.filter(inVocabulary);

/** The compact family's rows, per operation. */
export const COMPACT_ROWS = {
  create: compactRow<typeof COMPACT_CREATE_TAKES>()({
    tool: 'HandlerCreate',
    members: COMPACT_CREATE.onprem.filter((member) => member !== 'TRANSPORT'),
    name: {
      PACKAGE: 'package_name',
      DOMAIN: 'domain_name',
      DATA_ELEMENT: 'data_element_name',
      TABLE: 'table_name',
      STRUCTURE: 'structure_name',
      TABLE_TYPE: 'table_type_name',
      DDL: 'ddl_name',
      SERVICE_DEFINITION: 'service_definition_name',
      SERVICE_BINDING: 'service_binding_name',
      CLASS: 'class_name',
      PROGRAM: 'program_name',
      INCLUDE: 'include_name',
      INTERFACE: 'interface_name',
      FUNCTION_GROUP: 'function_group_name',
      FUNCTION_MODULE: 'function_module_name',
      BEHAVIOR_DEFINITION: 'name',
      BEHAVIOR_IMPLEMENTATION: 'class_name',
      METADATA_EXTENSION: 'name',
    },
    token: createToken,
  }),
  get: compactRow<typeof COMPACT_READ_TAKES>()({
    tool: 'HandlerGet',
    members: COMPACT_READ.onprem.filter(
      (member) =>
        member !== 'UNIT_TEST' &&
        member !== 'CDS_UNIT_TEST' &&
        member !== 'TRANSPORT' &&
        inVocabulary(member),
    ),
    name: {
      PACKAGE: 'package_name',
      DOMAIN: 'domain_name',
      DATA_ELEMENT: 'data_element_name',
      TABLE: 'table_name',
      STRUCTURE: 'structure_name',
      TABLE_TYPE: 'table_type_name',
      DDL: 'ddl_name',
      SERVICE_DEFINITION: 'service_definition_name',
      SERVICE_BINDING: 'service_binding_name',
      CLASS: 'class_name',
      LOCAL_TEST_CLASS: 'class_name',
      LOCAL_TYPES: 'class_name',
      LOCAL_DEFINITIONS: 'class_name',
      LOCAL_MACROS: 'class_name',
      PROGRAM: 'program_name',
      INCLUDE: 'include_name',
      INTERFACE: 'interface_name',
      FUNCTION_GROUP: 'function_group_name',
      FUNCTION_MODULE: 'function_module_name',
      BEHAVIOR_DEFINITION: 'behavior_definition_name',
      BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
      METADATA_EXTENSION: 'metadata_extension_name',
    },
    token: readToken,
  }),
  update: compactRow<typeof COMPACT_UPDATE_TAKES>()({
    tool: 'HandlerUpdate',
    members: COMPACT_UPDATE.onprem.filter(inVocabulary),
    name: {
      PACKAGE: 'package_name',
      DOMAIN: 'domain_name',
      DATA_ELEMENT: 'data_element_name',
      TABLE_TYPE: 'table_type_name',
      FUNCTION_GROUP: 'function_group_name',
      TABLE: 'table_name',
      STRUCTURE: 'structure_name',
      DDL: 'ddl_name',
      SERVICE_DEFINITION: 'service_definition_name',
      CLASS: 'class_name',
      LOCAL_TEST_CLASS: 'class_name',
      LOCAL_TYPES: 'class_name',
      LOCAL_DEFINITIONS: 'class_name',
      LOCAL_MACROS: 'class_name',
      UNIT_TEST: 'class_name',
      CDS_UNIT_TEST: 'class_name',
      PROGRAM: 'program_name',
      INCLUDE: 'include_name',
      INTERFACE: 'interface_name',
      FUNCTION_MODULE: 'function_module_name',
      BEHAVIOR_DEFINITION: 'name',
      BEHAVIOR_IMPLEMENTATION: 'class_name',
      METADATA_EXTENSION: 'name',
      SERVICE_BINDING: 'service_binding_name',
    },
    content: {
      PACKAGE: 'source_code',
      DOMAIN: 'source_code',
      DATA_ELEMENT: 'source_code',
      TABLE_TYPE: 'source_code',
      FUNCTION_GROUP: 'source_code',
      TABLE: 'ddl_code',
      STRUCTURE: 'ddl_code',
      DDL: 'ddl_source',
      SERVICE_DEFINITION: 'source_code',
      CLASS: 'source_code',
      LOCAL_TEST_CLASS: 'test_class_code',
      LOCAL_TYPES: 'local_types_code',
      LOCAL_DEFINITIONS: 'definitions_code',
      LOCAL_MACROS: 'macros_code',
      UNIT_TEST: 'test_class_source',
      CDS_UNIT_TEST: 'test_class_source',
      PROGRAM: 'source_code',
      INCLUDE: 'source_code',
      INTERFACE: 'source_code',
      FUNCTION_MODULE: 'source_code',
      BEHAVIOR_DEFINITION: 'source_code',
      BEHAVIOR_IMPLEMENTATION: 'implementation_code',
      METADATA_EXTENSION: 'source_code',
      SERVICE_BINDING: undefined,
    },
    token: updateToken,
  }),
  delete: compactRow<typeof COMPACT_DELETE_TAKES>()({
    tool: 'HandlerDelete',
    members: COMPACT_DELETE.onprem,
    name: {
      PACKAGE: 'package_name',
      DOMAIN: 'domain_name',
      DATA_ELEMENT: 'data_element_name',
      TABLE: 'table_name',
      STRUCTURE: 'structure_name',
      TABLE_TYPE: 'table_type_name',
      DDL: 'ddl_name',
      SERVICE_DEFINITION: 'service_definition_name',
      SERVICE_BINDING: 'service_binding_name',
      CLASS: 'class_name',
      CDS_UNIT_TEST: 'class_name',
      PROGRAM: 'program_name',
      INCLUDE: 'include_name',
      INTERFACE: 'interface_name',
      FUNCTION_GROUP: 'function_group_name',
      FUNCTION_MODULE: 'function_module_name',
      BEHAVIOR_DEFINITION: 'behavior_definition_name',
      BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
      METADATA_EXTENSION: 'metadata_extension_name',
      LOCAL_TEST_CLASS: 'class_name',
      LOCAL_TYPES: 'class_name',
      LOCAL_DEFINITIONS: 'class_name',
      LOCAL_MACROS: 'class_name',
      UNIT_TEST: 'class_name',
    },
    token: deleteToken,
  }),
  activate: compactRow<typeof COMPACT_ACTIVATE_TAKES>()({
    tool: 'HandlerActivate',
    members: COMPACT_ACTIVATE.onprem.filter(inVocabulary),
    name: {
      CLASS: 'object_name',
      PROGRAM: 'object_name',
      INCLUDE: 'object_name',
      INTERFACE: 'object_name',
      FUNCTION_GROUP: 'object_name',
      TABLE: 'object_name',
      STRUCTURE: 'object_name',
      TABLE_TYPE: 'object_name',
      DDL: 'object_name',
      DOMAIN: 'object_name',
      DATA_ELEMENT: 'object_name',
      BEHAVIOR_DEFINITION: 'object_name',
      METADATA_EXTENSION: 'object_name',
      PACKAGE: 'object_name',
      SERVICE_DEFINITION: 'object_name',
      SERVICE_BINDING: 'object_name',
      FUNCTION_MODULE: 'object_name',
      BEHAVIOR_IMPLEMENTATION: 'object_name',
    },
    token: activateToken,
  }),
  check: compactRow<typeof COMPACT_CHECK_TAKES>()({
    tool: 'HandlerCheckRun',
    members: COMPACT_CHECK.onprem,
    name: {
      PACKAGE: 'object_name',
      DOMAIN: 'object_name',
      DATA_ELEMENT: 'object_name',
      TABLE: 'object_name',
      STRUCTURE: 'object_name',
      TABLE_TYPE: 'object_name',
      DDL: 'object_name',
      CLASS: 'object_name',
      PROGRAM: 'object_name',
      INTERFACE: 'object_name',
      FUNCTION_GROUP: 'object_name',
      FUNCTION_MODULE: 'object_name',
      BEHAVIOR_DEFINITION: 'object_name',
      METADATA_EXTENSION: 'object_name',
    },
    token: checkToken,
  }),
} as const satisfies { readonly [O in ObjectOperation]: object };

/** The part a compact read passes: `metadata` for a type with no source, else none. */
export const READ_PART = (type: CompactObjectType): 'metadata' | undefined =>
  isSourceless(type) ? 'metadata' : undefined;

type UpdateMember = (typeof COMPACT_UPDATE.onprem)[number];
type LockMember = (typeof COMPACT_LOCK.onprem)[number];

/**
 * The object a compact write locks, where it is not the type itself: a class
 * include, the unit tests and a behavior implementation are written under
 * the class's lock.
 */
export const LOCKED_AS: {
  readonly [M in
    | Exclude<UpdateMember, LockMember>
    | 'BEHAVIOR_IMPLEMENTATION']: LockMember;
} = {
  LOCAL_TEST_CLASS: 'CLASS',
  LOCAL_TYPES: 'CLASS',
  LOCAL_DEFINITIONS: 'CLASS',
  LOCAL_MACROS: 'CLASS',
  UNIT_TEST: 'CLASS',
  CDS_UNIT_TEST: 'CLASS',
  BEHAVIOR_IMPLEMENTATION: 'CLASS',
};

type ReadMember = (typeof COMPACT_READ.onprem)[number];

/**
 * The type an update reads, where it is not the type itself: the unit tests'
 * content is the class's local test classes.
 */
export const READ_AS: Partial<Record<UpdateMember, ReadMember>> = {
  UNIT_TEST: 'LOCAL_TEST_CLASS',
  CDS_UNIT_TEST: 'LOCAL_TEST_CLASS',
};
