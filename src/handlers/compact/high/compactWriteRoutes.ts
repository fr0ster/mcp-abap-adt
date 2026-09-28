/**
 * The compact WRITE routes: `object_type` to the handlers that change it.
 *
 * `create`, `update` and `delete`, kept apart from the read routes so that
 * importing the read half cannot reach a write handler. Nothing here is reachable
 * from `compactReadRoutes`, and a test asserts that of the module graph, not of
 * the intention.
 */

import type { CompactCrudOperation } from '../../../lib/compact/compactMatrix';
import type { CompactObjectType } from '../../../lib/compact/compactObjectTypes';
import {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from '../../../lib/compact/compactRoutes';
import { handleCreateBehaviorDefinition } from '../../behavior_definition/high/handleCreateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../behavior_definition/high/handleDeleteBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleCreateBehaviorImplementation } from '../../behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleDeleteBehaviorImplementation } from '../../behavior_implementation/high/handleDeleteBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleCreateClass } from '../../class/high/handleCreateClass';
import { handleDeleteClass } from '../../class/high/handleDeleteClass';
import { handleDeleteLocalDefinitions } from '../../class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../class/high/handleDeleteLocalTypes';
import { handleUpdateClass } from '../../class/high/handleUpdateClass';
import { handleUpdateLocalDefinitions } from '../../class/high/handleUpdateLocalDefinitions';
import { handleUpdateLocalMacros } from '../../class/high/handleUpdateLocalMacros';
import { handleUpdateLocalTestClass } from '../../class/high/handleUpdateLocalTestClass';
import { handleUpdateLocalTypes } from '../../class/high/handleUpdateLocalTypes';
import { handleCreateDataElement } from '../../data_element/high/handleCreateDataElement';
import { handleDeleteDataElement } from '../../data_element/high/handleDeleteDataElement';
import { handleUpdateDataElement } from '../../data_element/high/handleUpdateDataElement';
import { handleCreateDdl } from '../../ddl/high/handleCreateDdl';
import { handleDeleteDdl } from '../../ddl/high/handleDeleteDdl';
import { handleUpdateDdl } from '../../ddl/high/handleUpdateDdl';
import { handleCreateMetadataExtension } from '../../ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../ddlx/high/handleUpdateMetadataExtension';
import { handleCreateDomain } from '../../domain/high/handleCreateDomain';
import { handleDeleteDomain } from '../../domain/high/handleDeleteDomain';
import { handleUpdateDomain } from '../../domain/high/handleUpdateDomain';
import { handleCreateFunctionGroup } from '../../function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import { handleUpdateFunctionGroup } from '../../function/high/handleUpdateFunctionGroup';
import { handleUpdateFunctionModule } from '../../function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionGroup } from '../../function_group/high/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../function_module/high/handleDeleteFunctionModule';
import { handleCreateInterface } from '../../interface/high/handleCreateInterface';
import { handleDeleteInterface } from '../../interface/high/handleDeleteInterface';
import { handleUpdateInterface } from '../../interface/high/handleUpdateInterface';
import { handleDeleteMetadataExtension } from '../../metadata_extension/high/handleDeleteMetadataExtension';
import { handleCreatePackage } from '../../package/high/handleCreatePackage';
import { handleCreateProgram } from '../../program/high/handleCreateProgram';
import { handleDeleteProgram } from '../../program/high/handleDeleteProgram';
import { handleUpdateProgram } from '../../program/high/handleUpdateProgram';
import { handleCreateServiceBinding } from '../../service_binding/high/handleCreateServiceBinding';
import { handleDeleteServiceBinding } from '../../service_binding/high/handleDeleteServiceBinding';
import { handleUpdateServiceBinding } from '../../service_binding/high/handleUpdateServiceBinding';
import { handleCreateServiceDefinition } from '../../service_definition/high/handleCreateServiceDefinition';
import { handleDeleteServiceDefinition } from '../../service_definition/high/handleDeleteServiceDefinition';
import { handleUpdateServiceDefinition } from '../../service_definition/high/handleUpdateServiceDefinition';
import { handleCreateStructure } from '../../structure/high/handleCreateStructure';
import { handleDeleteStructure } from '../../structure/high/handleDeleteStructure';
import { handleUpdateStructure } from '../../structure/high/handleUpdateStructure';
import { handleCreateTable } from '../../table/high/handleCreateTable';
import { handleDeleteTable } from '../../table/high/handleDeleteTable';
import { handleUpdateTable } from '../../table/high/handleUpdateTable';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';
import { handleCreateCdsUnitTest } from '../../unit_test/high/handleCreateCdsUnitTest';
import { handleCreateUnitTest } from '../../unit_test/high/handleCreateUnitTest';
import { handleDeleteCdsUnitTest } from '../../unit_test/high/handleDeleteCdsUnitTest';
import { handleDeleteUnitTest } from '../../unit_test/high/handleDeleteUnitTest';
import { handleUpdateCdsUnitTest } from '../../unit_test/high/handleUpdateCdsUnitTest';
import { handleUpdateUnitTest } from '../../unit_test/high/handleUpdateUnitTest';

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
