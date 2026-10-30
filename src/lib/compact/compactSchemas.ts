import {
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_DELETION_CHECK,
  COMPACT_LOCK,
  COMPACT_PROFILE,
  COMPACT_READ,
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  COMPACT_WHERE_USED,
  supported,
} from '../adtProjections';
import { COMPACT_BACKGROUND_PROPERTY } from '../backgroundRuns/tools';
import { TIMEOUT_PROPERTY } from '../longTools';

const versionSchema = {
  type: 'string',
  enum: ['active', 'inactive'],
  default: 'active',
  description: 'Object version to read/check.',
} as const;

/**
 * A compact tool's `object_type`: the members it routes on its variant (a
 * projection of `adtProjections.ts`).
 */
const objectTypeOf = <const M extends readonly string[]>(
  members: M,
  description = 'ABAP object type for routed compact operation.',
) =>
  ({
    type: 'string',
    enum: members,
    description,
  }) as const;

/**
 * `HandlerCreate`: one request, the type's create alone (spec §4.6). Only what
 * some type's create sends is named; anything else a caller gives is refused
 * by `handleCreateOnly`, naming it.
 */
export function compactCreateSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      object_type: objectTypeOf(members),
      class_name: {
        type: 'string',
        description: 'ABAP class name (CLASS, BEHAVIOR_IMPLEMENTATION).',
      },
      program_name: { type: 'string', description: 'ABAP program name.' },
      domain_name: { type: 'string', description: 'ABAP domain name.' },
      function_module_name: {
        type: 'string',
        description: 'ABAP function module name.',
      },
      function_group_name: {
        type: 'string',
        description:
          'ABAP function group name (FUNCTION_GROUP; the group of a FUNCTION_MODULE).',
      },
      package_name: { type: 'string', description: 'ABAP package name.' },
      ddl_name: {
        type: 'string',
        description: 'DDL source name (CDS view, AMDP table function, etc.).',
      },
      description: {
        type: 'string',
        description: 'Human-readable object description.',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request id (if required by system).',
      },
      master_language: {
        type: 'string',
        description:
          'Original language of the created object; the session language when absent.',
      },
      super_package: {
        type: 'string',
        description: 'Super package (PACKAGE create).',
      },
      package_type: {
        type: 'string',
        description: 'Package type (PACKAGE create).',
      },
      software_component: {
        type: 'string',
        description: 'Software component (PACKAGE create).',
      },
      transport_layer: {
        type: 'string',
        description: 'Transport layer (PACKAGE create).',
      },
      record_changes: {
        type: 'boolean',
        description: 'Record changes (PACKAGE create).',
      },
      application_component: {
        type: 'string',
        description: 'Application component (PACKAGE create).',
      },
      transport_type: {
        type: 'string',
        enum: ['workbench', 'customizing'],
        description: 'Transport request type (TRANSPORT create).',
      },
      target_system: {
        type: 'string',
        description:
          'Target system of the transport request (TRANSPORT create).',
      },
      owner: {
        type: 'string',
        description: 'Owner of the transport request (TRANSPORT create).',
      },
      superclass: {
        type: 'string',
        description: 'Superclass name (CLASS create).',
      },
      final: {
        type: 'boolean',
        description: 'Mark the class final (CLASS create).',
      },
      create_protected: {
        type: 'boolean',
        description: 'Protected constructor (CLASS create).',
      },
      program_type: {
        type: 'string',
        description: 'ABAP program type (PROGRAM create).',
      },
      application: {
        type: 'string',
        description: 'Application area (PROGRAM create).',
      },
      table_name: { type: 'string', description: 'Table name.' },
      structure_name: { type: 'string', description: 'Structure name.' },
      data_element_name: { type: 'string', description: 'Data element name.' },
      interface_name: { type: 'string', description: 'Interface name.' },
      service_definition_name: {
        type: 'string',
        description:
          'Service definition name (SERVICE_DEFINITION; the definition a SERVICE_BINDING binds).',
      },
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      service_name: {
        type: 'string',
        description:
          'Service name of the binding (SERVICE_BINDING create); the binding name when absent.',
      },
      service_version: {
        type: 'string',
        description:
          'Service version of the binding (SERVICE_BINDING create); 0001 when absent.',
      },
      binding_variant: {
        type: 'string',
        enum: [
          'ODATA_V2_UI',
          'ODATA_V2_WEB_API',
          'ODATA_V4_UI',
          'ODATA_V4_WEB_API',
        ],
        description:
          'Binding variant (SERVICE_BINDING create); ODATA_V4_UI when absent.',
      },
      name: {
        type: 'string',
        description:
          'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
      },
      implementation_type: {
        type: 'string',
        enum: ['Managed', 'Unmanaged', 'Abstract', 'Projection'],
        description: 'Behavior definition implementation type.',
      },
    },
    required: ['object_type'],
  } as const;
}

