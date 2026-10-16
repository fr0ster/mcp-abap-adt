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

/** `HandlerGet` with part `metadata`: the types whose metadata read is one GET. */
const METADATA_READS: Array<[string, Record<string, unknown>]> = [
  ['PACKAGE', { package_name: 'PKG_A' }],
  ['DOMAIN', { domain_name: 'DOM_A' }],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A' }],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A' }],
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

export const BATCH_ENTRY_CASES: readonly BatchEntryCase[] = [
  ...FULL,
  ...COMPACT,
];
