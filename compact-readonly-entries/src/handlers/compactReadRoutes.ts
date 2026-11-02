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
  CompactObjectType,
  ReadVersion,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  handleGetBehaviorDefinition,
  handleGetBehaviorImplementation,
  handleGetCdsUnitTestResultOnce,
  handleGetClass,
  handleGetDataElement,
  handleGetDdl,
  handleGetDomain,
  handleGetFunctionGroup,
  handleGetFunctionModule,
  handleGetIncludePart,
  handleGetInterface,
  handleGetLocalDefinitions,
  handleGetLocalMacros,
  handleGetLocalTestClass,
  handleGetLocalTypes,
  handleGetMainPrograms,
  handleGetMetadataExtension,
  handleGetPackage,
  handleGetProgram,
  handleGetServiceBinding,
  handleGetServiceDefinition,
  handleGetStructure,
  handleGetTable,
  handleGetTableType,
  handleGetUnitTestResultOnce,
  handleReadTransportObjects,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

/**
 * The version a read is asked for, from outside the type system: absent, or
 * one of the three ADT takes; anything else is an error naming them.
 */
function readVersionOf(given: unknown): ReadVersion | undefined | Error {
  if (given === undefined) return undefined;
  if (given === 'active' || given === 'inactive' || given === 'workingArea') {
    return given;
  }
  return new Error('version must be "active", "inactive" or "workingArea"');
}

/**
 * A table type's read: its metadata document, the one part it has, at the
 * version given. The arguments arrive from outside the type system: the name
 * is passed on only as a string, and a version only as one of the three the
 * read takes.
 */
export const readTableType: CompactHandler = async (context, args) => {
  const version = readVersionOf(args.version);
  if (version instanceof Error) return return_error(version);
  return handleGetTableType(context, {
    table_type_name:
      typeof args.table_type_name === 'string'
        ? args.table_type_name
        : undefined,
    version,
  });
};

/**
 * An include's read of `part` (`source` here, `metadata` from the metadata
 * route), answered as a program's: the source too beside its name. The
 * arguments arrive from outside the type system: the name is passed on only
 * as a string, and a version only as one of the three the read takes.
 */
/**
 * An include's main programs (`part: 'main_programs'`). The name arrives from
 * outside the type system and is passed on only as a string.
 */
export const readMainPrograms: CompactHandler = async (context, args) =>
  handleGetMainPrograms(context, {
    include_name:
      typeof args.include_name === 'string' ? args.include_name : undefined,
  });

export const readIncludePart =
  (part: 'source' | 'metadata'): CompactHandler =>
  async (context, args) => {
    const version = readVersionOf(args.version);
    if (version instanceof Error) return return_error(version);
    return handleGetIncludePart(context, {
      include_name:
        typeof args.include_name === 'string' ? args.include_name : undefined,
      part,
      version,
    });
  };

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
  TRANSPORT: {
    get: handleReadTransportObjects as unknown as CompactHandler,
  },
  TABLE: {
    get: handleGetTable as unknown as CompactHandler,
  },
  STRUCTURE: {
    get: handleGetStructure as unknown as CompactHandler,
  },
  TABLE_TYPE: {
    get: readTableType,
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
  // A unit-test run's result, read once: the status is the caller's to read.
  UNIT_TEST: {
    get: (context, args) =>
      handleGetUnitTestResultOnce(context, args, 'HandlerGet'),
  },
  CDS_UNIT_TEST: {
    get: (context, args) =>
      handleGetCdsUnitTestResultOnce(context, args, 'HandlerGet'),
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
  INCLUDE: {
    get: readIncludePart('source'),
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
  args: { object_type?: CompactObjectType } & Record<string, unknown>,
): Promise<unknown> {
  return dispatchCompact(context, compactReadRouterMap, 'get', args);
}