export const compactCreateSchema = compactCreateSchemaFor(
  COMPACT_CREATE.onprem,
);

/**
 * Which aspect of an object a read answers.
 *
 * The compact surface is one tool per OPERATION, so "source or metadata or the URLs"
 * is an argument of the read, not three tools. A part the object does not have is
 * refused by name — silently answering the source instead would be a success that
 * means something other than what was asked.
 */
const readPartSchema = {
  type: 'string',
  enum: [
    'source',
    'metadata',
    'urls',
    'contents',
    'object_structure',
    'node_structure',
    'virtual_folders',
    'activation_status',
    'activation_results',
  ],
  default: 'source',
  description:
    'The part to read: source (the source alone), metadata (the ADT metadata document alone), urls (the service and preview URLs), contents (the objects a package holds); each object type answers the parts it has, and a part outside them is answered with the list of its parts. Three parts read the repository by ADT address: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by run_id*: activation_status (its status) and activation_results (the messages it produced).',
} as const;

export function compactGetSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      timeout: {
        ...TIMEOUT_PROPERTY,
        description: `${TIMEOUT_PROPERTY.description} Applies to the repository reads: object_type PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TRANSPORT, and the parts object_structure, node_structure, virtual_folders.`,
      },
      object_type: objectTypeOf(members),
      part: readPartSchema,
      package_name: { type: 'string', description: 'Package name.' },
      package_names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Several package names (part contents), read together: one entry per package, in the order given, each { package_name, contents } or { package_name, error }.',
      },
      max_results: {
        type: 'number',
        default: 100,
        description:
          'Maximum number of members listed per package (part contents).',
      },
      include_descriptions: {
        type: 'boolean',
        default: false,
        description:
          "Include each member's description (part contents). The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes.",
      },
      class_name: { type: 'string', description: 'Class name.' },
      interface_name: { type: 'string', description: 'Interface name.' },
      program_name: { type: 'string', description: 'Program name.' },
      domain_name: { type: 'string', description: 'Domain name.' },
      data_element_name: { type: 'string', description: 'Data element name.' },
      table_name: { type: 'string', description: 'Table name.' },
      structure_name: { type: 'string', description: 'Structure name.' },
      ddl_name: { type: 'string', description: 'DDL source name.' },
      function_module_name: {
        type: 'string',
        description:
          'Function module name: GROUP|MODULE, its function group first, or the module alone with function_group_name.',
      },
      function_group_name: {
        type: 'string',
        description:
          "Function group name (FUNCTION_GROUP; FUNCTION_MODULE given as the module's name).",
      },
      behavior_definition_name: {
        type: 'string',
        description: 'Behavior definition name.',
      },
      behavior_implementation_name: {
        type: 'string',
        description: 'Behavior implementation name.',
      },
      metadata_extension_name: {
        type: 'string',
        description: 'Metadata extension name.',
      },
      service_definition_name: {
        type: 'string',
        description: 'Service definition name.',
      },
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      transport_number: {
        type: 'string',
        description:
          'Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own.',
      },
      run_id: {
        type: 'string',
        description:
          'Run id: a unit test run (UNIT_TEST, CDS_UNIT_TEST) or an activation run (parts activation_status, activation_results).',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        description: 'Response format for SERVICE_BINDING reads.',
      },
      version: versionSchema,
      object_adt_type: {
        type: 'string',
        description:
          'ADT type code of the object (object_structure) or of the parent node (node_structure).',
      },
      object_name: {
        type: 'string',
        description:
          'Object name (object_structure) or parent name (node_structure).',
      },
      node_id: {
        type: 'string',
        description:
          'Node id to expand (node_structure); the root when absent.',
      },
      with_short_descriptions: {
        type: 'boolean',
        description: 'Include short descriptions (node_structure).',
      },
      object_search_pattern: {
        type: 'string',
        description: 'Object name pattern (virtual_folders).',
      },
      preselection: {
        type: 'array',
        description: 'Facet preselections (virtual_folders).',
        items: {
          type: 'object',
          properties: {
            facet: { type: 'string', description: 'Facet name.' },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Facet values.',
            },
          },
          required: ['facet', 'values'],
        },
      },
      facet_order: {
        type: 'array',
        items: { type: 'string' },
        description: 'Facet order (virtual_folders).',
      },
      with_versions: {
        type: 'boolean',
        description: 'Include versions (virtual_folders).',
      },
      ignore_short_descriptions: {
        type: 'boolean',
        description: 'Leave out short descriptions (virtual_folders).',
      },
    },
    required: [],
  } as const;
}

