/**
 * The sample calls that prove `tools/batch-handlers.json`, entry by entry:
 * `oneRequestPerEntry.test.ts` runs each against a counting connection and
 * requires exactly one request; `batchHandlers.test.ts` requires every entry
 * to be admitted by at least one case, and every value an entry's `equals`
 * names to be sampled.
 *
 * A case may carry `body`: the answer to its one request when the handler
 * needs a document of that shape to finish (a document of another shape would
 * end the call before it shows what it sends next).
 */

import { corpusBody } from '../../lib/adtCorpus';

export interface BatchEntryCase {
  tool: string;
  args: Record<string, unknown>;
  /** The connection the case runs over; `http` when not given. */
  connection?: 'http' | 'rfc';
  /** The answer's body, when the handler needs one of its own shape. */
  body?: string;
  /** The answer's headers, when the handler reads one (a run's `location`). */
  headers?: Record<string, string>;
}

const LOCK_HANDLE = 'LOCK_HANDLE_PLACEHOLDER';
const TRANSPORT = 'XXXK900001';
const VERSION_URI = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';

const INACTIVE_OBJECTS =
  '<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects"/>';
const OBJECT_STRUCTURE =
  '<?xml version="1.0" encoding="utf-8"?><projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer"/>';
/** A node level with objects and child nodes: a reader that walked them would send more. */
const NODE_LEVEL = corpusBody(
  'read-package-contents-structure--01-nodestructure',
);
const ACTIVATED = corpusBody('activation-success-verdict--01-activation');
const CHECKED = corpusBody('check-success-verdict--01-checkrun');
const NAME_FREE = corpusBody(
  'validation-name-free-class--01-validation-objectname',
);
const TRANSPORT_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="XXXK900001"/>';

