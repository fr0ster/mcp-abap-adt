import { COMPACT_ACTIONS } from './compactActions';
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

export const compactActionSchema = {
  type: 'object',
  properties: {
    object_type: commonObjectTypeSchema,
    action: {
      type: 'string',
      enum: COMPACT_ACTIONS,
      description:
        'Action route to run for selected object_type (run/status/result/validate/list_types/create_transport).',
    },
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
    run_id: { type: 'string' },
    with_long_polling: { type: 'boolean' },
    with_navigation_uris: { type: 'boolean' },
    format: {
      type: 'string',
      enum: ['abapunit', 'junit'],
    },
    response_format: {
      type: 'string',
      enum: ['xml', 'json', 'plain'],
    },
    service_binding_name: { type: 'string' },
    service_definition_name: { type: 'string' },
    service_binding_version: { type: 'string' },
    package_name: { type: 'string' },
    description: { type: 'string' },
    transport_type: {
      type: 'string',
      enum: ['workbench', 'customizing'],
    },
    target_system: { type: 'string' },
    owner: { type: 'string' },
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
  required: ['object_type', 'action'],
} as const;