export const compactGetSchema = compactGetSchemaFor(COMPACT_READ.onprem);

export function compactUpdateSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      object_type: objectTypeOf(members),
      lock_handle: {
        type: 'string',
        description:
          'The lock handle of the object (for a class include, of the class): the write is sent under it.',
      },
      transport_request: {
        type: 'string',
        description:
          "Transport request id, sent as the write's corrNr (the types whose description names it).",
      },
      class_name: { type: 'string', description: 'ABAP class name.' },
      program_name: { type: 'string', description: 'ABAP program name.' },
      domain_name: { type: 'string', description: 'ABAP domain name.' },
      function_module_name: {
        type: 'string',
        description: 'ABAP function module name.',
      },
      function_group_name: {
        type: 'string',
        description: 'ABAP function group name.',
      },
      package_name: { type: 'string', description: 'ABAP package name.' },
      ddl_name: {
        type: 'string',
        description: 'DDL source name (CDS view, AMDP table function, etc.).',
      },
      source_code: {
        type: 'string',
        description:
          'The content written: the source, or for PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP the whole metadata document.',
      },
      ddl_source: {
        type: 'string',
        description: 'Complete DDL source code (for DDL update).',
      },
      table_name: { type: 'string', description: 'Table name.' },
      structure_name: { type: 'string', description: 'Structure name.' },
      data_element_name: { type: 'string', description: 'Data element name.' },
      interface_name: { type: 'string', description: 'Interface name.' },
      service_definition_name: {
        type: 'string',
        description: 'Service definition name.',
      },
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      service_name: {
        type: 'string',
        description:
          'Published service name (SERVICE_BINDING, an OData V2 binding).',
      },
      service_version: {
        type: 'string',
        description:
          'Published service version (SERVICE_BINDING, an OData V2 binding). Default 0001.',
      },
      name: {
        type: 'string',
        description:
          'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
      },
      ddl_code: {
        type: 'string',
        description: 'Complete DDL source code (for TABLE/STRUCTURE update).',
      },
      implementation_code: {
        type: 'string',
        description: 'Behavior implementation methods source code.',
      },
      test_class_source: {
        type: 'string',
        description:
          'ABAP source of the local test classes (UNIT_TEST and CDS_UNIT_TEST update).',
      },
      test_class_code: {
        type: 'string',
        description: 'Updated source for the local test class.',
      },
      local_types_code: {
        type: 'string',
        description: 'Updated source for class local types.',
      },
      definitions_code: {
        type: 'string',
        description: 'Updated source for class local definitions.',
      },
      macros_code: {
        type: 'string',
        description: 'Updated source for class local macros.',
      },
      binding_variant: {
        type: 'string',
        enum: [
          'ODATA_V2_UI',
          'ODATA_V2_WEB_API',
          'ODATA_V4_UI',
          'ODATA_V4_WEB_API',
        ],
        description: 'Service binding variant (service binding update).',
      },
      desired_publication_state: {
        type: 'string',
        enum: ['published', 'unpublished'],
        description: 'Target publication state (service binding update).',
      },
    },
    required: ['object_type', 'lock_handle'],
  } as const;
}