/** The full set's single-request reads. */
const FULL: BatchEntryCase[] = [
  { tool: 'GetPackage', args: { package_name: 'PKG_A' } },
  { tool: 'GetDomain', args: { domain_name: 'DOM_A' } },
  { tool: 'GetDataElement', args: { data_element_name: 'DTEL_A' } },
  { tool: 'GetTable', args: { table_name: 'TAB_A' } },
  { tool: 'GetStructure', args: { structure_name: 'STRU_A' } },
  { tool: 'GetDdl', args: { ddl_name: 'DDL_A' } },
  { tool: 'GetServiceDefinition', args: { service_definition_name: 'SRVD_A' } },
  { tool: 'GetServiceBinding', args: { service_binding_name: 'SRVB_A' } },
  { tool: 'ListServiceBindingTypes', args: {} },
  { tool: 'GetClass', args: { class_name: 'CLAS_A' } },
  { tool: 'GetLocalTestClass', args: { class_name: 'CLAS_A' } },
  { tool: 'GetLocalTypes', args: { class_name: 'CLAS_A' } },
  { tool: 'GetLocalDefinitions', args: { class_name: 'CLAS_A' } },
  { tool: 'GetLocalMacros', args: { class_name: 'CLAS_A' } },
  { tool: 'GetProgram', args: { program_name: 'PROG_A' } },
  { tool: 'GetInterface', args: { interface_name: 'INTF_A' } },
  { tool: 'GetFunctionGroup', args: { function_group_name: 'FUGR_A' } },
  {
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
  },
  {
    tool: 'GetBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
  },
  {
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
  },
  { tool: 'GetMessageClass', args: { message_class_name: 'MSAG_A' } },
  {
    tool: 'GetMessageClassMessage',
    args: { message_class_name: 'MSAG_A', msgno: '001' },
  },
  { tool: 'ReadPackage', args: { package_name: 'PKG_A' } },
  { tool: 'ReadDomain', args: { domain_name: 'DOM_A' } },
  { tool: 'ReadDataElement', args: { data_element_name: 'DTEL_A' } },
  { tool: 'ReadFunctionGroup', args: { function_group_name: 'FUGR_A' } },
  { tool: 'ReadMessageClass', args: { message_class_name: 'MSAG_A' } },
  {
    tool: 'ReadMessageClassMessage',
    args: { message_class_name: 'MSAG_A', msgno: '001' },
  },
  { tool: 'GetInclude', args: { include_name: 'INCL_A' } },
  {
    tool: 'GetTransport',
    args: { transport_number: TRANSPORT },
    body: TRANSPORT_DOCUMENT,
  },
  { tool: 'ReadTransportObjects', args: { transport_number: TRANSPORT } },
  { tool: 'ReadTransportActionLog', args: { transport_number: TRANSPORT } },
  ...[
    'class',
    'program',
    'interface',
    'table',
    'structure',
    'ddl',
    'behavior_definition',
    'metadata_extension',
  ].map((object_type) => ({
    tool: 'GetObjectVersions',
    args: { object_type, object_name: 'OBJ_A' },
  })),
  {
    tool: 'GetObjectVersions',
    args: {
      object_type: 'function_module',
      object_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
  },
  {
    tool: 'GetObjectVersionSource',
    args: { object_type: 'class', content_uri: VERSION_URI },
  },
  { tool: 'GetClassVersions', args: { class_name: 'CLAS_A' } },
  { tool: 'GetProgramVersions', args: { program_name: 'PROG_A' } },
  { tool: 'GetInterfaceVersions', args: { interface_name: 'INTF_A' } },
  {
    tool: 'GetFunctionModuleVersions',
    args: { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
  },
  { tool: 'GetTableVersions', args: { table_name: 'TAB_A' } },
  { tool: 'GetStructureVersions', args: { structure_name: 'STRU_A' } },
  { tool: 'GetDdlVersions', args: { ddl_name: 'DDL_A' } },
  {
    tool: 'GetBehaviorDefinitionVersions',
    args: { behavior_definition_name: 'BDEF_A' },
  },
  {
    tool: 'GetMetadataExtensionVersions',
    args: { metadata_extension_name: 'DDLX_A' },
  },
  ...[
    'GetClassVersionSource',
    'GetProgramVersionSource',
    'GetInterfaceVersionSource',
    'GetFunctionModuleVersionSource',
    'GetTableVersionSource',
    'GetStructureVersionSource',
    'GetDdlVersionSource',
    'GetBehaviorDefinitionVersionSource',
    'GetMetadataExtensionVersionSource',
  ].map((tool) => ({ tool, args: { content_uri: VERSION_URI } })),
  { tool: 'SearchObject', args: { object_name: 'Z*' } },
  { tool: 'SearchObject', args: { object_name: 'Z*', object_type: 'CLAS' } },
  {
    tool: 'GetObjectsByType',
    args: {
      parent_name: 'PKG_A',
      parent_tech_name: 'PKG_A',
      parent_type: 'DEVC/K',
      node_id: '000000',
    },
    body: NODE_LEVEL,
  },
  {
    tool: 'GetObjectStructure',
    args: { objecttype: 'CLAS/OC', objectname: 'CLAS_A' },
    body: OBJECT_STRUCTURE,
  },
  { tool: 'GetInactiveObjects', args: {}, body: INACTIVE_OBJECTS },
  { tool: 'GetAdtTypes', args: {} },
  { tool: 'GetSqlQuery', args: { sql_query: 'SELECT * FROM TAB_A' } },
  { tool: 'GetTableContents', args: { table_name: 'TAB_A' } },
  { tool: 'GetATCRunStatus', args: { run_id: 'RUN_A' } },
  { tool: 'GetATCFindings', args: { worklist_id: 'WORKLIST_A' } },
  { tool: 'RuntimeListProfilerTraceFiles', args: {} },
  ...['hitlist', 'statements', 'db_accesses'].map((view) => ({
    tool: 'RuntimeGetProfilerTraceData',
    args: { trace_id_or_uri: 'TRACE_A', view },
  })),
  ...['hitlist', 'statements'].map((view) => ({
    tool: 'RuntimeAnalyzeProfilerTrace',
    args: { trace_id_or_uri: 'TRACE_A', view },
  })),
  { tool: 'RuntimeGetDumpById', args: { dump_id: 'DUMP_A' } },
  { tool: 'RuntimeListSystemMessages', args: {} },
  { tool: 'RuntimeGetGatewayErrorLog', args: {} },
  {
    tool: 'RuntimeGetGatewayErrorLog',
    args: { error_url: '/sap/bc/adt/gw/errorlog/ERROR_A' },
  },
];

/** `HandlerGet` with part `source` (given or absent), per type. */
const SOURCE_READS: Array<[string, Record<string, unknown>]> = [
  ['PACKAGE', { package_name: 'PKG_A' }],
  ['DOMAIN', { domain_name: 'DOM_A' }],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A' }],
  ['TRANSPORT', { transport_number: TRANSPORT }],
  ['TABLE', { table_name: 'TAB_A' }],
  ['STRUCTURE', { structure_name: 'STRU_A' }],
  ['DDL', { ddl_name: 'DDL_A' }],
  ['SERVICE_DEFINITION', { service_definition_name: 'SRVD_A' }],
  ['SERVICE_BINDING', { service_binding_name: 'SRVB_A' }],
  ['CLASS', { class_name: 'CLAS_A' }],
  ['LOCAL_TEST_CLASS', { class_name: 'CLAS_A' }],
  ['LOCAL_TYPES', { class_name: 'CLAS_A' }],
  ['LOCAL_DEFINITIONS', { class_name: 'CLAS_A' }],
  ['LOCAL_MACROS', { class_name: 'CLAS_A' }],
  ['PROGRAM', { program_name: 'PROG_A' }],
  ['INTERFACE', { interface_name: 'INTF_A' }],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A' }],
  ['BEHAVIOR_DEFINITION', { behavior_definition_name: 'BDEF_A' }],
  ['BEHAVIOR_IMPLEMENTATION', { behavior_implementation_name: 'BIMP_A' }],
  ['METADATA_EXTENSION', { metadata_extension_name: 'DDLX_A' }],
];

/**
 * `HandlerGet` with part `metadata`: a metadata GET, or a source GET and a
 * metadata GET sent together. Not FUNCTION_MODULE (its source read is built
 * from the metadata's function group).
 */
const METADATA_READS: Array<[string, Record<string, unknown>]> = [
  ['PACKAGE', { package_name: 'PKG_A' }],
  ['DOMAIN', { domain_name: 'DOM_A' }],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A' }],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A' }],
  ['TABLE', { table_name: 'TAB_A' }],
  ['STRUCTURE', { structure_name: 'STRU_A' }],
  ['DDL', { ddl_name: 'DDL_A' }],
  ['SERVICE_DEFINITION', { service_definition_name: 'SRVD_A' }],
  ['SERVICE_BINDING', { service_binding_name: 'SRVB_A' }],
  ['CLASS', { class_name: 'CLAS_A' }],
  ['PROGRAM', { program_name: 'PROG_A' }],
  ['INTERFACE', { interface_name: 'INTF_A' }],
  ['BEHAVIOR_DEFINITION', { behavior_definition_name: 'BDEF_A' }],
  ['BEHAVIOR_IMPLEMENTATION', { behavior_implementation_name: 'BIMP_A' }],
  ['METADATA_EXTENSION', { metadata_extension_name: 'DDLX_A' }],
];

