import { COMPACT_OBJECT_TYPES } from './compactObjectTypes';

const versionSchema = {
  type: 'string',
  enum: ['active', 'inactive'],
  default: 'active',
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
    class_name: { type: 'string' },
    program_name: { type: 'string' },
    domain_name: { type: 'string' },
    function_module_name: { type: 'string' },
    function_group_name: { type: 'string' },
    package_name: { type: 'string' },
    description: { type: 'string' },
    transport_request: { type: 'string' },
    source_code: { type: 'string' },
    activate: { type: 'boolean' },
    program_type: { type: 'string' },
    application: { type: 'string' },
    datatype: { type: 'string' },
    length: { type: 'number' },
    decimals: { type: 'number' },
    conversion_exit: { type: 'string' },
    lowercase: { type: 'boolean' },
    sign_exists: { type: 'boolean' },
    value_table: { type: 'string' },
    fixed_values: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          low: { type: 'string' },
          text: { type: 'string' },
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
    class_name: { type: 'string' },
    program_name: { type: 'string' },
    domain_name: { type: 'string' },
    function_module_name: { type: 'string' },
    function_group_name: { type: 'string' },
    version: versionSchema,
  },
  required: ['object_type'],
} as const;

export const compactUpdateSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
    class_name: { type: 'string' },
    program_name: { type: 'string' },
    domain_name: { type: 'string' },
    function_module_name: { type: 'string' },
    function_group_name: { type: 'string' },
    package_name: { type: 'string' },
    source_code: { type: 'string' },
    transport_request: { type: 'string' },
    activate: { type: 'boolean' },
    description: { type: 'string' },
    datatype: { type: 'string' },
    length: { type: 'number' },
    decimals: { type: 'number' },
    conversion_exit: { type: 'string' },
    lowercase: { type: 'boolean' },
    sign_exists: { type: 'boolean' },
    value_table: { type: 'string' },
    fixed_values: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          low: { type: 'string' },
          text: { type: 'string' },
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
    class_name: { type: 'string' },
    program_name: { type: 'string' },
    domain_name: { type: 'string' },
    function_module_name: { type: 'string' },
    function_group_name: { type: 'string' },
    transport_request: { type: 'string' },
  },
  required: ['object_type'],
} as const;

export const compactUnitTestRunSchema = {
  type: 'object',
  properties: {
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          container_class: { type: 'string' },
          test_class: { type: 'string' },
        },
        required: ['container_class', 'test_class'],
      },
    },
    title: { type: 'string' },
    context: { type: 'string' },
    scope: {
      type: 'object',
      properties: {
        own_tests: { type: 'boolean' },
        foreign_tests: { type: 'boolean' },
        add_foreign_tests_as_preview: { type: 'boolean' },
      },
    },
    risk_level: {
      type: 'object',
      properties: {
        harmless: { type: 'boolean' },
        dangerous: { type: 'boolean' },
        critical: { type: 'boolean' },
      },
    },
    duration: {
      type: 'object',
      properties: {
        short: { type: 'boolean' },
        medium: { type: 'boolean' },
        long: { type: 'boolean' },
      },
    },
  },
  required: ['tests'],
} as const;

export const compactUnitTestStatusSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'string' },
    with_long_polling: { type: 'boolean', default: true },
  },
  required: ['run_id'],
} as const;

export const compactUnitTestResultSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'string' },
    with_navigation_uris: { type: 'boolean', default: false },
    format: { type: 'string', enum: ['abapunit', 'junit'] },
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
    class_name: { type: 'string' },
    program_name: { type: 'string' },
    description: { type: 'string' },
    all_procedural_units: { type: 'boolean' },
    all_misc_abap_statements: { type: 'boolean' },
    all_internal_table_events: { type: 'boolean' },
    all_dynpro_events: { type: 'boolean' },
    aggregate: { type: 'boolean' },
    explicit_on_off: { type: 'boolean' },
    with_rfc_tracing: { type: 'boolean' },
    all_system_kernel_events: { type: 'boolean' },
    sql_trace: { type: 'boolean' },
    all_db_events: { type: 'boolean' },
    max_size_for_trace_file: { type: 'number' },
    amdp_trace: { type: 'boolean' },
    max_time_for_tracing: { type: 'number' },
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
    trace_id_or_uri: { type: 'string' },
    view: {
      type: 'string',
      enum: ['hitlist', 'statements', 'db_accesses'],
    },
    with_system_events: { type: 'boolean' },
    id: { type: 'number' },
    with_details: { type: 'boolean' },
    auto_drill_down_threshold: { type: 'number' },
  },
  required: ['trace_id_or_uri', 'view'],
} as const;

export const compactDumpListSchema = {
  type: 'object',
  properties: {
    user: { type: 'string' },
    inlinecount: { type: 'string', enum: ['allpages', 'none'] },
    top: { type: 'number' },
    skip: { type: 'number' },
    orderby: { type: 'string' },
  },
  required: [],
} as const;

export const compactDumpViewSchema = {
  type: 'object',
  properties: {
    dump_id: { type: 'string' },
    view: {
      type: 'string',
      enum: ['default', 'summary', 'formatted'],
      default: 'default',
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
    },
  },
  required: [],
} as const;

export const compactServiceBindingValidateSchema = {
  type: 'object',
  properties: {
    service_binding_name: { type: 'string' },
    service_definition_name: { type: 'string' },
    service_binding_version: { type: 'string' },
    package_name: { type: 'string' },
    description: { type: 'string' },
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
    },
    description: { type: 'string' },
    target_system: { type: 'string' },
    owner: { type: 'string' },
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
    package_name: { type: 'string' },
    description: { type: 'string' },
    behavior_definition: { type: 'string' },
    root_entity: { type: 'string' },
    implementation_type: { type: 'string' },
    service_definition_name: { type: 'string' },
    service_binding_version: { type: 'string' },
    session_id: { type: 'string' },
    session_state: {
      type: 'object',
      properties: {
        cookies: { type: 'string' },
        csrf_token: { type: 'string' },
        cookie_store: { type: 'object' },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactLockSchema = {
  type: 'object',
  properties: {
    ...compactLifecycleObjectSchema,
    super_package: { type: 'string' },
    session_id: { type: 'string' },
    session_state: {
      type: 'object',
      properties: {
        cookies: { type: 'string' },
        csrf_token: { type: 'string' },
        cookie_store: { type: 'object' },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactUnlockSchema = {
  type: 'object',
  properties: {
    ...compactLifecycleObjectSchema,
    lock_handle: { type: 'string' },
    session_id: { type: 'string' },
    session_state: {
      type: 'object',
      properties: {
        cookies: { type: 'string' },
        csrf_token: { type: 'string' },
        cookie_store: { type: 'object' },
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
    },
    session_id: { type: 'string' },
    session_state: {
      type: 'object',
      properties: {
        cookies: { type: 'string' },
        csrf_token: { type: 'string' },
        cookie_store: { type: 'object' },
      },
    },
  },
  required: ['object_type', 'object_name'],
} as const;

export const compactActivateSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
    object_name: { type: 'string' },
    object_adt_type: {
      type: 'string',
      description:
        'ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.',
    },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          uri: { type: 'string' },
        },
        required: ['name', 'type'],
      },
    },
    preaudit: { type: 'boolean' },
  },
} as const;