export const compactUpdateSchema = compactUpdateSchemaFor(
  COMPACT_UPDATE.onprem,
);

/** The types a deletion request removes, each with its deletion check. */
export const DELETION_CHECK_TYPES = COMPACT_DELETION_CHECK.onprem;

/**
 * The class includes compact's delete writes empty under the class lock (a
 * `DELETE` on an include answers `405`).
 */
export const EMPTIED_INCLUDE_TYPES = [
  'LOCAL_TEST_CLASS',
  'LOCAL_TYPES',
  'LOCAL_DEFINITIONS',
  'LOCAL_MACROS',
  'UNIT_TEST',
] as const;

/** The types `HandlerDelete` removes: by the deletion request, or by an empty include write. */
export const DELETABLE_TYPES = [
  ...DELETION_CHECK_TYPES,
  ...EMPTIED_INCLUDE_TYPES,
] as const;

/**
 * `HandlerDelete`: one request (spec §4.6) — the deletion request, or for a
 * class include and the unit tests the include written empty under
 * `lock_handle`. Only what that request sends is named.
 */
export function compactDeleteSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        enum: members,
        description: `Object type. ${supported(members)}`,
      },
      lock_handle: {
        type: 'string',
        description:
          'The lock handle of the class (LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST): the include is written empty under it.',
      },
      package_name: { type: 'string', description: 'ABAP package name.' },
      class_name: { type: 'string', description: 'ABAP class name.' },
      program_name: { type: 'string', description: 'ABAP program name.' },
      domain_name: { type: 'string', description: 'ABAP domain name.' },
      function_module_name: {
        type: 'string',
        description: 'ABAP function module name.',
      },
      function_group_name: {
        type: 'string',
        description: 'ABAP function group name.',
      },
      ddl_name: {
        type: 'string',
        description: 'DDL source name (CDS view, AMDP table function, etc.).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request id, sent with the deletion (or the include write).',
      },
      table_name: { type: 'string', description: 'Table name.' },
      structure_name: { type: 'string', description: 'Structure name.' },
      data_element_name: { type: 'string', description: 'Data element name.' },
      interface_name: { type: 'string', description: 'Interface name.' },
      service_definition_name: {
        type: 'string',
        description: 'Service definition name.',
      },
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      behavior_definition_name: {
        type: 'string',
        description: 'Behavior definition name.',
      },
      behavior_implementation_name: {
        type: 'string',
        description: 'Behavior implementation name.',
      },
      metadata_extension_name: {
        type: 'string',
        description: 'Metadata extension name.',
      },
    },
    required: ['object_type'],
  } as const;
}

export const compactDeleteSchema = compactDeleteSchemaFor(
  COMPACT_DELETE.onprem,
);

export const compactUnitTestRunSchema = {
  type: 'object',
  properties: {
    tests: {
      type: 'array',
      description: 'List of test classes to run.',
      items: {
        type: 'object',
        properties: {
          container_class: {
            type: 'string',
            description: 'Productive class containing tests.',
          },
          test_class: { type: 'string', description: 'Local/unit test class.' },
        },
        required: ['container_class', 'test_class'],
      },
    },
    runner: {
      type: 'string',
      enum: ['async', 'sync'],
      default: 'async',
      description:
        'async (default): starts the run and returns its run_id, whose status and result are read by run_id; suited to long suites. sync: one request that runs every test class of each container_class and returns the finished result.',
    },
    title: {
      type: 'string',
      description:
        'Run title shown in ABAP Unit test logs; sent by the async runner.',
    },
    context: {
      type: 'string',
      description: 'Run context label; sent by the async runner.',
    },
    scope: {
      type: 'object',
      description: 'ABAP Unit test scope flags.',
      properties: {
        own_tests: { type: 'boolean', description: 'Include own tests.' },
        foreign_tests: {
          type: 'boolean',
          description: 'Include foreign tests.',
        },
        add_foreign_tests_as_preview: {
          type: 'boolean',
          description: 'Preview foreign tests without full inclusion.',
        },
      },
    },
    risk_level: {
      type: 'object',
      description: 'Allowed risk levels.',
      properties: {
        harmless: { type: 'boolean', description: 'Allow harmless tests.' },
        dangerous: { type: 'boolean', description: 'Allow dangerous tests.' },
        critical: { type: 'boolean', description: 'Allow critical tests.' },
      },
    },
    duration: {
      type: 'object',
      description: 'Allowed duration classes.',
      properties: {
        short: { type: 'boolean', description: 'Allow short tests.' },
        medium: { type: 'boolean', description: 'Allow medium tests.' },
        long: { type: 'boolean', description: 'Allow long tests.' },
      },
    },
  },
  required: ['tests'],
} as const;