/** The object types `HandlerLock` / `HandlerUnlock` take but `PACKAGE`. */
const LOCKED_TYPES: Array<[string, string]> = [
  ['CLASS', 'CLAS_A'],
  ['PROGRAM', 'PROG_A'],
  ['INTERFACE', 'INTF_A'],
  ['FUNCTION_GROUP', 'FUGR_A'],
  ['FUNCTION_MODULE', 'FUGR_A|FM_A'],
  ['TABLE', 'TAB_A'],
  ['STRUCTURE', 'STRU_A'],
  ['DDL', 'DDL_A'],
  ['DOMAIN', 'DOM_A'],
  ['DATA_ELEMENT', 'DTEL_A'],
  ['BEHAVIOR_DEFINITION', 'BDEF_A'],
  ['BEHAVIOR_IMPLEMENTATION', 'BIMP_A'],
  ['METADATA_EXTENSION', 'DDLX_A'],
];

/** `HandlerUpdate` under `lock_handle`: the source-written types, one PUT each. */
const SOURCE_WRITES: Array<[string, Record<string, unknown>]> = [
  ['TABLE', { table_name: 'TAB_A', ddl_code: 'source text' }],
  ['STRUCTURE', { structure_name: 'STRU_A', ddl_code: 'source text' }],
  ['DDL', { ddl_name: 'DDL_A', ddl_source: 'source text' }],
  ['CLASS', { class_name: 'CLAS_A', source_code: 'source text' }],
  ['PROGRAM', { program_name: 'PROG_A', source_code: 'source text' }],
  ['INTERFACE', { interface_name: 'INTF_A', source_code: 'source text' }],
  [
    'FUNCTION_MODULE',
    {
      function_module_name: 'FM_A',
      function_group_name: 'FUGR_A',
      source_code: 'source text',
    },
  ],
  ['BEHAVIOR_DEFINITION', { name: 'BDEF_A', source_code: 'source text' }],
  ['METADATA_EXTENSION', { name: 'DDLX_A', source_code: 'source text' }],
];

