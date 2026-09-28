/**
 * The compact WRITE routes: `object_type` to the handlers that change it.
 *
 * `create`, `update` and `delete`, kept apart from the read routes so that
 * importing the read half cannot reach a write handler. Nothing here is reachable
 * from `compactReadRoutes`, and a test asserts that of the module graph, not of
 * the intention.
 */

import type {
  CompactCrudOperation,
  CompactObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  handleCreateBehaviorDefinition,
  handleCreateBehaviorImplementation,
  handleCreateCdsUnitTest,
  handleCreateClass,
  handleCreateDataElement,
  handleCreateDdl,
  handleCreateDomain,
  handleCreateFunctionGroup,
  handleCreateFunctionModule,
  handleCreateInterface,
  handleCreateMetadataExtension,
  handleCreatePackage,
  handleCreateProgram,
  handleCreateServiceBinding,
  handleCreateServiceDefinition,
  handleCreateStructure,
  handleCreateTable,
  handleCreateTransport,
  handleCreateUnitTest,
  handleDeleteBehaviorDefinition,
  handleDeleteBehaviorImplementation,
  handleDeleteCdsUnitTest,
  handleDeleteClass,
  handleDeleteDataElement,
  handleDeleteDdl,
  handleDeleteDomain,
  handleDeleteFunctionGroup,
  handleDeleteFunctionModule,
  handleDeleteInterface,
  handleDeleteLocalDefinitions,
  handleDeleteLocalMacros,
  handleDeleteLocalTestClass,
  handleDeleteLocalTypes,
  handleDeleteMetadataExtension,
  handleDeleteProgram,
  handleDeleteServiceBinding,
  handleDeleteServiceDefinition,
  handleDeleteStructure,
  handleDeleteTable,
  handleDeleteUnitTest,
  handleUpdateBehaviorDefinition,
  handleUpdateBehaviorImplementation,
  handleUpdateCdsUnitTest,
  handleUpdateClass,
  handleUpdateDataElement,
  handleUpdateDdl,
  handleUpdateDomain,
  handleUpdateFunctionGroup,
  handleUpdateFunctionModule,
  handleUpdateInterface,
  handleUpdateLocalDefinitions,
  handleUpdateLocalMacros,
  handleUpdateLocalTestClass,
  handleUpdateLocalTypes,
  handleUpdateMetadataExtension,
  handleUpdateProgram,
  handleUpdateServiceBinding,
  handleUpdateServiceDefinition,
  handleUpdateStructure,
  handleUpdateTable,
  handleUpdateUnitTest,
} from '@mcp-abap-adt/lib/handlers/write';

