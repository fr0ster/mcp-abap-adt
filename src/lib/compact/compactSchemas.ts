import { COMPACT_BACKGROUND_PROPERTY } from '../backgroundRuns/tools';
import { TIMEOUT_PROPERTY } from '../longTools';
import { COMPACT_OBJECT_TYPES } from './compactObjectTypes';

const versionSchema = {
  type: 'string',
  enum: ['active', 'inactive'],
  default: 'active',
  description: 'Object version to read/check.',
} as const;

const commonObjectTypeSchema = {
  type: 'string',
  enum: COMPACT_OBJECT_TYPES,
  description: 'ABAP object type for routed compact operation.',
} as const;

export const compactCreateSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
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
    description: {
      type: 'string',
      description: 'Human-readable object description.',
    },
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
    },
    activate: { type: 'boolean', description: 'Activate object after create.' },
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
    superclass: {
      type: 'string',
      description: 'Superclass name (CLASS create).',
    },
    final: {
      type: 'boolean',
      description: 'Mark the class final (CLASS create).',
    },
    abstract: {
      type: 'boolean',
      description: 'Mark the class abstract (CLASS create).',
    },
    create_protected: {
      type: 'boolean',
      description: 'Protected constructor (CLASS create).',
    },
    program_type: { type: 'string', description: 'ABAP program type.' },
    application: { type: 'string', description: 'Domain application area.' },
    datatype: { type: 'string', description: 'ABAP data type.' },
    length: { type: 'number', description: 'Length for typed artifacts.' },
    decimals: { type: 'number', description: 'Decimal places.' },
    conversion_exit: { type: 'string', description: 'Conversion exit name.' },
    lowercase: {
      type: 'boolean',
      description: 'Allow lowercase values (domain setting).',
    },
    sign_exists: {
      type: 'boolean',
      description: 'Allow signed values (domain setting).',
    },
    value_table: { type: 'string', description: 'Foreign key value table.' },
    fixed_values: {
      type: 'array',
      description: 'Domain fixed values list.',
      items: {
        type: 'object',
        properties: {
          low: { type: 'string', description: 'Fixed value key.' },
          text: { type: 'string', description: 'Fixed value text.' },
        },
        required: ['low', 'text'],
      },
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
    name: {
      type: 'string',
      description:
        'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
    },
    root_entity: {
      type: 'string',
      description: 'Root CDS entity name (behavior definition create).',
    },
    implementation_type: {
      type: 'string',
      enum: ['Managed', 'Unmanaged', 'Abstract', 'Projection'],
      description: 'Behavior definition implementation type.',
    },
    behavior_definition: {
      type: 'string',
      description:
        'Referenced behavior definition name (behavior implementation create).',
    },
    cds_view_name: {
      type: 'string',
      description: 'CDS view name to validate for unit test doubles.',
    },
    fields: {
      type: 'array',
      description: 'Structure fields (for STRUCTURE create).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Field name.' },
          data_type: { type: 'string', description: 'Field data type.' },
          length: { type: 'number', description: 'Field length.' },
          decimals: { type: 'number', description: 'Decimal places.' },
          domain: { type: 'string', description: 'Domain reference.' },
          data_element: {
            type: 'string',
            description: 'Data element reference.',
          },
          structure_ref: {
            type: 'string',
            description: 'Included structure reference.',
          },
          table_ref: { type: 'string', description: 'Table type reference.' },
          description: { type: 'string', description: 'Field description.' },
        },
        required: ['name'],
      },
    },
    test_class_source: {
      type: 'string',
      description:
        'ABAP source of the local test classes (UNIT_TEST and CDS_UNIT_TEST create).',
    },
  },
  required: ['object_type'],
} as const;

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
  ],
  default: 'source',
  description:
    'Which aspect to read: the source, the ADT metadata document, the service and preview URLs, or the objects a package contains. A part this object type does not offer is refused, naming the parts it does. Three parts read the repository by ADT address and take no object_type: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions).',
} as const;