/** The compact set's single-request calls. */
const COMPACT: BatchEntryCase[] = [
  ...SOURCE_READS.map(([object_type, names]) => ({
    tool: 'HandlerGet',
    args: { object_type, ...names },
  })),
  ...SOURCE_READS.map(([object_type, names]) => ({
    tool: 'HandlerGet',
    args: { object_type, part: 'source', ...names },
  })),
  ...METADATA_READS.map(([object_type, names]) => ({
    tool: 'HandlerGet',
    args: { object_type, part: 'metadata', ...names },
  })),
  {
    tool: 'HandlerGet',
    args: {
      part: 'object_structure',
      object_adt_type: 'CLAS/OC',
      object_name: 'CLAS_A',
    },
    body: OBJECT_STRUCTURE,
  },
  {
    tool: 'HandlerGet',
    args: {
      part: 'node_structure',
      object_adt_type: 'CLAS/OC',
      object_name: 'CLAS_A',
    },
  },
  {
    tool: 'HandlerGet',
    args: {
      part: 'node_structure',
      object_adt_type: 'PROG/P',
      object_name: 'PROG_A',
    },
    body: NODE_LEVEL,
  },
  {
    tool: 'HandlerGet',
    args: { part: 'virtual_folders', object_search_pattern: 'Z*' },
  },
  { tool: 'HandlerSearch', args: { query: 'Z*' } },
  { tool: 'HandlerGetData', args: { sql_query: 'SELECT * FROM TAB_A' } },
  { tool: 'HandlerGetData', args: { object_name: 'TAB_A' } },
  { tool: 'HandlerProfileList', args: {} },
  ...['hitlist', 'statements', 'db_accesses'].map((view) => ({
    tool: 'HandlerProfileView',
    args: { trace_id_or_uri: 'TRACE_A', view },
  })),
  ...['hitlist', 'statements'].map((view) => ({
    tool: 'HandlerProfileView',
    args: { trace_id_or_uri: 'TRACE_A', view, mode: 'analyze' },
  })),
  ...['default', 'summary', 'formatted'].map((view) => ({
    tool: 'HandlerDumpView',
    args: { dump_id: 'DUMP_A', view },
  })),
  { tool: 'HandlerServiceBindingListTypes', args: {} },
  { tool: 'HandlerUnitTestStatus', args: { run_id: 'RUN_A' } },
  { tool: 'HandlerCdsUnitTestStatus', args: { run_id: 'RUN_A' } },
  ...LOCKED_TYPES.map(([object_type, object_name]) => ({
    tool: 'HandlerLock',
    args: { object_type, object_name },
  })),
  {
    tool: 'HandlerLock',
    args: {
      object_type: 'PACKAGE',
      object_name: 'PKG_A',
      super_package: 'PKG_SUPER',
    },
    connection: 'http',
  },
  ...LOCKED_TYPES.map(([object_type, object_name]) => ({
    tool: 'HandlerUnlock',
    args: { object_type, object_name, lock_handle: LOCK_HANDLE },
  })),
  {
    tool: 'HandlerUnlock',
    args: {
      object_type: 'PACKAGE',
      object_name: 'PKG_A',
      lock_handle: LOCK_HANDLE,
    },
    connection: 'http',
  },
  ...SOURCE_WRITES.map(([object_type, fields]) => ({
    tool: 'HandlerUpdate',
    args: {
      object_type,
      ...fields,
      lock_handle: LOCK_HANDLE,
      transport_request: TRANSPORT,
    },
  })),
];