export const compactUnitTestStatusSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'string', description: 'Unit test run id.' },
    with_long_polling: {
      type: 'boolean',
      default: true,
      description: 'Use long polling while waiting for completion.',
    },
  },
  required: ['run_id'],
} as const;

export const compactUnitTestResultSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'string', description: 'Unit test run id.' },
    with_navigation_uris: {
      type: 'boolean',
      default: false,
      description: 'Include ADT navigation URIs in the result payload.',
    },
    format: {
      type: 'string',
      enum: ['abapunit', 'junit'],
      description: 'Result format.',
    },
  },
  required: ['run_id'],
} as const;

export const compactCdsUnitTestStatusSchema = compactUnitTestStatusSchema;
export const compactCdsUnitTestResultSchema = compactUnitTestResultSchema;

export const compactProfileScheduleSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Profiler trace description.' },
    all_procedural_units: {
      type: 'boolean',
      description: 'Trace all procedural units.',
    },
    all_misc_abap_statements: {
      type: 'boolean',
      description: 'Trace miscellaneous ABAP statements.',
    },
    all_internal_table_events: {
      type: 'boolean',
      description: 'Trace internal table events.',
    },
    all_dynpro_events: { type: 'boolean', description: 'Trace dynpro events.' },
    aggregate: { type: 'boolean', description: 'Aggregate profiling data.' },
    explicit_on_off: {
      type: 'boolean',
      description: 'Use explicit on/off trace sections.',
    },
    with_rfc_tracing: { type: 'boolean', description: 'Enable RFC tracing.' },
    all_system_kernel_events: {
      type: 'boolean',
      description: 'Trace system kernel events.',
    },
    sql_trace: { type: 'boolean', description: 'Enable SQL trace.' },
    all_db_events: { type: 'boolean', description: 'Trace all DB events.' },
    max_size_for_trace_file: {
      type: 'number',
      description: 'Maximum trace file size.',
    },
    amdp_trace: { type: 'boolean', description: 'Enable AMDP tracing.' },
    max_time_for_tracing: {
      type: 'number',
      description: 'Maximum tracing time.',
    },
  },
  required: [],
} as const;

export function compactProfileRunSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      target_type: {
        type: 'string',
        enum: members,
        description: 'Run target kind.',
      },
      class_name: { type: 'string', description: 'Class to run.' },
      program_name: {
        type: 'string',
        description: 'Program to run.',
      },
      profiler_id: {
        type: 'string',
        minLength: 1,
        description:
          'The profiler id of a scheduled trace. Given, the run goes under that trace; absent, the run is plain.',
      },
      background: COMPACT_BACKGROUND_PROPERTY,
    },
    required: ['target_type'],
  } as const;
}

export const compactProfileRunSchema = compactProfileRunSchemaFor(
  COMPACT_PROFILE.onprem,
);

export const compactProfileListSchema = {
  type: 'object',
  properties: {},
  required: [],
} as const;

