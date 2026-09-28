/**
 * The compact READ routes: `object_type` to the handler that reads it.
 *
 * Half of the compact router, and the half that changes nothing on the system.
 * It is a module of its own so that a read-only tool list can be assembled
 * without a single write route in its module graph — capability enforced by what
 * is imported rather than by a flag someone can pass. `compactRoutesCoverMatrix`
 * checks that this half plus the write half is exactly the CRUD matrix, so a
 * route cannot go missing by landing in neither file.
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
  handleGetBehaviorDefinition,
  handleGetBehaviorImplementation,
  handleGetCdsUnitTest,
  handleGetClass,
  handleGetDataElement,
  handleGetDdl,
  handleGetDomain,
  handleGetFunctionGroup,
  handleGetFunctionModule,
  handleGetInterface,
  handleGetLocalDefinitions,
  handleGetLocalMacros,
  handleGetLocalTestClass,
  handleGetLocalTypes,
  handleGetMetadataExtension,
  handleGetPackage,
  handleGetProgram,
  handleGetServiceBinding,
  handleGetServiceDefinition,
  handleGetStructure,
  handleGetTable,
  handleGetUnitTest,
} from '@mcp-abap-adt/lib/handlers/read';

export const compactReadRouterMap: CompactRouterMap = {
  PACKAGE: {
    get: handleGetPackage as unknown as CompactHandler,
  },
  DOMAIN: {
    get: handleGetDomain as unknown as CompactHandler,
  },
  DATA_ELEMENT: {
    get: handleGetDataElement as unknown as CompactHandler,
  },
  TRANSPORT: {},
  TABLE: {
    get: handleGetTable as unknown as CompactHandler,
  },
  STRUCTURE: {
    get: handleGetStructure as unknown as CompactHandler,
  },
  DDL: {
    get: handleGetDdl as unknown as CompactHandler,
  },
  SERVICE_DEFINITION: {
    get: handleGetServiceDefinition as unknown as CompactHandler,
  },
  SERVICE_BINDING: {
    get: handleGetServiceBinding as unknown as CompactHandler,
  },
  CLASS: {
    get: handleGetClass as unknown as CompactHandler,
  },
  UNIT_TEST: {
    get: handleGetUnitTest as unknown as CompactHandler,
  },
  CDS_UNIT_TEST: {
    get: handleGetCdsUnitTest as unknown as CompactHandler,
  },
  LOCAL_TEST_CLASS: {
    get: handleGetLocalTestClass as unknown as CompactHandler,
  },
  LOCAL_TYPES: {
    get: handleGetLocalTypes as unknown as CompactHandler,
  },
  LOCAL_DEFINITIONS: {
    get: handleGetLocalDefinitions as unknown as CompactHandler,
  },
  LOCAL_MACROS: {
    get: handleGetLocalMacros as unknown as CompactHandler,
  },
  PROGRAM: {
    get: handleGetProgram as unknown as CompactHandler,
  },
  INTERFACE: {
    get: handleGetInterface as unknown as CompactHandler,
  },
  FUNCTION_GROUP: {
    get: handleGetFunctionGroup as unknown as CompactHandler,
  },
  FUNCTION_MODULE: {
    get: handleGetFunctionModule as unknown as CompactHandler,
  },
  BEHAVIOR_DEFINITION: {
    get: handleGetBehaviorDefinition as unknown as CompactHandler,
  },
  BEHAVIOR_IMPLEMENTATION: {
    get: handleGetBehaviorImplementation as unknown as CompactHandler,
  },
  METADATA_EXTENSION: {
    get: handleGetMetadataExtension as unknown as CompactHandler,
  },
  // No CRUD: a profiler run and a dump are read through their own tools.
  RUNTIME_PROFILE: {},
  RUNTIME_DUMP: {},
};

/** Route a compact read. The only operation this half carries is `get`. */
export async function routeCompactRead(
  context: Parameters<typeof dispatchCompact>[0],
  args: { object_type: CompactObjectType } & Record<string, unknown>,
): Promise<unknown> {
  return dispatchCompact(context, compactReadRouterMap, 'get', args);
}