/** `HandlerCreate` with `create_only`: the create request alone, per type but PACKAGE. */
const CREATES_ONLY: Array<[string, Record<string, unknown>]> = [
  ['DOMAIN', { domain_name: 'DOM_A', package_name: 'PKG_A' }],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A', package_name: 'PKG_A' }],
  ['TRANSPORT', { description: 'text' }],
  ['TABLE', { table_name: 'TAB_A', package_name: 'PKG_A' }],
  ['STRUCTURE', { structure_name: 'STRU_A', package_name: 'PKG_A' }],
  ['DDL', { ddl_name: 'DDL_A', package_name: 'PKG_A' }],
  [
    'SERVICE_DEFINITION',
    { service_definition_name: 'SRVD_A', package_name: 'PKG_A' },
  ],
  [
    'SERVICE_BINDING',
    {
      service_binding_name: 'SRVB_A',
      service_definition_name: 'SRVD_A',
      package_name: 'PKG_A',
    },
  ],
  ['CLASS', { class_name: 'CLAS_A', package_name: 'PKG_A' }],
  ['PROGRAM', { program_name: 'PROG_A', package_name: 'PKG_A' }],
  ['INTERFACE', { interface_name: 'INTF_A', package_name: 'PKG_A' }],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A', package_name: 'PKG_A' }],
  [
    'FUNCTION_MODULE',
    {
      function_module_name: 'FM_A',
      function_group_name: 'FUGR_A',
      package_name: 'PKG_A',
    },
  ],
  [
    'BEHAVIOR_DEFINITION',
    { name: 'BDEF_A', package_name: 'PKG_A', implementation_type: 'Managed' },
  ],
  ['BEHAVIOR_IMPLEMENTATION', { class_name: 'BP_A', package_name: 'PKG_A' }],
  ['METADATA_EXTENSION', { name: 'DDLX_A', package_name: 'PKG_A' }],
];

const CREATE_ONLY: BatchEntryCase[] = [
  ...CREATES_ONLY.map(([object_type, fields]) => ({
    tool: 'HandlerCreate',
    args: { object_type, ...fields, create_only: true },
    ...(object_type === 'TRANSPORT' ? { body: TRANSPORT_DOCUMENT } : {}),
  })),
  {
    tool: 'HandlerCreate',
    args: {
      object_type: 'PACKAGE',
      package_name: 'PKG_A',
      super_package: 'PKG_SUPER',
      create_only: true,
    },
    connection: 'http',
  },
];

