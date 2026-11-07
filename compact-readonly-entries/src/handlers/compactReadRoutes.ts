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

import {
  type CompactHandler,
  type CompactObjectType,
  type CompactRouterMap,
  dispatchCompact,
} from '@mcp-abap-adt/lib/compact-shared';
import { defineTool, type ToolArgs } from '@mcp-abap-adt/lib/handlers';
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
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';

const D = READ_DEFINITIONS;

/** Each read route: the call of its target tool's entry. */
const route = {
  PACKAGE: defineTool(D.GetPackage, handleGetPackage).call,
  DOMAIN: defineTool(D.GetDomain, handleGetDomain).call,
  DATA_ELEMENT: defineTool(D.GetDataElement, handleGetDataElement).call,
  TRANSPORT: defineTool(D.ReadTransportObjects, handleReadTransportObjects)
    .call,
  TABLE: defineTool(D.GetTable, handleGetTable).call,
  STRUCTURE: defineTool(D.GetStructure, handleGetStructure).call,
  TABLE_TYPE: defineTool(D.GetTableType, handleGetTableType).call,
  DDL: defineTool(D.GetDdl, handleGetDdl).call,
  SERVICE_DEFINITION: defineTool(
    D.GetServiceDefinition,
    handleGetServiceDefinition,
  ).call,
  SERVICE_BINDING: defineTool(D.GetServiceBinding, handleGetServiceBinding)
    .call,
  CLASS: defineTool(D.GetClass, handleGetClass).call,
  // A unit-test run's result, read once: the status is the caller's to read.
  // Both read what GetUnitTestResult declares (a run of either kind).
  UNIT_TEST: defineTool(D.GetUnitTestResult, (context, args) =>
    handleGetUnitTestResultOnce(context, args, 'HandlerGet'),
  ).call,
  CDS_UNIT_TEST: defineTool(
    { ...D.GetCdsUnitTestResult, inputSchema: D.GetUnitTestResult.inputSchema },
    (context, args) =>
      handleGetCdsUnitTestResultOnce(context, args, 'HandlerGet'),
  ).call,
  LOCAL_TEST_CLASS: defineTool(D.GetLocalTestClass, handleGetLocalTestClass)
    .call,
  LOCAL_TYPES: defineTool(D.GetLocalTypes, handleGetLocalTypes).call,
  LOCAL_DEFINITIONS: defineTool(
    D.GetLocalDefinitions,
    handleGetLocalDefinitions,
  ).call,
  LOCAL_MACROS: defineTool(D.GetLocalMacros, handleGetLocalMacros).call,
  PROGRAM: defineTool(D.GetProgram, handleGetProgram).call,
  INCLUDE: defineTool(D.GetInclude, handleGetIncludePart).call,
  INTERFACE: defineTool(D.GetInterface, handleGetInterface).call,
  FUNCTION_GROUP: defineTool(D.GetFunctionGroup, handleGetFunctionGroup).call,
  FUNCTION_MODULE: defineTool(D.GetFunctionModule, handleGetFunctionModule)
    .call,
  BEHAVIOR_DEFINITION: defineTool(
    D.GetBehaviorDefinition,
    handleGetBehaviorDefinition,
  ).call,
  BEHAVIOR_IMPLEMENTATION: defineTool(
    D.GetBehaviorImplementation,
    handleGetBehaviorImplementation,
  ).call,
  METADATA_EXTENSION: defineTool(
    D.GetMetadataExtension,
    handleGetMetadataExtension,
  ).call,
} as const satisfies Partial<Record<CompactObjectType, CompactHandler>>;

/** An include's read of `part`: GetInclude's, with the part fixed. */
export const readIncludePart =
  (part: 'source' | 'metadata'): CompactHandler =>
  (context, args) =>
    route.INCLUDE(context, { ...args, part });

/** An include's main programs (`part: 'main_programs'`): GetMainPrograms'. */
export const readMainPrograms: CompactHandler = defineTool(
  D.GetMainPrograms,
  handleGetMainPrograms,
).call;

/** The table type's read: GetTableType's (metadata, its one part). */
export const readTableType: CompactHandler = route.TABLE_TYPE;

/** The source read of each object type, by its target tool's entry. */
export const compactSourceRoutes = route;

export const compactReadRouterMap: CompactRouterMap = {
  PACKAGE: { get: route.PACKAGE },
  DOMAIN: { get: route.DOMAIN },
  DATA_ELEMENT: { get: route.DATA_ELEMENT },
  TRANSPORT: { get: route.TRANSPORT },
  TABLE: { get: route.TABLE },
  STRUCTURE: { get: route.STRUCTURE },
  TABLE_TYPE: { get: readTableType },
  DDL: { get: route.DDL },
  SERVICE_DEFINITION: { get: route.SERVICE_DEFINITION },
  SERVICE_BINDING: { get: route.SERVICE_BINDING },
  CLASS: { get: route.CLASS },
  UNIT_TEST: { get: route.UNIT_TEST },
  CDS_UNIT_TEST: { get: route.CDS_UNIT_TEST },
  LOCAL_TEST_CLASS: { get: route.LOCAL_TEST_CLASS },
  LOCAL_TYPES: { get: route.LOCAL_TYPES },
  LOCAL_DEFINITIONS: { get: route.LOCAL_DEFINITIONS },
  LOCAL_MACROS: { get: route.LOCAL_MACROS },
  PROGRAM: { get: route.PROGRAM },
  INCLUDE: { get: readIncludePart('source') },
  INTERFACE: { get: route.INTERFACE },
  FUNCTION_GROUP: { get: route.FUNCTION_GROUP },
  FUNCTION_MODULE: { get: route.FUNCTION_MODULE },
  BEHAVIOR_DEFINITION: { get: route.BEHAVIOR_DEFINITION },
  BEHAVIOR_IMPLEMENTATION: { get: route.BEHAVIOR_IMPLEMENTATION },
  METADATA_EXTENSION: { get: route.METADATA_EXTENSION },
  // No CRUD: a profiler run and a dump are read through their own tools.
  RUNTIME_PROFILE: {},
  RUNTIME_DUMP: {},
};

/** Route a compact read. The only operation this half carries is `get`. */
export async function routeCompactRead(
  context: Parameters<typeof dispatchCompact>[0],
  args: { readonly object_type?: CompactObjectType } & ToolArgs,
): Promise<unknown> {
  return dispatchCompact(context, compactReadRouterMap, 'get', args);
}