export const compactGetSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    object_type: commonObjectTypeSchema,
    part: readPartSchema,
    package_name: { type: 'string', description: 'Package name.' },
    max_results: {
      type: 'number',
      default: 100,
      description: 'Maximum number of members listed (part contents).',
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
      description: 'Function module name.',
    },
    function_group_name: {
      type: 'string',
      description: 'Function group name.',
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
    run_id: { type: 'string', description: 'Unit test run id.' },
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
      description: 'Node id to expand (node_structure); the root when absent.',
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

export const compactUpdateSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
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
    source_code: { type: 'string', description: 'ABAP source code payload.' },
    ddl_source: {
      type: 'string',
      description: 'Complete DDL source code (for DDL update).',
    },
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
    },
    activate: { type: 'boolean', description: 'Activate object after update.' },
    lock_handle: {
      type: 'string',
      description:
        'Lock handle from HandlerLock: write under the lock already held, with no lock, unlock, check or activation of its own. Without it the update locks and unlocks itself.',
    },
    super_package: {
      type: 'string',
      description: 'Super package (PACKAGE update).',
    },
    properties: {
      type: 'object',
      description:
        'DOMAIN or DATA_ELEMENT under lock_handle: further properties to change, by their property names.',
    },
    description: {
      type: 'string',
      description: 'Human-readable object description.',
    },
    datatype: { type: 'string', description: 'ABAP data type.' },
    length: { type: 'number', description: 'Length for typed artifacts.' },
    decimals: { type: 'number', description: 'Decimal places.' },
    conversion_exit: { type: 'string', description: 'Conversion exit name.' },
    lowercase: {
      type: 'boolean',
      description: 'Allow lowercase values (domain setting).',
    },
    sign_exists: {
      type: 'boolean',
      description: 'Allow signed values (domain setting).',
    },
    value_table: { type: 'string', description: 'Foreign key value table.' },
    fixed_values: {
      type: 'array',
      description: 'Domain fixed values list.',
      items: {
        type: 'object',
        properties: {
          low: { type: 'string', description: 'Fixed value key.' },
          text: { type: 'string', description: 'Fixed value text.' },
        },
        required: ['low', 'text'],
      },
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
      description: 'Published service name (service binding update).',
    },
    name: {
      type: 'string',
      description:
        'Object name for handlers that require a generic `name` (behavior definition, metadata extension).',
    },
    behavior_definition: {
      type: 'string',
      description:
        'Referenced behavior definition name (behavior implementation update).',
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
      enum: ['published', 'unpublished', 'unchanged'],
      description: 'Target publication state (service binding update).',
    },
  },
  required: ['object_type'],
} as const;

