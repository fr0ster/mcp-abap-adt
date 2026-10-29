/**
 * The tool set of a variant, built from its ADT type table (#329, spec 5).
 *
 * The process's declared system type names the variant: `onprem` (and
 * `legacy`, an on-premise system, as `statedSystemKind` reads it) is
 * `ADT_TYPES_ONPREM`, `cloud` is `ADT_TYPES_CLOUD`. A tool that works on
 * one API of the client names what it needs of it — one operation of that
 * API ({@link TOOL_NEEDS}); a compact tool whose `object_type` (or
 * `target_type`) picks the API names what each member needs
 * ({@link COMPACT_MEMBER_NEEDS}). A tool the variant's table does not serve
 * is not registered for that variant, and a member it does not serve is not
 * in the argument's enum there.
 *
 * **Beside `available_in`, not instead of it.** A tool is registered when
 * `available_in` admits the environment *and* the table serves its need: the
 * table only removes. Where a tool is restricted by `available_in` although
 * the table serves it (`GetProgram` on cloud: `ADT_TYPES_CLOUD` lists a
 * program's `read`), `available_in` keeps deciding. For programs on cloud
 * that is a decision, not a gap: a user creates no program there, and the
 * SAP programs ADT still serves are not what the tools are for. Discovery stays where it
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
  type AdtApiName,
  type AdtApiTable,
  type AdtApiWith,
  type AdtOperation,
} from '@mcp-abap-adt/interfaces-adt';
import type { ServerVariant } from './clients';
import type { CompactObjectType } from './compact/compactObjectTypes';
import type { SapEnvironment, ToolDefinition } from './handlers/interfaces';
import { statedSystemKind } from './systemKind';

/**
 * The operations some table lists for API `A` (one of its codes, or its
 * codeless entry): a need naming another does not compile.
 */
type AdtOperationOf<A extends AdtApiName> = {
  [Op in AdtOperation]: A extends
    | AdtApiWith<'onprem', Op>
    | AdtApiWith<'cloud', Op>
    | AdtApiWith<'basis740', Op>
    ? Op
    : never;
}[AdtOperation];

/** What a tool needs of the variant's table: one operation of one API. */
export type AdtNeed = {
  [A in AdtApiName]: {
    readonly api: A;
    readonly operation: AdtOperationOf<A>;
  };
}[AdtApiName];

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

/** What a compact tool's members need: the argument, and each member's need. */
export interface CompactMemberNeeds {
  /** The argument whose enum lists the members. */
  readonly argument: 'object_type' | 'target_type';
  /**
   * Each member's need. A member not named here (a runtime profile, a type
   * the tool does not route) is not gated.
   */
  readonly members: Readonly<Partial<Record<CompactObjectType, AdtNeed>>>;
}