export const compactProfileViewSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    trace_id_or_uri: {
      type: 'string',
      description: 'Profiler trace id or URI.',
    },
    view: {
      type: 'string',
      enum: ['hitlist', 'statements', 'db_accesses'],
      description: 'Profiler trace view kind.',
    },
    mode: {
      type: 'string',
      enum: ['raw', 'analyze'],
      default: 'raw',
      description:
        '"raw" returns the parsed trace payload as-is (default). "analyze" returns a compact summary instead — totals plus the top-ranked entries — via the same trace view.',
    },
    top: {
      type: 'number',
      description:
        'Number of top-ranked rows to include when mode is "analyze". Default 10. Ignored for mode "raw".',
    },
    with_system_events: {
      type: 'boolean',
      description: 'Include system events in analysis.',
    },
    id: { type: 'number', description: 'Optional statement/access id.' },
    with_details: { type: 'boolean', description: 'Include detailed payload.' },
    auto_drill_down_threshold: {
      type: 'number',
      description: 'Auto drill-down threshold.',
    },
  },
  required: ['trace_id_or_uri', 'view'],
} as const;

export const compactDumpListSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    feed_type: {
      type: 'string',
      enum: ['dumps', 'system_messages', 'gateway_errors'],
      default: 'dumps',
      description:
        'Which runtime feed to list. Default "dumps" (ABAP short dumps). "system_messages" and "gateway_errors" read the other two ADT runtime feeds through the same call.',
    },
    user: { type: 'string', description: 'Entries of this user.' },
    runtime_error: {
      type: 'string',
      description: 'Dumps whose runtime error contains this text, in any case.',
    },
    exception: {
      type: 'string',
      description:
        'Dumps whose exception class contains this text, in any case.',
    },
    object_name: {
      type: 'string',
      description:
        'Dumps whose terminated object name contains this text, in any case.',
    },
    package: {
      type: 'string',
      description:
        'Dumps whose object package contains this text, in any case.',
    },
    component: {
      type: 'string',
      description:
        'Dumps whose application component contains this text, in any case.',
    },
    top: {
      type: 'number',
      description:
        'Entries the page holds, 1 to 100 (SAP answers 100 when top is absent).',
    },
    from: {
      type: 'string',
      description: 'Start of time range (YYYYMMDDHHMMSS).',
    },
    to: {
      type: 'string',
      description:
        "End of time range (YYYYMMDDHHMMSS), inclusive: the page holds the entries up to that second; a previous answer's next_to is the next page's to, and that page starts at the boundary second, inclusive.",
    },
  },
  required: [],
} as const;

export const compactDumpViewSchema = {
  type: 'object',
  properties: {
    dump_id: {
      type: 'string',
      description: "The dump's dump_id, or its URI.",
    },
    view: {
      type: 'string',
      enum: ['default', 'summary', 'formatted'],
      default: 'default',
      description:
        '"summary" — runtime error, exception, terminated program, time, user and termination position; "default" — that summary and the parsed dump; "formatted" — the dump as formatted text.',
    },
  },
  required: ['dump_id'],
} as const;

export const compactServiceBindingListTypesSchema = {
  type: 'object',
  properties: {
    response_format: {
      type: 'string',
      enum: ['xml', 'json', 'plain'],
      default: 'xml',
      description: 'Response format for protocol types list.',
    },
  },
  required: [],
} as const;

export const compactServiceBindingValidateSchema = {
  type: 'object',
  properties: {
    service_binding_name: {
      type: 'string',
      description: 'Service binding name to validate.',
    },
    service_definition_name: {
      type: 'string',
      description: 'Service definition name to pair with binding.',
    },
    service_binding_version: {
      type: 'string',
      description: 'Service binding version.',
    },
    package_name: { type: 'string', description: 'Target package name.' },
    description: { type: 'string', description: 'Binding description.' },
  },
  required: ['service_binding_name', 'service_definition_name'],
} as const;

export const compactTransportCreateSchema = {
  type: 'object',
  properties: {
    transport_type: {
      type: 'string',
      enum: ['workbench', 'customizing'],
      default: 'workbench',
      description: 'Transport type.',
    },
    description: { type: 'string', description: 'Transport description.' },
    target_system: { type: 'string', description: 'Target system id.' },
    owner: { type: 'string', description: 'Transport owner user.' },
  },
  required: ['description'],
} as const;

