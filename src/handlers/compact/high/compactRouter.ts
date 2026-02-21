import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleCreateBehaviorDefinition } from '../../behavior_definition/high/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../behavior_definition/high/handleDeleteBehaviorDefinition';
import { handleGetBehaviorDefinition } from '../../behavior_definition/high/handleGetBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleCreateBehaviorImplementation } from '../../behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleDeleteBehaviorImplementation } from '../../behavior_implementation/high/handleDeleteBehaviorImplementation';
import { handleGetBehaviorImplementation } from '../../behavior_implementation/high/handleGetBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleCreateClass } from '../../class/high/handleCreateClass';
import { handleCreateLocalDefinitions } from '../../class/high/handleCreateLocalDefinitions';
import { handleCreateLocalMacros } from '../../class/high/handleCreateLocalMacros';
import { handleCreateLocalTestClass } from '../../class/high/handleCreateLocalTestClass';
import { handleCreateLocalTypes } from '../../class/high/handleCreateLocalTypes';
import { handleDeleteClass } from '../../class/high/handleDeleteClass';
import { handleDeleteLocalDefinitions } from '../../class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../class/high/handleDeleteLocalTypes';
import { handleGetClass } from '../../class/high/handleGetClass';
import { handleGetLocalDefinitions } from '../../class/high/handleGetLocalDefinitions';
import { handleGetLocalMacros } from '../../class/high/handleGetLocalMacros';
import { handleGetLocalTestClass } from '../../class/high/handleGetLocalTestClass';
import { handleGetLocalTypes } from '../../class/high/handleGetLocalTypes';
import { handleUpdateClass } from '../../class/high/handleUpdateClass';
import { handleUpdateLocalDefinitions } from '../../class/high/handleUpdateLocalDefinitions';
import { handleUpdateLocalMacros } from '../../class/high/handleUpdateLocalMacros';
import { handleUpdateLocalTestClass } from '../../class/high/handleUpdateLocalTestClass';
import { handleUpdateLocalTypes } from '../../class/high/handleUpdateLocalTypes';
import { handleCreateDataElement } from '../../data_element/high/handleCreateDataElement';
import { handleDeleteDataElement } from '../../data_element/high/handleDeleteDataElement';
import { handleGetDataElement } from '../../data_element/high/handleGetDataElement';
import { handleUpdateDataElement } from '../../data_element/high/handleUpdateDataElement';
import { handleCreateMetadataExtension } from '../../ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../ddlx/high/handleUpdateMetadataExtension';
import { handleCreateDomain } from '../../domain/high/handleCreateDomain';
import { handleDeleteDomain } from '../../domain/high/handleDeleteDomain';
import { handleGetDomain } from '../../domain/high/handleGetDomain';
import { handleUpdateDomain } from '../../domain/high/handleUpdateDomain';
import { handleCreateFunctionGroup } from '../../function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import { handleUpdateFunctionGroup } from '../../function/high/handleUpdateFunctionGroup';
import { handleUpdateFunctionModule } from '../../function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionGroup } from '../../function_group/high/handleDeleteFunctionGroup';
import { handleGetFunctionGroup } from '../../function_group/high/handleGetFunctionGroup';
import { handleDeleteFunctionModule } from '../../function_module/high/handleDeleteFunctionModule';
import { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';
import { handleCreateInterface } from '../../interface/high/handleCreateInterface';
import { handleDeleteInterface } from '../../interface/high/handleDeleteInterface';
import { handleGetInterface } from '../../interface/high/handleGetInterface';
import { handleUpdateInterface } from '../../interface/high/handleUpdateInterface';
import { handleDeleteMetadataExtension } from '../../metadata_extension/high/handleDeleteMetadataExtension';
import { handleGetMetadataExtension } from '../../metadata_extension/high/handleGetMetadataExtension';
import { handleCreatePackage } from '../../package/high/handleCreatePackage';
import { handleGetPackage } from '../../package/high/handleGetPackage';
import { handleCreateProgram } from '../../program/high/handleCreateProgram';
import { handleDeleteProgram } from '../../program/high/handleDeleteProgram';
import { handleGetProgram } from '../../program/high/handleGetProgram';
import { handleUpdateProgram } from '../../program/high/handleUpdateProgram';
import { handleCreateServiceBinding } from '../../service_binding/high/handleCreateServiceBinding';
import { handleDeleteServiceBinding } from '../../service_binding/high/handleDeleteServiceBinding';
import { handleGetServiceBinding } from '../../service_binding/high/handleGetServiceBinding';
import { handleUpdateServiceBinding } from '../../service_binding/high/handleUpdateServiceBinding';
import { handleCreateServiceDefinition } from '../../service_definition/high/handleCreateServiceDefinition';
import { handleDeleteServiceDefinition } from '../../service_definition/high/handleDeleteServiceDefinition';
import { handleGetServiceDefinition } from '../../service_definition/high/handleGetServiceDefinition';
import { handleUpdateServiceDefinition } from '../../service_definition/high/handleUpdateServiceDefinition';
import { handleCreateStructure } from '../../structure/high/handleCreateStructure';
import { handleDeleteStructure } from '../../structure/high/handleDeleteStructure';
import { handleGetStructure } from '../../structure/high/handleGetStructure';
import { handleUpdateStructure } from '../../structure/high/handleUpdateStructure';
import { handleCreateTable } from '../../table/high/handleCreateTable';
import { handleDeleteTable } from '../../table/high/handleDeleteTable';
import { handleGetTable } from '../../table/high/handleGetTable';
import { handleUpdateTable } from '../../table/high/handleUpdateTable';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';
import { handleCreateCdsUnitTest } from '../../unit_test/high/handleCreateCdsUnitTest';
import { handleCreateUnitTest } from '../../unit_test/high/handleCreateUnitTest';
import { handleDeleteCdsUnitTest } from '../../unit_test/high/handleDeleteCdsUnitTest';
import { handleDeleteUnitTest } from '../../unit_test/high/handleDeleteUnitTest';
import { handleGetCdsUnitTest } from '../../unit_test/high/handleGetCdsUnitTest';
import { handleGetUnitTest } from '../../unit_test/high/handleGetUnitTest';
import { handleUpdateCdsUnitTest } from '../../unit_test/high/handleUpdateCdsUnitTest';
import { handleUpdateUnitTest } from '../../unit_test/high/handleUpdateUnitTest';
import { handleCreateView } from '../../view/high/handleCreateView';
import { handleDeleteView } from '../../view/high/handleDeleteView';
import { handleGetView } from '../../view/high/handleGetView';
import { handleUpdateView } from '../../view/high/handleUpdateView';
import {
  COMPACT_CRUD_MATRIX,
  type CompactCrudOperation,
} from './compactMatrix';
import type { CompactObjectType } from './compactObjectTypes';

type CompactHandler = (
  context: HandlerContext,
  args: Record<string, unknown>,
) => Promise<unknown>;

type CompactRouterMap = Record<
  CompactObjectType,
  Partial<Record<CompactCrudOperation, CompactHandler>>
>;

export const compactRouterMap: CompactRouterMap = {
  PACKAGE: {
    create: handleCreatePackage as unknown as CompactHandler,
    get: handleGetPackage as unknown as CompactHandler,
  },
  DOMAIN: {
    create: handleCreateDomain as unknown as CompactHandler,
    get: handleGetDomain as unknown as CompactHandler,
    update: handleUpdateDomain as unknown as CompactHandler,
    delete: handleDeleteDomain as unknown as CompactHandler,
  },
  DATA_ELEMENT: {
    create: handleCreateDataElement as unknown as CompactHandler,
    get: handleGetDataElement as unknown as CompactHandler,
    update: handleUpdateDataElement as unknown as CompactHandler,
    delete: handleDeleteDataElement as unknown as CompactHandler,
  },
  TRANSPORT: {
    create: handleCreateTransport as unknown as CompactHandler,
  },
  TABLE: {
    create: handleCreateTable as unknown as CompactHandler,
    get: handleGetTable as unknown as CompactHandler,
    update: handleUpdateTable as unknown as CompactHandler,
    delete: handleDeleteTable as unknown as CompactHandler,
  },
  STRUCTURE: {
    create: handleCreateStructure as unknown as CompactHandler,
    get: handleGetStructure as unknown as CompactHandler,
    update: handleUpdateStructure as unknown as CompactHandler,
    delete: handleDeleteStructure as unknown as CompactHandler,
  },
  VIEW: {
    create: handleCreateView as unknown as CompactHandler,
    get: handleGetView as unknown as CompactHandler,
    update: handleUpdateView as unknown as CompactHandler,
    delete: handleDeleteView as unknown as CompactHandler,
  },
  SERVICE_DEFINITION: {
    create: handleCreateServiceDefinition as unknown as CompactHandler,
    get: handleGetServiceDefinition as unknown as CompactHandler,
    update: handleUpdateServiceDefinition as unknown as CompactHandler,
    delete: handleDeleteServiceDefinition as unknown as CompactHandler,
  },
  SERVICE_BINDING: {
    create: handleCreateServiceBinding as unknown as CompactHandler,
    get: handleGetServiceBinding as unknown as CompactHandler,
    update: handleUpdateServiceBinding as unknown as CompactHandler,
    delete: handleDeleteServiceBinding as unknown as CompactHandler,
  },
  CLASS: {
    create: handleCreateClass as unknown as CompactHandler,
    get: handleGetClass as unknown as CompactHandler,
    update: handleUpdateClass as unknown as CompactHandler,
    delete: handleDeleteClass as unknown as CompactHandler,
  },
  UNIT_TEST: {
    create: handleCreateUnitTest as unknown as CompactHandler,
    get: handleGetUnitTest as unknown as CompactHandler,
    update: handleUpdateUnitTest as unknown as CompactHandler,
    delete: handleDeleteUnitTest as unknown as CompactHandler,
  },
  CDS_UNIT_TEST: {
    create: handleCreateCdsUnitTest as unknown as CompactHandler,
    get: handleGetCdsUnitTest as unknown as CompactHandler,
    update: handleUpdateCdsUnitTest as unknown as CompactHandler,
    delete: handleDeleteCdsUnitTest as unknown as CompactHandler,
  },
  LOCAL_TEST_CLASS: {
    create: handleCreateLocalTestClass as unknown as CompactHandler,
    get: handleGetLocalTestClass as unknown as CompactHandler,
    update: handleUpdateLocalTestClass as unknown as CompactHandler,
    delete: handleDeleteLocalTestClass as unknown as CompactHandler,
  },
  LOCAL_TYPES: {
    create: handleCreateLocalTypes as unknown as CompactHandler,
    get: handleGetLocalTypes as unknown as CompactHandler,
    update: handleUpdateLocalTypes as unknown as CompactHandler,
    delete: handleDeleteLocalTypes as unknown as CompactHandler,
  },
  LOCAL_DEFINITIONS: {
    create: handleCreateLocalDefinitions as unknown as CompactHandler,
    get: handleGetLocalDefinitions as unknown as CompactHandler,
    update: handleUpdateLocalDefinitions as unknown as CompactHandler,
    delete: handleDeleteLocalDefinitions as unknown as CompactHandler,
  },
  LOCAL_MACROS: {
    create: handleCreateLocalMacros as unknown as CompactHandler,
    get: handleGetLocalMacros as unknown as CompactHandler,
    update: handleUpdateLocalMacros as unknown as CompactHandler,
    delete: handleDeleteLocalMacros as unknown as CompactHandler,
  },
  PROGRAM: {
    create: handleCreateProgram as unknown as CompactHandler,
    get: handleGetProgram as unknown as CompactHandler,
    update: handleUpdateProgram as unknown as CompactHandler,
    delete: handleDeleteProgram as unknown as CompactHandler,
  },
  INTERFACE: {
    create: handleCreateInterface as unknown as CompactHandler,
    get: handleGetInterface as unknown as CompactHandler,
    update: handleUpdateInterface as unknown as CompactHandler,
    delete: handleDeleteInterface as unknown as CompactHandler,
  },
  FUNCTION_GROUP: {
    create: handleCreateFunctionGroup as unknown as CompactHandler,
    get: handleGetFunctionGroup as unknown as CompactHandler,
    update: handleUpdateFunctionGroup as unknown as CompactHandler,
    delete: handleDeleteFunctionGroup as unknown as CompactHandler,
  },
  FUNCTION_MODULE: {
    create: handleCreateFunctionModule as unknown as CompactHandler,
    get: handleGetFunctionModule as unknown as CompactHandler,
    update: handleUpdateFunctionModule as unknown as CompactHandler,
    delete: handleDeleteFunctionModule as unknown as CompactHandler,
  },
  BEHAVIOR_DEFINITION: {
    create: handleCreateBehaviorDefinition as unknown as CompactHandler,
    get: handleGetBehaviorDefinition as unknown as CompactHandler,
    update: handleUpdateBehaviorDefinition as unknown as CompactHandler,
    delete: handleDeleteBehaviorDefinition as unknown as CompactHandler,
  },
  BEHAVIOR_IMPLEMENTATION: {
    create: handleCreateBehaviorImplementation as unknown as CompactHandler,
    get: handleGetBehaviorImplementation as unknown as CompactHandler,
    update: handleUpdateBehaviorImplementation as unknown as CompactHandler,
    delete: handleDeleteBehaviorImplementation as unknown as CompactHandler,
  },
  METADATA_EXTENSION: {
    create: handleCreateMetadataExtension as unknown as CompactHandler,
    get: handleGetMetadataExtension as unknown as CompactHandler,
    update: handleUpdateMetadataExtension as unknown as CompactHandler,
    delete: handleDeleteMetadataExtension as unknown as CompactHandler,
  },
  RUNTIME_PROFILE: {},
  RUNTIME_DUMP: {},
};

function validateCompactRouterAgainstMatrix() {
  for (const [objectType, expectedCrud] of Object.entries(
    COMPACT_CRUD_MATRIX,
  )) {
    const actualCrud = Object.keys(
      compactRouterMap[objectType as CompactObjectType] || {},
    ).sort();
    const expected = [...expectedCrud].sort();
    if (JSON.stringify(actualCrud) !== JSON.stringify(expected)) {
      throw new Error(
        `compactRouterMap mismatch for ${objectType}. Expected CRUD: [${expected.join(', ')}], got: [${actualCrud.join(', ')}]`,
      );
    }
  }
}

validateCompactRouterAgainstMatrix();

export async function routeCompactOperation(
  context: HandlerContext,
  operation: CompactCrudOperation,
  args: { object_type: CompactObjectType } & Record<string, unknown>,
) {
  context.logger?.info?.(
    `[compact-router] route operation=${operation} object_type=${args?.object_type ?? 'undefined'}`,
  );

  if (!args?.object_type) {
    context.logger?.warn?.(
      `[compact-router] object_type is required for operation=${operation}`,
    );
    return return_error(new Error('object_type is required'));
  }

  const handler = compactRouterMap[args.object_type]?.[operation];
  if (!handler) {
    context.logger?.warn?.(
      `[compact-router] unsupported operation=${operation} object_type=${args.object_type}`,
    );
    return return_error(
      new Error(
        `Unsupported ${operation} for object_type: ${args.object_type}`,
      ),
    );
  }

  return handler(context, args);
}