/** The tools that change something or run code, one request each. */
const ACTIVATIONS: Array<[string, Record<string, unknown>]> = [
  ['ActivateDomain', { domain_name: 'DOM_A' }],
  ['ActivateDataElement', { data_element_name: 'DTEL_A' }],
  ['ActivateTable', { table_name: 'TAB_A' }],
  ['ActivateStructure', { structure_name: 'STRU_A' }],
  ['ActivateDdl', { ddl_name: 'DDL_A' }],
  ['ActivateClass', { class_name: 'CLAS_A' }],
  ['ActivateInterface', { interface_name: 'INTF_A' }],
  ['ActivateProgram', { program_name: 'PROG_A' }],
  ['ActivateFunctionGroup', { function_group_name: 'FUGR_A' }],
  [
    'ActivateFunctionModule',
    { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
  ],
  ['ActivateBehaviorDefinition', { name: 'BDEF_A' }],
  ['ActivateMetadataExtension', { name: 'DDLX_A' }],
  ['ActivateServiceDefinition', { name: 'SRVD_A' }],
  ['ActivateServiceBinding', { name: 'SRVB_A' }],
];

const CHECKS: Array<[string, Record<string, unknown>]> = [
  ['CheckClass', { class_name: 'CLAS_A' }],
  ['CheckClass', { class_name: 'CLAS_A', source_code: 'source text' }],
  ['CheckInterface', { interface_name: 'INTF_A' }],
  ['CheckProgram', { program_name: 'PROG_A' }],
  ['CheckFunctionGroup', { function_group_name: 'FUGR_A' }],
  [
    'CheckFunctionModule',
    { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
  ],
  ['CheckTable', { table_name: 'TAB_A' }],
  ['CheckStructure', { structure_name: 'STRU_A' }],
  ['CheckDdl', { ddl_name: 'DDL_A' }],
  ['CheckDomain', { domain_name: 'DOM_A' }],
  ['CheckDataElement', { data_element_name: 'DTEL_A' }],
  ['CheckPackage', { package_name: 'PKG_A' }],
  ['CheckBehaviorDefinition', { name: 'BDEF_A' }],
  ['CheckMetadataExtension', { name: 'DDLX_A' }],
];

const COMPACT_TYPES = [
  'CLASS',
  'PROGRAM',
  'INTERFACE',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'TABLE',
  'STRUCTURE',
  'DDL',
  'DOMAIN',
  'DATA_ELEMENT',
  'PACKAGE',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
];

const nameOf = (type: string) =>
  type === 'FUNCTION_MODULE' ? 'FUGR_A|FM_A' : 'OBJ_A';

const MOVED = [
  { object_name: 'CLAS_A', object_type: 'CLAS', position: '000001' },
  { object_name: 'CLAS_B', object_type: 'CLAS', position: '000002' },
];

const WRITES: BatchEntryCase[] = [
  ...ACTIVATIONS.map(([tool, args]) => ({ tool, args, body: ACTIVATED })),
  ...[
    'DOMAIN',
    'DATA_ELEMENT',
    'TABLE',
    'STRUCTURE',
    'DDL',
    'CLASS',
    'PROGRAM',
    'INTERFACE',
    'FUNCTION_GROUP',
    'BEHAVIOR_DEFINITION',
    'METADATA_EXTENSION',
  ].map((object_type) => ({
    tool: 'HandlerActivate',
    args: { object_type, object_name: 'OBJ_A' },
    body: ACTIVATED,
  })),
  ...CHECKS.map(([tool, args]) => ({ tool, args, body: CHECKED })),
  ...COMPACT_TYPES.map((object_type) => ({
    tool: 'HandlerCheckRun',
    args: { object_type, object_name: nameOf(object_type) },
    body: CHECKED,
  })),
  {
    tool: 'HandlerCheckRun',
    args: {
      object_type: 'CLASS',
      object_name: 'CLAS_A',
      version: 'inactive',
      source_code: 'source text',
    },
    body: CHECKED,
  },
  ...[...COMPACT_TYPES, 'BEHAVIOR_IMPLEMENTATION', 'SERVICE_BINDING'].map(
    (object_type) => ({
      tool: 'HandlerValidate',
      args: {
        object_type,
        object_name: nameOf(object_type),
        package_name: 'PKG_A',
        description: 'text',
        super_package: 'PKG_SUPER',
        behavior_definition: 'BDEF_A',
        root_entity: 'ROOT_A',
        implementation_type: 'Managed',
        service_definition_name: 'SRVD_A',
      },
      body: NAME_FREE,
    }),
  ),
  ...['ValidateServiceBinding', 'HandlerServiceBindingValidate'].map(
    (tool) => ({
      tool,
      args: {
        service_binding_name: 'SRVB_A',
        service_definition_name: 'SRVD_A',
        package_name: 'PKG_A',
        description: 'text',
      },
      body: NAME_FREE,
    }),
  ),
  {
    tool: 'CreateClass',
    args: {
      class_name: 'CLAS_A',
      package_name: 'PKG_A',
      description: 'text',
      superclass: 'CLAS_S',
      final: true,
    },
  },
  {
    tool: 'CreateTable',
    args: { table_name: 'TAB_A', package_name: 'PKG_A', description: 'text' },
  },
  {
    tool: 'CreateMessageClass',
    args: {
      message_class_name: 'MSAG_A',
      package_name: 'PKG_A',
      description: 'text',
    },
  },
  {
    tool: 'CreateFunctionModule',
    args: {
      function_group_name: 'FUGR_A',
      function_module_name: 'FM_A',
      description: 'text',
    },
  },
  {
    tool: 'CreateFunctionInclude',
    args: {
      function_group_name: 'FUGR_A',
      include_name: 'INCL_A',
      description: 'text',
    },
  },
  {
    tool: 'CreateBehaviorImplementation',
    args: {
      class_name: 'BIMP_A',
      behavior_definition: 'BDEF_A',
      package_name: 'PKG_A',
      description: 'text',
    },
  },
  {
    tool: 'CreateProgram',
    args: {
      program_name: 'PROG_A',
      package_name: 'PKG_A',
      description: 'text',
      program_type: 'executable',
    },
  },
  {
    tool: 'CreateInterface',
    args: {
      interface_name: 'INTF_A',
      package_name: 'PKG_A',
      description: 'text',
    },
  },
  {
    tool: 'CreateDdl',
    args: { ddl_name: 'DDL_A', package_name: 'PKG_A', description: 'text' },
  },
  {
    tool: 'CreatePackage',
    args: {
      package_name: 'PKG_A',
      super_package: 'PKG_SUPER',
      description: 'text',
    },
    connection: 'http',
  },
  {
    tool: 'CreateServiceDefinition',
    args: {
      service_definition_name: 'SRVD_A',
      package_name: 'PKG_A',
      description: 'text',
      activate: false,
    },
  },
  {
    tool: 'CreateServiceBinding',
    args: {
      service_binding_name: 'SRVB_A',
      service_definition_name: 'SRVD_A',
      package_name: 'PKG_A',
      description: 'text',
      activate: false,
    },
  },
  {
    tool: 'CreateFunctionGroup',
    args: {
      function_group_name: 'FUGR_A',
      package_name: 'PKG_A',
      description: 'text',
      activate: false,
    },
  },
  ...['CreateTransport', 'HandlerTransportCreate'].map((tool) => ({
    tool,
    args: { description: 'text' },
    body: TRANSPORT_DOCUMENT,
  })),
  {
    tool: 'CreateTransportTask',
    args: { transport_number: TRANSPORT, target_user: 'USER_A' },
  },
  {
    tool: 'RemoveTransportObject',
    args: {
      transport_number: TRANSPORT,
      object_name: 'CLAS_A',
      object_type: 'CLAS',
      position: '000001',
    },
  },
  {
    tool: 'AddTransportObject',
    args: {
      transport_number: TRANSPORT,
      object_name: 'CLAS_A',
      object_type: 'CLAS',
    },
  },
  ...['SortAndCompressTransportTask', 'HandlerTransportSortAndCompress'].map(
    (tool) => ({ tool, args: { transport_number: TRANSPORT } }),
  ),
  ...['MoveTransportObjects', 'HandlerTransportMoveObjects'].map((tool) => ({
    tool,
    args: {
      transport_number: TRANSPORT,
      target_number: 'XXXK900002',
      objects: MOVED,
    },
  })),
  {
    tool: 'RuntimeCreateProfilerTraceParameters',
    args: { description: 'text' },
  },
  { tool: 'RuntimeRunClass', args: { class_name: 'CLAS_A' } },
  {
    tool: 'RuntimeRunClass',
    args: { class_name: 'CLAS_A', profile: false, background: true },
  },
  { tool: 'RuntimeRunProgram', args: { program_name: 'PROG_A' } },
  {
    tool: 'RuntimeRunProgram',
    args: { program_name: 'PROG_A', profile: false },
  },
  {
    tool: 'HandlerProfileRun',
    args: { target_type: 'CLASS', class_name: 'CLAS_A', profiling: false },
  },
  {
    tool: 'HandlerProfileRun',
    args: { target_type: 'PROGRAM', program_name: 'PROG_A', profiling: false },
  },
  {
    tool: 'HandlerUnitTestRun',
    args: {
      tests: [
        { container_class: 'CLAS_A', test_class: 'LTCL_A' },
        { container_class: 'CLAS_B', test_class: 'LTCL_B' },
      ],
    },
  },
  { tool: 'RuntimeListFeeds', args: {} },
  ...['descriptors', 'variants'].map((feed_type) => ({
    tool: 'RuntimeListFeeds',
    args: { feed_type },
  })),
  {
    tool: 'GetWhereUsed',
    args: { object_name: 'CLAS_A', object_type: 'class' },
  },
  {
    tool: 'GetWhereUsed',
    args: {
      object_name: 'CLAS_A',
      object_type: 'class',
      enable_all_types: false,
    },
  },
  {
    tool: 'HandlerWhereUsed',
    args: { object_type: 'CLASS', object_name: 'CLAS_A' },
  },
  {
    tool: 'HandlerWhereUsed',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'FM_A',
      function_group_name: 'FUGR_A',
    },
  },
];

/** Two requests sent together, neither needing the other's answer. */
const VERSION_FROM =
  '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';
const VERSION_TO = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00002';
const TOGETHER: BatchEntryCase[] = [
  { tool: 'ReadClass', args: { class_name: 'CLAS_A' } },
  { tool: 'ReadInterface', args: { interface_name: 'INTF_A' } },
  { tool: 'ReadProgram', args: { program_name: 'PROG_A' } },
  { tool: 'ReadTable', args: { table_name: 'TAB_A' } },
  { tool: 'ReadStructure', args: { structure_name: 'STRU_A' } },
  { tool: 'ReadDdl', args: { ddl_name: 'DDL_A' } },
  {
    tool: 'ReadServiceDefinition',
    args: { service_definition_name: 'SRVD_A' },
  },
  { tool: 'ReadServiceBinding', args: { service_binding_name: 'SRVB_A' } },
  {
    tool: 'ReadMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
  },
  {
    tool: 'ReadBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
  },
  {
    tool: 'ReadBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
  },
  {
    tool: 'ReadFunctionInclude',
    args: { function_group_name: 'FUGR_A', include_name: 'INCL_A' },
  },
  {
    tool: 'GetObjectVersionDiff',
    args: {
      object_type: 'class',
      content_uri_from: VERSION_FROM,
      content_uri_to: VERSION_TO,
    },
  },
  ...[
    'Class',
    'Program',
    'Interface',
    'FunctionModule',
    'Table',
    'Structure',
    'Ddl',
    'BehaviorDefinition',
    'MetadataExtension',
  ].map((t) => ({
    tool: `Get${t}VersionDiff`,
    args: { content_uri_from: VERSION_FROM, content_uri_to: VERSION_TO },
  })),
  ...[
    'CLASS',
    'CLAS',
    'CLAS/OC',
    'FUNCTION_GROUP',
    'FUNCTIONGROUP',
    'FUGR',
    'FUGR/F',
    'PROGRAM',
    'PROG',
    'PROG/P',
  ].map((object_type) => ({
    tool: 'GetEnhancements',
    args: { object_name: 'OBJ_A', object_type },
  })),
];

export const BATCH_ENTRY_CASES: readonly BatchEntryCase[] = [
  ...FULL,
  ...COMPACT,
  ...CREATE_ONLY,
  ...WRITES,
  ...TOGETHER,
];
