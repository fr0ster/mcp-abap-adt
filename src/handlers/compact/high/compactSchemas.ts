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
    description: {
      type: 'string',
      description: 'Human-readable object description.',
    },
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
    },
    source_code: { type: 'string', description: 'ABAP source code payload.' },
    activate: { type: 'boolean', description: 'Activate object after create.' },
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
  },
  required: ['object_type'],
} as const;

export const compactGetSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
    package_name: { type: 'string', description: 'Package name.' },
    class_name: { type: 'string', description: 'Class name.' },
    interface_name: { type: 'string', description: 'Interface name.' },
    program_name: { type: 'string', description: 'Program name.' },
    domain_name: { type: 'string', description: 'Domain name.' },
    data_element_name: { type: 'string', description: 'Data element name.' },
    table_name: { type: 'string', description: 'Table name.' },
    structure_name: { type: 'string', description: 'Structure name.' },
    view_name: { type: 'string', description: 'View name.' },
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
    run_id: { type: 'string', description: 'Unit test run id.' },
    response_format: {
      type: 'string',
      enum: ['xml', 'json', 'plain'],
      description: 'Response format for SERVICE_BINDING reads.',
    },
    version: versionSchema,
  },
  required: ['object_type'],
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
    source_code: { type: 'string', description: 'ABAP source code payload.' },
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
    },
    activate: { type: 'boolean', description: 'Activate object after update.' },
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
  },
  required: ['object_type'],
} as const;

export const compactDeleteSchema = {
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
    transport_request: {
      type: 'string',
      description: 'Transport request id (if required by system).',
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
      description: 'Run title shown in ABAP Unit logs.',
    },
    context: { type: 'string', description: 'Run context label.' },
    scope: {
      type: 'object',
      description: 'ABAP Unit scope flags.',
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
    trace_id_or_uri: {
      type: 'string',
      description: 'Profiler trace id or URI.',
    },
    view: {
      type: 'string',
      enum: ['hitlist', 'statements', 'db_accesses'],
      description: 'Profiler trace view kind.',
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
    user: { type: 'string', description: 'Filter dumps by user.' },
    inlinecount: {
      type: 'string',
      enum: ['allpages', 'none'],
      description: 'Include total count in response.',
    },
    top: { type: 'number', description: 'Limit number of returned dumps.' },
    skip: { type: 'number', description: 'Offset for pagination.' },
    orderby: { type: 'string', description: 'Sort expression.' },
  },
  required: [],
} as const;

export const compactDumpViewSchema = {
  type: 'object',
  properties: {
    dump_id: { type: 'string', description: 'Runtime dump id.' },
    view: {
      type: 'string',
      enum: ['default', 'summary', 'formatted'],
      default: 'default',
      description: 'Dump rendering mode.',
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

const compactLifecycleObjectSchema = {
  object_type: commonObjectTypeSchema,
  object_name: {
    type: 'string',
    description: 'Primary object name for lifecycle operation.',
  },
} as const;

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
        'VIEW',
        'DOMAIN',
        'DATA_ELEMENT',
        'PACKAGE',
        'BEHAVIOR_DEFINITION',
        'BEHAVIOR_IMPLEMENTATION',
        'METADATA_EXTENSION',
        'SERVICE_BINDING',
      ],
      description:
        'Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, VIEW, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.',
    },
    object_name: {
      type: 'string',
      description:
        'Required object name. For SERVICE_BINDING this is the service binding name.',
    },
    package_name: {
      type: 'string',
      description:
        'Optional package context for validation (especially for create scenarios).',
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
    ...compactLifecycleObjectSchema,
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
    ...compactLifecycleObjectSchema,
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
    ...compactLifecycleObjectSchema,
    version: {
      type: 'string',
      enum: ['active', 'inactive'],
      default: 'active',
      description: 'Version to syntax-check.',
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
    object_type: commonObjectTypeSchema,
    object_name: {
      type: 'string',
      description: 'Object name for single-object activation form.',
    },
    object_adt_type: {
      type: 'string',
      description:
        'ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.',
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
