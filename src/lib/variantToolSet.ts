/**
 * The tool set of a variant, built from its ADT type table (#329, spec 5).
 *
 * The process's declared system type names the variant: `onprem` (and
 * `legacy`, an on-premise system, as `statedSystemKind` reads it) is
 * `ADT_TYPES_ONPREM`, `cloud` is `ADT_TYPES_CLOUD`. A tool that works on
 * one API of the client names what it needs of it — one operation of that
 * API ({@link TOOL_NEEDS}). A tool the variant's table does not serve is not
 * registered for that variant. A tool whose arguments name objects' types
 * states its enums and descriptions per variant (`variants`, built from the
 * projections of `adtProjections.ts`): the declared variant's are
 * registered, so a value the table does not serve there is not offered.
 *
 * **Beside `available_in`, not instead of it.** A tool is registered when
 * `available_in` admits the environment *and* the table serves its need: the
 * table only removes. Where a tool is restricted by `available_in` although
 * the table serves it, `available_in` keeps deciding. Discovery stays where it
 * decides today (a feed, a collection the system announces): the table is the
 * type gate, not the system's word.
 *
 * With no variant declared (an embedder's own transport host that states
 * none) nothing is filtered, as with `available_in`; a call that would reach
 * a system is refused `system_type_required` before anything is sent.
 */
import {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  type AdtApiTable,
} from '@mcp-abap-adt/interfaces-adt';
import type { AdtNeed } from './adtProjections';
import type { ServerVariant } from './clients';
import type { SapEnvironment, ToolDefinition } from './handlers/interfaces';
import { statedSystemKind } from './systemKind';

export type { AdtNeed } from './adtProjections';

/** The table of each variant the server serves. */
const TABLES: { readonly [V in ServerVariant]: AdtApiTable<string> } = {
  onprem: ADT_TYPES_ONPREM,
  cloud: ADT_TYPES_CLOUD,
};

/**
 * Whether `variant`'s table lists `need`: the API is in the table, and its
 * codeless entry, or one of its codes, lists the operation.
 */
export function variantServes(variant: ServerVariant, need: AdtNeed): boolean {
  const entry = TABLES[variant][need.api];
  if (entry === undefined) return false;
  if (entry.operations !== undefined) {
    return entry.operations.includes(need.operation);
  }
  return Object.values(entry.codes).some((facts) =>
    facts.operations.includes(need.operation),
  );
}

/**
 * What each tool of the object-oriented groups that works on one API of the
 * client needs. A tool of those groups not named here works on no single
 * API ({@link TOOLS_WITHOUT_NEED}): a group operation, a search, a runtime
 * feed, the debugger.
 */
