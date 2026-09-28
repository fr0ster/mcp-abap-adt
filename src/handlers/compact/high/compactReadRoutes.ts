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

import type { CompactCrudOperation } from '../../../lib/compact/compactMatrix';
import type { CompactObjectType } from '../../../lib/compact/compactObjectTypes';
import {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from '../../../lib/compact/compactRoutes';
import { handleGetBehaviorDefinition } from '../../behavior_definition/high/handleGetBehaviorDefinition';
import { handleGetBehaviorImplementation } from '../../behavior_implementation/high/handleGetBehaviorImplementation';
import { handleGetClass } from '../../class/high/handleGetClass';
import { handleGetLocalDefinitions } from '../../class/high/handleGetLocalDefinitions';
import { handleGetLocalMacros } from '../../class/high/handleGetLocalMacros';
import { handleGetLocalTestClass } from '../../class/high/handleGetLocalTestClass';
import { handleGetLocalTypes } from '../../class/high/handleGetLocalTypes';
import { handleGetDataElement } from '../../data_element/high/handleGetDataElement';
import { handleGetDdl } from '../../ddl/high/handleGetDdl';
import { handleGetDomain } from '../../domain/high/handleGetDomain';
import { handleGetFunctionGroup } from '../../function_group/high/handleGetFunctionGroup';
import { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';
import { handleGetInterface } from '../../interface/high/handleGetInterface';
import { handleGetMetadataExtension } from '../../metadata_extension/high/handleGetMetadataExtension';
import { handleGetPackage } from '../../package/high/handleGetPackage';
import { handleGetProgram } from '../../program/high/handleGetProgram';
import { handleGetServiceBinding } from '../../service_binding/high/handleGetServiceBinding';
import { handleGetServiceDefinition } from '../../service_definition/high/handleGetServiceDefinition';
import { handleGetStructure } from '../../structure/high/handleGetStructure';
import { handleGetTable } from '../../table/high/handleGetTable';
import { handleGetCdsUnitTest } from '../../unit_test/high/handleGetCdsUnitTest';
import { handleGetUnitTest } from '../../unit_test/high/handleGetUnitTest';

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