export const compactDeleteSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
    package_name: { type: 'string', description: 'ABAP package name.' },
    force_new_connection: {
      type: 'boolean',
      description:
        'PACKAGE: delete from a new connection, closed afterwards — for a package saved earlier through this connection.',
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
    ddl_name: {
      type: 'string',
      description: 'DDL source name (CDS view, AMDP table function, etc.).',
    },
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
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
    title: {
      type: 'string',
      description: 'Run title shown in ABAP Unit test logs.',
    },
    context: { type: 'string', description: 'Run context label.' },
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

export const compactProfileRunSchema = {
  type: 'object',
  properties: {
    target_type: {
      type: 'string',
      enum: ['CLASS', 'PROGRAM'],
      description: 'Profile execution target kind.',
    },
    class_name: { type: 'string', description: 'Class name for profiling.' },
    program_name: {
      type: 'string',
      description: 'Program name for profiling.',
    },
    background: COMPACT_BACKGROUND_PROPERTY,
    profiling: {
      type: 'boolean',
      default: true,
      description:
        'Whether to capture a profiler trace while running. Default true. Set false for a plain run with no tracing — the profiling flags below are then ignored.',
    },
    description: { type: 'string', description: 'Profiler run description.' },
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
  required: ['target_type'],
} as const;

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
        'Most entries, up to 1000 (default 50); SAP answers 100 per request and the pages are read in turn.',
    },
    from: {
      type: 'string',
      description: 'Start of time range (YYYYMMDDHHMMSS).',
    },
    to: {
      type: 'string',
      description:
        'End of time range (YYYYMMDDHHMMSS); a previous next_to reads on.',
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

const compactLifecycleObjectSchema = {
  object_type: commonObjectTypeSchema,
  object_name: {
    type: 'string',
    description: 'Primary object name for lifecycle operation.',
  },
} as const;

/** The types a lock and an unlock are sent for. */
const LOCKABLE_TYPES = [
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
  'BEHAVIOR_IMPLEMENTATION',
  'METADATA_EXTENSION',
] as const;

/** The types a syntax check is sent for. */
const CHECKABLE_TYPES = [
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
] as const;

const lifecycleObjectSchema = (types: readonly string[]) =>
  ({
    object_type: {
      type: 'string',
      enum: types,
      description: `Object type. Supported: ${types.join(', ')}.`,
    },
    object_name: {
      type: 'string',
      description:
        'Object name. A function module is named GROUP|MODULE, its function group first.',
    },
  }) as const;

export const compactValidateSchema = {
  type: 'object',
  properties: {
    ...compactLifecycleObjectSchema,
    object_type: {
      type: 'string',
      enum: [
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
        'BEHAVIOR_IMPLEMENTATION',
        'METADATA_EXTENSION',
        'SERVICE_BINDING',
      ],
      description:
        'Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.',
    },
    object_name: {
      type: 'string',
      description:
        'Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.',
    },
    package_name: {
      type: 'string',
      description:
        'Optional package context for validation (especially for create scenarios).',
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
      description: 'Optional object description used during validation.',
    },
    behavior_definition: {
      type: 'string',
      description:
        'Optional behavior definition name, used when validating behavior implementation.',
    },
    root_entity: {
      type: 'string',
      description:
        'Optional CDS root entity name, used for behavior-related validation.',
    },
    implementation_type: {
      type: 'string',
      description:
        'Optional implementation type, used for behavior implementation validation.',
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
    session_id: {
      type: 'string',
      description: 'Optional ADT session id for stateful validation flow.',
    },
    session_state: {
      type: 'object',
      description:
        'Optional ADT session state container (cookies/CSRF) for stateful validation flow.',
      properties: {
        cookies: {
          type: 'string',
          description: 'Serialized Cookie header to reuse server session.',
        },
        csrf_token: {
          type: 'string',
          description: 'CSRF token to reuse server session.',
        },
        cookie_store: {
          type: 'object',
          description: 'Cookie key/value map to reuse server session.',
        },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactLockSchema = {
  type: 'object',
  properties: {
    ...lifecycleObjectSchema(LOCKABLE_TYPES),
    super_package: {
      type: 'string',
      description: 'Super package context when relevant.',
    },
    session_id: {
      type: 'string',
      description: 'Optional ADT session id for stateful lock flow.',
    },
    session_state: {
      type: 'object',
      description:
        'Optional ADT session state container (cookies/CSRF) for stateful lock flow.',
      properties: {
        cookies: {
          type: 'string',
          description: 'Serialized Cookie header to reuse server session.',
        },
        csrf_token: {
          type: 'string',
          description: 'CSRF token to reuse server session.',
        },
        cookie_store: {
          type: 'object',
          description: 'Cookie key/value map to reuse server session.',
        },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactUnlockSchema = {
  type: 'object',
  properties: {
    ...lifecycleObjectSchema(LOCKABLE_TYPES),
    lock_handle: {
      type: 'string',
      description: 'Lock handle returned by lock.',
    },
    session_id: {
      type: 'string',
      description: 'ADT session id used during lock.',
    },
    session_state: {
      type: 'object',
      description:
        'Optional ADT session state container (cookies/CSRF) for stateful unlock flow.',
      properties: {
        cookies: {
          type: 'string',
          description: 'Serialized Cookie header to reuse server session.',
        },
        csrf_token: {
          type: 'string',
          description: 'CSRF token to reuse server session.',
        },
        cookie_store: {
          type: 'object',
          description: 'Cookie key/value map to reuse server session.',
        },
      },
    },
  },
  required: ['object_type', 'object_name', 'lock_handle', 'session_id'],
} as const;

export const compactCheckRunSchema = {
  type: 'object',
  properties: {
    ...lifecycleObjectSchema(CHECKABLE_TYPES),
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
    session_id: {
      type: 'string',
      description: 'Optional ADT session id for stateful check flow.',
    },
    session_state: {
      type: 'object',
      description:
        'Optional ADT session state container (cookies/CSRF) for stateful check flow.',
      properties: {
        cookies: {
          type: 'string',
          description: 'Serialized Cookie header to reuse server session.',
        },
        csrf_token: {
          type: 'string',
          description: 'CSRF token to reuse server session.',
        },
        cookie_store: {
          type: 'object',
          description: 'Cookie key/value map to reuse server session.',
        },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactActivateSchema = {
  type: 'object',
  properties: {
    object_type: {
      ...commonObjectTypeSchema,
      description: `${commonObjectTypeSchema.description} For single-object activation, this alone is enough — no ADT type code needed.`,
    },
    object_name: {
      type: 'string',
      description: 'Object name for single-object activation form.',
    },
    object_adt_type: {
      type: 'string',
      description:
        'ADT object type code (e.g. CLAS/OC, PROG/P), for a type object_type does not cover. Only needed when object_type is not enough; prefer object_type otherwise.',
    },
    objects: {
      type: 'array',
      description: 'Explicit objects list for batch activation.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Object name.' },
          type: { type: 'string', description: 'ADT object type code.' },
          uri: { type: 'string', description: 'Optional ADT object URI.' },
          parentName: {
            type: 'string',
            description:
              'Owning object, for a part of one — a function module needs its function group here, or the address is built under a group named after the module.',
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
export const compactWhereUsedSchema = {
  type: 'object',
  properties: {
    timeout: TIMEOUT_PROPERTY,
    object_type: {
      type: 'string',
      enum: [
        'CLASS',
        'INTERFACE',
        'PROGRAM',
        'INCLUDE',
        'FUNCTION_GROUP',
        'FUNCTION_MODULE',
        'PACKAGE',
        'TABLE',
        'STRUCTURE',
        'DOMAIN',
        'DATA_ELEMENT',
        'DDL',
      ],
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
