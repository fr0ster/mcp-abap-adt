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
  handleCreateOnly,
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
  handleDeletePackage,
  handleDeleteProgram,
  handleDeleteServiceBinding,
  handleDeleteServiceDefinition,
  handleDeleteStructure,
  handleDeleteTable,
  handleDeleteUnitTest,
  handleUpdateUnderLock,
} from '@mcp-abap-adt/lib/handlers/write';

/**
 * The create of every type: its create request alone, one `POST`
 * (`handleCreateOnly`, spec §4.6) — UNIT_TEST and CDS_UNIT_TEST, whose create
 * is a chain, refused there before anything is sent.
 */
const create = handleCreateOnly as unknown as CompactHandler;

/**
 * The update of every type: its one write under the caller's `lock_handle`
 * (`handleUpdateUnderLock`, spec §4.6).
 */
const update = handleUpdateUnderLock as unknown as CompactHandler;

export const compactWriteRouterMap: CompactRouterMap = {
  PACKAGE: {
    create,
    update,
    delete: handleDeletePackage as unknown as CompactHandler,
  },
  DOMAIN: {
    create,
    update,
    delete: handleDeleteDomain as unknown as CompactHandler,
  },
  DATA_ELEMENT: {
    create,
    update,
    delete: handleDeleteDataElement as unknown as CompactHandler,
  },
  TRANSPORT: {
    create,
  },
  TABLE: {
    create,
    update,
    delete: handleDeleteTable as unknown as CompactHandler,
  },
  STRUCTURE: {
    create,
    update,
    delete: handleDeleteStructure as unknown as CompactHandler,
  },
  DDL: {
    create,
    update,
    delete: handleDeleteDdl as unknown as CompactHandler,
  },
  SERVICE_DEFINITION: {
    create,
    update,
    delete: handleDeleteServiceDefinition as unknown as CompactHandler,
  },
  SERVICE_BINDING: {
    create,
    update,
    delete: handleDeleteServiceBinding as unknown as CompactHandler,
  },
  CLASS: {
    create,
    update,
    delete: handleDeleteClass as unknown as CompactHandler,
  },
  UNIT_TEST: {
    create,
    update,
    delete: handleDeleteUnitTest as unknown as CompactHandler,
  },
  CDS_UNIT_TEST: {
    create,
    update,
    delete: handleDeleteCdsUnitTest as unknown as CompactHandler,
  },
  LOCAL_TEST_CLASS: {
    update,
    delete: handleDeleteLocalTestClass as unknown as CompactHandler,
  },
  LOCAL_TYPES: {
    update,
    delete: handleDeleteLocalTypes as unknown as CompactHandler,
  },
  LOCAL_DEFINITIONS: {
    update,
    delete: handleDeleteLocalDefinitions as unknown as CompactHandler,
  },
  LOCAL_MACROS: {
    update,
    delete: handleDeleteLocalMacros as unknown as CompactHandler,
  },
  PROGRAM: {
    create,
    update,
    delete: handleDeleteProgram as unknown as CompactHandler,
  },
  INTERFACE: {
    create,
    update,
    delete: handleDeleteInterface as unknown as CompactHandler,
  },
  FUNCTION_GROUP: {
    create,
    update,
    delete: handleDeleteFunctionGroup as unknown as CompactHandler,
  },
  FUNCTION_MODULE: {
    create,
    update,
    delete: handleDeleteFunctionModule as unknown as CompactHandler,
  },
  BEHAVIOR_DEFINITION: {
    create,
    update,
    delete: handleDeleteBehaviorDefinition as unknown as CompactHandler,
  },
  BEHAVIOR_IMPLEMENTATION: {
    create,
    update,
    delete: handleDeleteBehaviorImplementation as unknown as CompactHandler,
  },
  METADATA_EXTENSION: {
    create,
    update,
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