const TOOL_NEEDS_BY_NAME = {
  GetInclude: { api: 'include', operation: 'read' },
  GetEnhancementSpot: { api: 'enhancement', operation: 'readMetadata' },
  GetEnhancementImpl: { api: 'enhancement', operation: 'read' },
  GetTransport: { api: 'request', operation: 'readMetadata' },
  ListTransports: { api: 'request', operation: 'list' },
  ReadTransportObjects: { api: 'request', operation: 'readObjects' },
  ReadTransportActionLog: { api: 'request', operation: 'readActionLog' },
  GetUnitTestResult: { api: 'class', operation: 'unitTestResult' },
  GetBehaviorDefinition: { api: 'behaviorDefinition', operation: 'read' },
  GetBehaviorImplementation: {
    api: 'behaviorImplementation',
    operation: 'read',
  },
  GetClass: { api: 'class', operation: 'read' },
  GetDataElement: { api: 'dataElement', operation: 'readMetadata' },
  GetDdl: { api: 'ddl', operation: 'read' },
  GetDomain: { api: 'domain', operation: 'readMetadata' },
  GetFunctionGroup: { api: 'functionGroup', operation: 'read' },
  GetFunctionInclude: { api: 'functionInclude', operation: 'read' },
  GetFunctionModule: { api: 'functionModule', operation: 'read' },
  GetInterface: { api: 'interface', operation: 'read' },
  GetMessageClass: { api: 'messageClass', operation: 'readMetadata' },
  GetMessageClassMessage: { api: 'messageClassMessage', operation: 'read' },
  GetMetadataExtension: { api: 'metadataExtension', operation: 'read' },
  GetPackage: { api: 'package', operation: 'readMetadata' },
  GetProgram: { api: 'program', operation: 'read' },
  GetServiceBinding: { api: 'serviceBinding', operation: 'read' },
  GetServiceDefinition: { api: 'serviceDefinition', operation: 'read' },
  GetStructure: { api: 'structure', operation: 'read' },
  GetTable: { api: 'table', operation: 'read' },
  ActivateDomain: { api: 'domain', operation: 'activate' },
  ActivateDataElement: { api: 'dataElement', operation: 'activate' },
  ActivateTable: { api: 'table', operation: 'activate' },
  ActivateStructure: { api: 'structure', operation: 'activate' },
  ActivateDdl: { api: 'ddl', operation: 'activate' },
  ActivateClass: { api: 'class', operation: 'activate' },
  ActivateInterface: { api: 'interface', operation: 'activate' },
  ActivateProgram: { api: 'program', operation: 'activate' },
  ActivateFunctionModule: { api: 'functionModule', operation: 'activate' },
  ActivateFunctionGroup: { api: 'functionGroup', operation: 'activate' },
  ActivateBehaviorDefinition: {
    api: 'behaviorDefinition',
    operation: 'activate',
  },
  ActivateMetadataExtension: {
    api: 'metadataExtension',
    operation: 'activate',
  },
  ActivateServiceDefinition: {
    api: 'serviceDefinition',
    operation: 'activate',
  },
  ActivateServiceBinding: { api: 'serviceBinding', operation: 'activate' },
  CreatePackage: { api: 'package', operation: 'create' },
  UpdatePackage: { api: 'package', operation: 'updateMetadata' },
  DeletePackage: { api: 'package', operation: 'delete' },
  CreateDomain: { api: 'domain', operation: 'create' },
  UpdateDomain: { api: 'domain', operation: 'updateMetadata' },
  DeleteDomain: { api: 'domain', operation: 'delete' },
  CreateMessageClass: { api: 'messageClass', operation: 'create' },
  UpdateMessageClass: { api: 'messageClass', operation: 'updateMetadata' },
  DeleteMessageClass: { api: 'messageClass', operation: 'delete' },
  CreateMessageClassMessage: {
    api: 'messageClassMessage',
    operation: 'create',
  },
  UpdateMessageClassMessage: {
    api: 'messageClassMessage',
    operation: 'update',
  },
  DeleteMessageClassMessage: {
    api: 'messageClassMessage',
    operation: 'delete',
  },
  CreateDataElement: { api: 'dataElement', operation: 'create' },
  UpdateDataElement: { api: 'dataElement', operation: 'updateMetadata' },
  DeleteDataElement: { api: 'dataElement', operation: 'delete' },
  CreateTransport: { api: 'request', operation: 'create' },
  CreateTransportTask: { api: 'request', operation: 'createTask' },
  RemoveTransportObject: { api: 'request', operation: 'removeObject' },
  SortAndCompressTransportTask: {
    api: 'request',
    operation: 'sortAndCompress',
  },
  MoveTransportObjects: { api: 'request', operation: 'moveObjects' },
  AddTransportObject: { api: 'request', operation: 'addObject' },
  CreateTable: { api: 'table', operation: 'create' },
  UpdateTable: { api: 'table', operation: 'update' },
  DeleteTable: { api: 'table', operation: 'delete' },
  CreateStructure: { api: 'structure', operation: 'create' },
  UpdateStructure: { api: 'structure', operation: 'update' },
  DeleteStructure: { api: 'structure', operation: 'delete' },
  CreateDdl: { api: 'ddl', operation: 'create' },
  UpdateDdl: { api: 'ddl', operation: 'update' },
  DeleteDdl: { api: 'ddl', operation: 'delete' },
  CreateServiceDefinition: { api: 'serviceDefinition', operation: 'create' },
  UpdateServiceDefinition: { api: 'serviceDefinition', operation: 'update' },
  DeleteServiceDefinition: { api: 'serviceDefinition', operation: 'delete' },
  CreateServiceBinding: { api: 'serviceBinding', operation: 'create' },
  ListServiceBindingTypes: {
    api: 'serviceBinding',
    operation: 'getServiceBindingTypes',
  },
  UpdateServiceBinding: { api: 'serviceBinding', operation: 'update' },
  ValidateServiceBinding: { api: 'serviceBinding', operation: 'validate' },
  DeleteServiceBinding: { api: 'serviceBinding', operation: 'delete' },
  CreateClass: { api: 'class', operation: 'create' },
  UpdateClass: { api: 'class', operation: 'update' },
  DeleteClass: { api: 'class', operation: 'delete' },
  CreateUnitTest: { api: 'localTestClass', operation: 'update' },
  RunUnitTest: { api: 'class', operation: 'unitTestRun' },
  UpdateUnitTest: { api: 'localTestClass', operation: 'update' },
  DeleteUnitTest: { api: 'localTestClass', operation: 'update' },
  CreateCdsUnitTest: { api: 'class', operation: 'create' },
  UpdateCdsUnitTest: { api: 'localTestClass', operation: 'update' },
  DeleteCdsUnitTest: { api: 'class', operation: 'delete' },
  RunCdsUnitTest: { api: 'class', operation: 'unitTestRun' },
  CreateProgramUnitTest: { api: 'include', operation: 'create' },
  UpdateProgramUnitTest: { api: 'include', operation: 'update' },
  RunProgramUnitTest: { api: 'program', operation: 'unitTestRun' },
  CreateFunctionGroupUnitTest: { api: 'functionInclude', operation: 'create' },
  UpdateFunctionGroupUnitTest: { api: 'functionInclude', operation: 'update' },
  RunFunctionGroupUnitTest: { api: 'functionGroup', operation: 'unitTestRun' },
  RunFunctionModuleUnitTest: {
    api: 'functionModule',
    operation: 'unitTestRun',
  },
  GetLocalTestClass: { api: 'localTestClass', operation: 'read' },
  UpdateLocalTestClass: { api: 'localTestClass', operation: 'update' },
  DeleteLocalTestClass: { api: 'localTestClass', operation: 'delete' },
  GetLocalTypes: { api: 'localTypes', operation: 'read' },
  UpdateLocalTypes: { api: 'localTypes', operation: 'update' },
  DeleteLocalTypes: { api: 'localTypes', operation: 'delete' },
  GetLocalDefinitions: { api: 'localDefinitions', operation: 'read' },
  UpdateLocalDefinitions: { api: 'localDefinitions', operation: 'update' },
  DeleteLocalDefinitions: { api: 'localDefinitions', operation: 'delete' },
  GetLocalMacros: { api: 'localMacros', operation: 'read' },
  UpdateLocalMacros: { api: 'localMacros', operation: 'update' },
  DeleteLocalMacros: { api: 'localMacros', operation: 'delete' },
  CreateProgram: { api: 'program', operation: 'create' },
  UpdateProgram: { api: 'program', operation: 'update' },
  DeleteProgram: { api: 'program', operation: 'delete' },
  CreateInterface: { api: 'interface', operation: 'create' },
  UpdateInterface: { api: 'interface', operation: 'update' },
  DeleteInterface: { api: 'interface', operation: 'delete' },
  CreateFunctionGroup: { api: 'functionGroup', operation: 'create' },
  UpdateFunctionGroup: { api: 'functionGroup', operation: 'update' },
  DeleteFunctionGroup: { api: 'functionGroup', operation: 'delete' },
  CreateFunctionModule: { api: 'functionModule', operation: 'create' },
  UpdateFunctionModule: { api: 'functionModule', operation: 'update' },
  DeleteFunctionModule: { api: 'functionModule', operation: 'delete' },
  CreateFunctionInclude: { api: 'functionInclude', operation: 'create' },
  UpdateFunctionInclude: { api: 'functionInclude', operation: 'update' },
  DeleteFunctionInclude: { api: 'functionInclude', operation: 'delete' },
  CreateBehaviorDefinition: { api: 'behaviorDefinition', operation: 'create' },
  UpdateBehaviorDefinition: { api: 'behaviorDefinition', operation: 'update' },
  DeleteBehaviorDefinition: { api: 'behaviorDefinition', operation: 'delete' },
  CreateBehaviorImplementation: {
    api: 'behaviorImplementation',
    operation: 'create',
  },
  UpdateBehaviorImplementation: {
    api: 'behaviorImplementation',
    operation: 'update',
  },
  DeleteBehaviorImplementation: {
    api: 'behaviorImplementation',
    operation: 'delete',
  },
  CreateMetadataExtension: { api: 'metadataExtension', operation: 'create' },
  UpdateMetadataExtension: { api: 'metadataExtension', operation: 'update' },
  DeleteMetadataExtension: { api: 'metadataExtension', operation: 'delete' },
  CheckBehaviorDefinition: { api: 'behaviorDefinition', operation: 'check' },
  CheckClass: { api: 'class', operation: 'check' },
  CheckDataElement: { api: 'dataElement', operation: 'check' },
  CheckDomain: { api: 'domain', operation: 'check' },
  CheckFunctionGroup: { api: 'functionGroup', operation: 'check' },
  CheckFunctionModule: { api: 'functionModule', operation: 'check' },
  CheckInterface: { api: 'interface', operation: 'check' },
  CheckMetadataExtension: { api: 'metadataExtension', operation: 'check' },
  CheckPackage: { api: 'package', operation: 'check' },
  CheckProgram: { api: 'program', operation: 'check' },
  CheckStructure: { api: 'structure', operation: 'check' },
  CheckTable: { api: 'table', operation: 'check' },
  CheckDdl: { api: 'ddl', operation: 'check' },
  GetClassVersions: { api: 'class', operation: 'versions' },
  GetClassVersionSource: { api: 'class', operation: 'versions' },
  GetClassVersionDiff: { api: 'class', operation: 'versions' },
  GetProgramVersions: { api: 'program', operation: 'versions' },
  GetProgramVersionSource: { api: 'program', operation: 'versions' },
  GetProgramVersionDiff: { api: 'program', operation: 'versions' },
  GetInterfaceVersions: { api: 'interface', operation: 'versions' },
  GetInterfaceVersionSource: { api: 'interface', operation: 'versions' },
  GetInterfaceVersionDiff: { api: 'interface', operation: 'versions' },
  GetFunctionModuleVersions: { api: 'functionModule', operation: 'versions' },
  GetFunctionModuleVersionSource: {
    api: 'functionModule',
    operation: 'versions',
  },
  GetFunctionModuleVersionDiff: {
    api: 'functionModule',
    operation: 'versions',
  },
  GetTableVersions: { api: 'table', operation: 'versions' },
  GetTableVersionSource: { api: 'table', operation: 'versions' },
  GetTableVersionDiff: { api: 'table', operation: 'versions' },
  GetStructureVersions: { api: 'structure', operation: 'versions' },
  GetStructureVersionSource: { api: 'structure', operation: 'versions' },
  GetStructureVersionDiff: { api: 'structure', operation: 'versions' },
  GetDdlVersions: { api: 'ddl', operation: 'versions' },
  GetDdlVersionSource: { api: 'ddl', operation: 'versions' },
  GetDdlVersionDiff: { api: 'ddl', operation: 'versions' },
  GetBehaviorDefinitionVersions: {
    api: 'behaviorDefinition',
    operation: 'versions',
  },
  GetBehaviorDefinitionVersionSource: {
    api: 'behaviorDefinition',
    operation: 'versions',
  },
  GetBehaviorDefinitionVersionDiff: {
    api: 'behaviorDefinition',
    operation: 'versions',
  },
  GetMetadataExtensionVersions: {
    api: 'metadataExtension',
    operation: 'versions',
  },
  GetMetadataExtensionVersionSource: {
    api: 'metadataExtension',
    operation: 'versions',
  },
  GetMetadataExtensionVersionDiff: {
    api: 'metadataExtension',
    operation: 'versions',
  },
  RuntimeRunClass: { api: 'class', operation: 'run' },
  RuntimeRunProgram: { api: 'program', operation: 'run' },
} as const satisfies Readonly<Record<string, AdtNeed>>;