export const compactWriteRouterMap: CompactRouterMap = {
  PACKAGE: {
    create: handleCreatePackage as unknown as CompactHandler,
  },
  DOMAIN: {
    create: handleCreateDomain as unknown as CompactHandler,
    update: handleUpdateDomain as unknown as CompactHandler,
    delete: handleDeleteDomain as unknown as CompactHandler,
  },
  DATA_ELEMENT: {
    create: handleCreateDataElement as unknown as CompactHandler,
    update: handleUpdateDataElement as unknown as CompactHandler,
    delete: handleDeleteDataElement as unknown as CompactHandler,
  },
  TRANSPORT: {
    create: handleCreateTransport as unknown as CompactHandler,
  },
  TABLE: {
    create: handleCreateTable as unknown as CompactHandler,
    update: handleUpdateTable as unknown as CompactHandler,
    delete: handleDeleteTable as unknown as CompactHandler,
  },
  STRUCTURE: {
    create: handleCreateStructure as unknown as CompactHandler,
    update: handleUpdateStructure as unknown as CompactHandler,
    delete: handleDeleteStructure as unknown as CompactHandler,
  },
  DDL: {
    create: handleCreateDdl as unknown as CompactHandler,
    update: handleUpdateDdl as unknown as CompactHandler,
    delete: handleDeleteDdl as unknown as CompactHandler,
  },
  SERVICE_DEFINITION: {
    create: handleCreateServiceDefinition as unknown as CompactHandler,
    update: handleUpdateServiceDefinition as unknown as CompactHandler,
    delete: handleDeleteServiceDefinition as unknown as CompactHandler,
  },
  SERVICE_BINDING: {
    create: handleCreateServiceBinding as unknown as CompactHandler,
    update: handleUpdateServiceBinding as unknown as CompactHandler,
    delete: handleDeleteServiceBinding as unknown as CompactHandler,
  },
  CLASS: {
    create: handleCreateClass as unknown as CompactHandler,
    update: handleUpdateClass as unknown as CompactHandler,
    delete: handleDeleteClass as unknown as CompactHandler,
  },
  UNIT_TEST: {
    create: handleCreateUnitTest as unknown as CompactHandler,
    update: handleUpdateUnitTest as unknown as CompactHandler,
    delete: handleDeleteUnitTest as unknown as CompactHandler,
  },
  CDS_UNIT_TEST: {
    create: handleCreateCdsUnitTest as unknown as CompactHandler,
    update: handleUpdateCdsUnitTest as unknown as CompactHandler,
    delete: handleDeleteCdsUnitTest as unknown as CompactHandler,
  },
  LOCAL_TEST_CLASS: {
    update: handleUpdateLocalTestClass as unknown as CompactHandler,
    delete: handleDeleteLocalTestClass as unknown as CompactHandler,
  },
  LOCAL_TYPES: {
    update: handleUpdateLocalTypes as unknown as CompactHandler,
    delete: handleDeleteLocalTypes as unknown as CompactHandler,
  },
  LOCAL_DEFINITIONS: {
    update: handleUpdateLocalDefinitions as unknown as CompactHandler,
    delete: handleDeleteLocalDefinitions as unknown as CompactHandler,
  },
  LOCAL_MACROS: {
    update: handleUpdateLocalMacros as unknown as CompactHandler,
    delete: handleDeleteLocalMacros as unknown as CompactHandler,
  },
  PROGRAM: {
    create: handleCreateProgram as unknown as CompactHandler,
    update: handleUpdateProgram as unknown as CompactHandler,
    delete: handleDeleteProgram as unknown as CompactHandler,
  },
  INTERFACE: {
    create: handleCreateInterface as unknown as CompactHandler,
    update: handleUpdateInterface as unknown as CompactHandler,
    delete: handleDeleteInterface as unknown as CompactHandler,
  },
  FUNCTION_GROUP: {
    create: handleCreateFunctionGroup as unknown as CompactHandler,
    update: handleUpdateFunctionGroup as unknown as CompactHandler,
    delete: handleDeleteFunctionGroup as unknown as CompactHandler,
  },
  FUNCTION_MODULE: {
    create: handleCreateFunctionModule as unknown as CompactHandler,
    update: handleUpdateFunctionModule as unknown as CompactHandler,
    delete: handleDeleteFunctionModule as unknown as CompactHandler,
  },
  BEHAVIOR_DEFINITION: {
    create: handleCreateBehaviorDefinition as unknown as CompactHandler,
    update: handleUpdateBehaviorDefinition as unknown as CompactHandler,
    delete: handleDeleteBehaviorDefinition as unknown as CompactHandler,
  },
  BEHAVIOR_IMPLEMENTATION: {
    create: handleCreateBehaviorImplementation as unknown as CompactHandler,
    update: handleUpdateBehaviorImplementation as unknown as CompactHandler,
    delete: handleDeleteBehaviorImplementation as unknown as CompactHandler,
  },
  METADATA_EXTENSION: {
    create: handleCreateMetadataExtension as unknown as CompactHandler,
    update: handleUpdateMetadataExtension as unknown as CompactHandler,
    delete: handleDeleteMetadataExtension as unknown as CompactHandler,
  },
  // No CRUD: a profiler run and a dump are read through their own tools.
  RUNTIME_PROFILE: {},
  RUNTIME_DUMP: {},
};

/** Route a compact write: `create`, `update` or `delete`. */
export async function routeCompactWrite(
  context: Parameters<typeof dispatchCompact>[0],
  operation: Exclude<CompactCrudOperation, 'get'>,
  args: { object_type: CompactObjectType } & Record<string, unknown>,
): Promise<unknown> {
  return dispatchCompact(context, compactWriteRouterMap, operation, args);
}
