import { COMPACT_OBJECT_TYPES } from './compactObjectTypes';

const versionSchema = {
  type: 'string',
  enum: ['active', 'inactive'],
  default: 'active',
} as const;

const commonObjectTypeSchema = {
  type: 'string',
  enum: COMPACT_OBJECT_TYPES,
  description:
    'ABAP object type for routed operation. Current set: CLASS, PROGRAM, DOMAIN, FUNCTION_MODULE.',
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
  oneOf: [
    {
      properties: { object_type: { const: 'CLASS' } },
      required: ['object_type', 'class_name', 'package_name'],
    },
    {
      properties: { object_type: { const: 'PROGRAM' } },
      required: ['object_type', 'program_name', 'package_name'],
    },
    {
      properties: { object_type: { const: 'DOMAIN' } },
      required: ['object_type', 'domain_name', 'package_name'],
    },
    {
      properties: { object_type: { const: 'FUNCTION_MODULE' } },
      required: [
        'object_type',
        'function_module_name',
        'function_group_name',
        'source_code',
      ],
    },
  ],
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
  oneOf: [
    {
      properties: { object_type: { const: 'CLASS' } },
      required: ['object_type', 'class_name'],
    },
    {
      properties: { object_type: { const: 'PROGRAM' } },
      required: ['object_type', 'program_name'],
    },
    {
      properties: { object_type: { const: 'DOMAIN' } },
      required: ['object_type', 'domain_name'],
    },
    {
      properties: { object_type: { const: 'FUNCTION_MODULE' } },
      required: ['object_type', 'function_module_name', 'function_group_name'],
    },
  ],
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
  oneOf: [
    {
      properties: { object_type: { const: 'CLASS' } },
      required: ['object_type', 'class_name', 'source_code'],
    },
    {
      properties: { object_type: { const: 'PROGRAM' } },
      required: ['object_type', 'program_name', 'source_code'],
    },
    {
      properties: { object_type: { const: 'DOMAIN' } },
      required: ['object_type', 'domain_name', 'package_name'],
    },
    {
      properties: { object_type: { const: 'FUNCTION_MODULE' } },
      required: [
        'object_type',
        'function_module_name',
        'function_group_name',
        'source_code',
      ],
    },
  ],
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
  oneOf: [
    {
      properties: { object_type: { const: 'CLASS' } },
      required: ['object_type', 'class_name'],
    },
    {
      properties: { object_type: { const: 'PROGRAM' } },
      required: ['object_type', 'program_name'],
    },
    {
      properties: { object_type: { const: 'DOMAIN' } },
      required: ['object_type', 'domain_name'],
    },
    {
      properties: { object_type: { const: 'FUNCTION_MODULE' } },
      required: ['object_type', 'function_module_name', 'function_group_name'],
    },
  ],
} as const;