/** The objects every compact CRUD tool routes, with the API each is of. */
const create = {
  PACKAGE: { api: 'package', operation: 'create' },
  DOMAIN: { api: 'domain', operation: 'create' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'create' },
  TRANSPORT: { api: 'request', operation: 'create' },
  TABLE: { api: 'table', operation: 'create' },
  STRUCTURE: { api: 'structure', operation: 'create' },
  DDL: { api: 'ddl', operation: 'create' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'create' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'create' },
  CLASS: { api: 'class', operation: 'create' },
  UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  CDS_UNIT_TEST: { api: 'class', operation: 'create' },
  PROGRAM: { api: 'program', operation: 'create' },
  INTERFACE: { api: 'interface', operation: 'create' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'create' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'create' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'create' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'create',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'create' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

const read = {
  PACKAGE: { api: 'package', operation: 'readMetadata' },
  DOMAIN: { api: 'domain', operation: 'readMetadata' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'readMetadata' },
  TRANSPORT: { api: 'request', operation: 'readObjects' },
  TABLE: { api: 'table', operation: 'read' },
  STRUCTURE: { api: 'structure', operation: 'read' },
  DDL: { api: 'ddl', operation: 'read' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'read' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'read' },
  CLASS: { api: 'class', operation: 'read' },
  UNIT_TEST: { api: 'class', operation: 'unitTestResult' },
  CDS_UNIT_TEST: { api: 'class', operation: 'unitTestResult' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'read' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'read' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'read' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'read' },
  PROGRAM: { api: 'program', operation: 'read' },
  INTERFACE: { api: 'interface', operation: 'read' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'read' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'read' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'read' },
  BEHAVIOR_IMPLEMENTATION: { api: 'behaviorImplementation', operation: 'read' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'read' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

const update = {
  PACKAGE: { api: 'package', operation: 'updateMetadata' },
  DOMAIN: { api: 'domain', operation: 'updateMetadata' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'updateMetadata' },
  TABLE: { api: 'table', operation: 'update' },
  STRUCTURE: { api: 'structure', operation: 'update' },
  DDL: { api: 'ddl', operation: 'update' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'update' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'update' },
  CLASS: { api: 'class', operation: 'update' },
  UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  CDS_UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'update' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'update' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'update' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'update' },
  PROGRAM: { api: 'program', operation: 'update' },
  INTERFACE: { api: 'interface', operation: 'update' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'update' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'update' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'update' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'update',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'update' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

const remove = {
  PACKAGE: { api: 'package', operation: 'delete' },
  DOMAIN: { api: 'domain', operation: 'delete' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'delete' },
  TABLE: { api: 'table', operation: 'delete' },
  STRUCTURE: { api: 'structure', operation: 'delete' },
  DDL: { api: 'ddl', operation: 'delete' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'delete' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'delete' },
  CLASS: { api: 'class', operation: 'delete' },
  // A class include and the unit tests are deleted by writing the include
  // empty under the class's lock (`handleDeleteOnly`).
  UNIT_TEST: { api: 'localTestClass', operation: 'update' },
  CDS_UNIT_TEST: { api: 'class', operation: 'delete' },
  LOCAL_TEST_CLASS: { api: 'localTestClass', operation: 'update' },
  LOCAL_TYPES: { api: 'localTypes', operation: 'update' },
  LOCAL_DEFINITIONS: { api: 'localDefinitions', operation: 'update' },
  LOCAL_MACROS: { api: 'localMacros', operation: 'update' },
  PROGRAM: { api: 'program', operation: 'delete' },
  INTERFACE: { api: 'interface', operation: 'delete' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'delete' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'delete' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'delete' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'delete',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'delete' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** The single objects `HandlerActivate` activates from `object_type` alone. */
const activate = {
  CLASS: { api: 'class', operation: 'activate' },
  PROGRAM: { api: 'program', operation: 'activate' },
  INTERFACE: { api: 'interface', operation: 'activate' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'activate' },
  TABLE: { api: 'table', operation: 'activate' },
  STRUCTURE: { api: 'structure', operation: 'activate' },
  DDL: { api: 'ddl', operation: 'activate' },
  DOMAIN: { api: 'domain', operation: 'activate' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'activate' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'activate' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'activate' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'activate' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'activate' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** What `HandlerLock` and `HandlerUnlock` lock and unlock. */
const lock = {
  CLASS: { api: 'class', operation: 'lock' },
  PROGRAM: { api: 'program', operation: 'lock' },
  INTERFACE: { api: 'interface', operation: 'lock' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'lock' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'lock' },
  TABLE: { api: 'table', operation: 'lock' },
  STRUCTURE: { api: 'structure', operation: 'lock' },
  DDL: { api: 'ddl', operation: 'lock' },
  DOMAIN: { api: 'domain', operation: 'lock' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'lock' },
  PACKAGE: { api: 'package', operation: 'lock' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'lock' },
  BEHAVIOR_IMPLEMENTATION: { api: 'behaviorImplementation', operation: 'lock' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'lock' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'lock' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'lock' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** What `HandlerValidate` validates. */
const validate = {
  CLASS: { api: 'class', operation: 'validate' },
  PROGRAM: { api: 'program', operation: 'validate' },
  INTERFACE: { api: 'interface', operation: 'validate' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'validate' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'validate' },
  TABLE: { api: 'table', operation: 'validate' },
  STRUCTURE: { api: 'structure', operation: 'validate' },
  DDL: { api: 'ddl', operation: 'validate' },
  DOMAIN: { api: 'domain', operation: 'validate' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'validate' },
  PACKAGE: { api: 'package', operation: 'validate' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'validate' },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'validate',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'validate' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'validate' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** What `HandlerCheckRun` checks. */
const check = {
  CLASS: { api: 'class', operation: 'check' },
  PROGRAM: { api: 'program', operation: 'check' },
  INTERFACE: { api: 'interface', operation: 'check' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'check' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'check' },
  TABLE: { api: 'table', operation: 'check' },
  STRUCTURE: { api: 'structure', operation: 'check' },
  DDL: { api: 'ddl', operation: 'check' },
  DOMAIN: { api: 'domain', operation: 'check' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'check' },
  PACKAGE: { api: 'package', operation: 'check' },
  BEHAVIOR_DEFINITION: { api: 'behaviorDefinition', operation: 'check' },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'check' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** What `HandlerDeletionCheck` asks about. */
const deletionCheck = {
  PACKAGE: { api: 'package', operation: 'deletionCheck' },
  DOMAIN: { api: 'domain', operation: 'deletionCheck' },
  DATA_ELEMENT: { api: 'dataElement', operation: 'deletionCheck' },
  TABLE: { api: 'table', operation: 'deletionCheck' },
  STRUCTURE: { api: 'structure', operation: 'deletionCheck' },
  DDL: { api: 'ddl', operation: 'deletionCheck' },
  SERVICE_DEFINITION: { api: 'serviceDefinition', operation: 'deletionCheck' },
  SERVICE_BINDING: { api: 'serviceBinding', operation: 'deletionCheck' },
  CLASS: { api: 'class', operation: 'deletionCheck' },
  CDS_UNIT_TEST: { api: 'class', operation: 'deletionCheck' },
  PROGRAM: { api: 'program', operation: 'deletionCheck' },
  INTERFACE: { api: 'interface', operation: 'deletionCheck' },
  FUNCTION_GROUP: { api: 'functionGroup', operation: 'deletionCheck' },
  FUNCTION_MODULE: { api: 'functionModule', operation: 'deletionCheck' },
  BEHAVIOR_DEFINITION: {
    api: 'behaviorDefinition',
    operation: 'deletionCheck',
  },
  BEHAVIOR_IMPLEMENTATION: {
    api: 'behaviorImplementation',
    operation: 'deletionCheck',
  },
  METADATA_EXTENSION: { api: 'metadataExtension', operation: 'deletionCheck' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/** What `HandlerProfileRun` runs under the profiler. */
const profile = {
  CLASS: { api: 'class', operation: 'profile' },
  PROGRAM: { api: 'program', operation: 'profile' },
} as const satisfies Partial<Record<CompactObjectType, AdtNeed>>;

/**
 * Each compact tool whose members pick the API: the argument naming them, and
 * what each member needs. A compact tool not named here is not gated.
 */
export const COMPACT_MEMBER_NEEDS: ReadonlyMap<string, CompactMemberNeeds> =
  new Map<string, CompactMemberNeeds>([
    ['HandlerCreate', { argument: 'object_type', members: create }],
    ['HandlerGet', { argument: 'object_type', members: read }],
    ['HandlerUpdate', { argument: 'object_type', members: update }],
    ['HandlerDelete', { argument: 'object_type', members: remove }],
    ['HandlerActivate', { argument: 'object_type', members: activate }],
    ['HandlerLock', { argument: 'object_type', members: lock }],
    ['HandlerUnlock', { argument: 'object_type', members: lock }],
    ['HandlerValidate', { argument: 'object_type', members: validate }],
    ['HandlerCheckRun', { argument: 'object_type', members: check }],
    [
      'HandlerDeletionCheck',
      { argument: 'object_type', members: deletionCheck },
    ],
    ['HandlerProfileRun', { argument: 'target_type', members: profile }],
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

/** Whether a member of `needs` is served on `variant`: unnamed ones are. */
function memberServed(
  needs: CompactMemberNeeds,
  member: unknown,
  variant: ServerVariant,
): boolean {
  const need = Object.entries(needs.members).find(
    ([name]) => name === member,
  )?.[1];
  return need === undefined || variantServes(variant, need);
}

/**
 * The definition `variant` registers for `definition`: `undefined` when the
 * variant's table does not serve the tool's need; for a compact tool, its
 * members' enum without the members the table does not serve; else the
 * definition as it is.
 */
export function servedDefinition(
  definition: ToolDefinition,
  variant: ServerVariant,
): ToolDefinition | undefined {
  const need = TOOL_NEEDS.get(definition.name);
  if (need !== undefined && !variantServes(variant, need)) return undefined;
  const members = COMPACT_MEMBER_NEEDS.get(definition.name);
  if (members === undefined) return definition;
  const schema = definition.inputSchema;
  const property = schema?.properties?.[members.argument];
  const listed: unknown = property?.enum;
  if (!Array.isArray(listed)) return definition;
  const served = listed.filter((member) =>
    memberServed(members, member, variant),
  );
  if (served.length === listed.length) return definition;
  return {
    ...definition,
    inputSchema: {
      ...schema,
      properties: {
        ...schema.properties,
        [members.argument]: { ...property, enum: served },
      },
    },
  };
}