/** Every tool name of {@link TOOL_NEEDS_BY_NAME}. */
export type ToolWithNeed = keyof typeof TOOL_NEEDS_BY_NAME;

/** The need of each tool that has one, by its name. */
export const TOOL_NEEDS: ReadonlyMap<string, AdtNeed> = new Map(
  Object.entries(TOOL_NEEDS_BY_NAME),
);

/**
 * The tools of the object-oriented groups that work on no single API of the
 * client: group operations (activation, where-used, the repository
 * structure), searches, ATC, the runtime feeds and traces, the debugger.
 * The table does not gate them; `available_in` and discovery still do.
 */
export const TOOLS_WITHOUT_NEED: ReadonlySet<string> = new Set([
  'GetTableContents',
  'GetPackageContents',
  'GetIncludesList',
  'GetEnhancements',
  'GetStructuresList',
  'GetObjectVersions',
  'GetObjectVersionSource',
  'GetObjectVersionDiff',
  'ListFunctionGroupIncludes',
  'ListFunctionModules',
  'RunATC',
  'GetATCRunStatus',
  'GetATCFindings',
  'ActivateObjects',
  'GetServiceBindingPreviewUrl',
  'GetTypeInfo',
  'GetTransaction',
  'RuntimeCreateProfilerTraceParameters',
  'RuntimeListProfilerTraceFiles',
  'RuntimeGetProfilerTraceData',
  'RuntimeGetDumpById',
  'RuntimeAnalyzeProfilerTrace',
  'RuntimeListFeeds',
  'RuntimeListSystemMessages',
  'RuntimeGetGatewayErrorLog',
  'GetSqlQuery',
  'GetWhereUsed',
  'GetObjectInfo',
  'GetAbapAST',
  'GetAbapSemanticAnalysis',
  'GetAbapSystemSymbols',
  'GetInactiveObjects',
  'GetAdtTypes',
  'GetObjectStructure',
  'GetObjectNodeFromCache',
  'DescribeByList',
  'GetPackageTree',
  'SearchObject',
  'SearchSource',
  'GetObjectsList',
  'GetObjectsByType',
  'DebugStartListener',
  'DebugTakeOverListener',
  'DebugWait',
  'DebugSetBreakpoints',
  'DebugDeleteBreakpoint',
  'DebugListBreakpoints',
  'DebugGetStack',
  'DebugSetStackPosition',
  'DebugGetVariables',
  'DebugSetVariable',
  'DebugStep',
  'DebugStepToLine',
  'DebugTerminate',
  'DebugSetSettings',
  'DebugCreateWatchpoint',
  'DebugListWatchpoints',
  'DebugDeleteWatchpoint',
  'DebugGetMemorySizes',
  'DebugCreateMemorySnapshot',
  'DebugStop',
  'AmdpDebugStart',
  'AmdpDebugSetBreakpoints',
  'AmdpDebugWait',
  'AmdpDebugStep',
  'AmdpDebugGetTable',
  'AmdpDebugCancel',
  'AmdpDebugStop',
  'MemorySnapshotList',
  'MemorySnapshotGet',
  'MemorySnapshotDelta',
]);

/**
 * The variant a stated environment names: `cloud` is ABAP cloud, `onprem`
 * and `legacy` the on-premise table (`statedSystemKind`).
 */
export function variantOfEnvironment(
  environment: SapEnvironment,
): ServerVariant {
  return statedSystemKind(environment) === 'cloud' ? 'cloud' : 'onprem';
}

/**
 * The definition `variant` registers for `definition`: `undefined` when the
 * variant's table does not serve the tool's need; for a tool whose arguments
 * are projected from the tables (`variants`), what it states on that
 * variant; else the definition as it is.
 */
export function servedDefinition(
  definition: ToolDefinition,
  variant: ServerVariant,
): ToolDefinition | undefined {
  const need = TOOL_NEEDS.get(definition.name);
  if (need !== undefined && !variantServes(variant, need)) return undefined;
  const stated = definition.variants?.[variant];
  if (stated === undefined) return definition;
  return {
    ...definition,
    description: stated.description,
    inputSchema: stated.inputSchema,
  };
}