export const compactTransportSortAndCompressSchema = {
  type: 'object',
  properties: {
    transport_number: {
      type: 'string',
      description: 'Number of the transport task to sort and compress.',
    },
  },
  required: ['transport_number'],
} as const;

/**
 * One entry of `objects`, as a constant of its own: the tool docs are read
 * from the sources as text, and a nested `default` inside the `objects`
 * property would be reported as the default of `objects` itself.
 */
const compactMovedTransportEntry = {
  type: 'object',
  properties: {
    object_name: { type: 'string', description: 'Object name.' },
    object_type: {
      type: 'string',
      description:
        'Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.',
    },
    position: {
      type: 'string',
      description:
        "Position of the object's entry in the source task's object list.",
    },
    pgmid: {
      type: 'string',
      description: "Program id. Defaults to R3TR, a workbench object's.",
      default: 'R3TR',
    },
  },
  required: ['object_name', 'object_type', 'position'],
} as const;

export const compactTransportMoveObjectsSchema = {
  type: 'object',
  properties: {
    transport_number: {
      type: 'string',
      description: 'Number of the transport task that holds the entries.',
    },
    target_number: {
      type: 'string',
      description: 'Number of the transport task the entries move to.',
    },
    objects: {
      type: 'array',
      minItems: 1,
      description:
        'The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.',
      items: compactMovedTransportEntry,
    },
  },
  required: ['transport_number', 'target_number', 'objects'],
} as const;

const lifecycleObjectSchema = <const M extends readonly string[]>(types: M) =>
  ({
    object_type: {
      type: 'string',
      enum: types,
      description: `Object type. ${supported(types)}`,
    },
    object_name: {
      type: 'string',
      description:
        'Object name. A function module is named GROUP|MODULE, its function group first.',
    },
  }) as const;

export function compactValidateSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        enum: members,
        description: `Object type to validate before create. ${supported(members)}`,
      },
      object_name: {
        type: 'string',
        description:
          'Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.',
      },
      package_name: {
        type: 'string',
        description:
          'Package of the object to validate. Required for BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION and SERVICE_BINDING.',
      },
      super_package: {
        type: 'string',
        description: 'Super package of the package to validate (PACKAGE).',
      },
      superclass: {
        type: 'string',
        description: 'Superclass of the class to validate (CLASS).',
      },
      description: {
        type: 'string',
        description:
          'Object description used during validation. Required for BEHAVIOR_DEFINITION and METADATA_EXTENSION.',
      },
      behavior_definition: {
        type: 'string',
        description:
          'Behavior definition the behavior implementation is for (BEHAVIOR_IMPLEMENTATION).',
      },
      root_entity: {
        type: 'string',
        description:
          'CDS root entity of the behavior definition to validate. Required for BEHAVIOR_DEFINITION.',
      },
      implementation_type: {
        type: 'string',
        description:
          'Implementation type of the behavior definition to validate (Managed, Unmanaged, Abstract or Projection). Required for BEHAVIOR_DEFINITION.',
      },
      service_definition_name: {
        type: 'string',
        description:
          'Required when object_type=SERVICE_BINDING. Service definition paired with the binding.',
      },
      service_binding_version: {
        type: 'string',
        description: 'Optional service binding version for SERVICE_BINDING.',
      },
    },
    required: ['object_type', 'object_name'],
  } as const;
}

export const compactValidateSchema = compactValidateSchemaFor(
  COMPACT_VALIDATE.onprem,
);

/** `HandlerDeletionCheck`: the one deletion-check request. */
export function compactDeletionCheckSchemaFor<
  const M extends readonly string[],
>(members: M) {
  return {
    type: 'object',
    properties: {
      ...lifecycleObjectSchema(members),
    },
    required: ['object_type', 'object_name'],
  } as const;
}

export const compactDeletionCheckSchema = compactDeletionCheckSchemaFor(
  COMPACT_DELETION_CHECK.onprem,
);

export function compactLockSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      ...lifecycleObjectSchema(members),
      super_package: {
        type: 'string',
        description:
          'Super package of the package to lock. Required for PACKAGE.',
      },
    },
    required: ['object_type', 'object_name'],
  } as const;
}

export const compactLockSchema = compactLockSchemaFor(COMPACT_LOCK.onprem);

export function compactUnlockSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      ...lifecycleObjectSchema(members),
      lock_handle: {
        type: 'string',
        description: 'Lock handle returned by lock.',
      },
    },
    required: ['object_type', 'object_name', 'lock_handle'],
  } as const;
}

export const compactUnlockSchema = compactUnlockSchemaFor(
  COMPACT_UNLOCK.onprem,
);

export function compactCheckRunSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      ...lifecycleObjectSchema(members),
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        default: 'active',
        description: 'Version to syntax-check.',
      },
      source_code: {
        type: 'string',
        description:
          'Source to check instead of the saved one; nothing is saved. CLASS, STRUCTURE and DDL only.',
      },
    },
    required: ['object_type', 'object_name'],
  } as const;
}

export const compactCheckRunSchema = compactCheckRunSchemaFor(
  COMPACT_CHECK.onprem,
);

export function compactActivateSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      object_type: objectTypeOf(
        members,
        "ABAP object type for routed compact operation. Names the object's type in the single form.",
      ),
      object_name: {
        type: 'string',
        description:
          'Object name (single form). A function module is named GROUP|MODULE, its function group first, or the module alone with function_group_name.',
      },
      function_group_name: {
        type: 'string',
        description:
          "A function module's function group (single form, FUNCTION_MODULE).",
      },
      object_adt_type: {
        type: 'string',
        description:
          'ADT object type code (e.g. CLAS/OC, PROG/P) of the object (single form).',
      },
      objects: {
        type: 'array',
        description: 'The objects activated together (list form).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Object name.' },
            type: { type: 'string', description: 'ADT object type code.' },
            uri: { type: 'string', description: 'Optional ADT object URI.' },
            parentName: {
              type: 'string',
              description:
                "Owning object, for a part of one: a function module's function group.",
            },
          },
          required: ['name', 'type'],
        },
      },
      preaudit: {
        type: 'boolean',
        description: 'Run pre-audit checks before activation.',
      },
    },
  } as const;
}

export const compactActivateSchema = compactActivateSchemaFor(
  COMPACT_ACTIVATE.onprem,
);

/** Object search by name or mask. */
export const compactSearchSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    query: {
      type: 'string',
      description: 'Object name or mask, with * as a wildcard.',
    },
    object_type: {
      type: 'string',
      description: 'ADT object type to restrict the search to.',
    },
    max_results: {
      type: 'number',
      default: 100,
      description: 'Maximum number of objects returned.',
    },
  },
  required: ['query'],
} as const;

/** Where-used list of one object. */
export function compactWhereUsedSchemaFor<const M extends readonly string[]>(
  members: M,
) {
  return {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      object_type: {
        type: 'string',
        enum: members,
        description: 'Type of the object whose usages are listed.',
      },
      object_name: { type: 'string', description: 'Object name.' },
      function_group_name: {
        type: 'string',
        description: 'Function group of the function module (FUNCTION_MODULE).',
      },
      max_results: {
        type: 'number',
        default: 100,
        description: 'Maximum number of referencing objects returned.',
      },
    },
    required: ['object_type', 'object_name'],
  } as const;
}

export const compactWhereUsedSchema = compactWhereUsedSchemaFor(
  COMPACT_WHERE_USED.onprem,
);

/** Rows of a table or CDS view, or of an SQL SELECT. */
export const compactGetDataSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    object_name: {
      type: 'string',
      description:
        'Table or CDS view whose rows are read, all columns. Used when sql_query is absent.',
    },
    sql_query: {
      type: 'string',
      description:
        'ABAP SQL SELECT naming the columns, conditions and order to read.',
    },
    max_rows: {
      type: 'number',
      default: 100,
      description: 'Maximum number of rows returned.',
    },
  },
  required: [],
} as const;
