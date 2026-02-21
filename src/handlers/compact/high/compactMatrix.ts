import type { CompactObjectType } from './compactObjectTypes';

export type CompactCrudOperation = 'create' | 'get' | 'update' | 'delete';

export const COMPACT_CRUD_MATRIX: Record<
  CompactObjectType,
  readonly CompactCrudOperation[]
> = {
  PACKAGE: ['create', 'get'],
  DOMAIN: ['create', 'get', 'update', 'delete'],
  DATA_ELEMENT: ['create', 'get', 'update', 'delete'],
  TRANSPORT: ['create'],
  TABLE: ['create', 'get', 'update', 'delete'],
  STRUCTURE: ['create', 'get', 'update', 'delete'],
  VIEW: ['create', 'get', 'update', 'delete'],
  SERVICE_DEFINITION: ['create', 'get', 'update', 'delete'],
  SERVICE_BINDING: ['create', 'get', 'update', 'delete'],
  CLASS: ['create', 'get', 'update', 'delete'],
  UNIT_TEST: ['create', 'get', 'update', 'delete'],
  CDS_UNIT_TEST: ['create', 'get', 'update', 'delete'],
  LOCAL_TEST_CLASS: ['create', 'get', 'update', 'delete'],
  LOCAL_TYPES: ['create', 'get', 'update', 'delete'],
  LOCAL_DEFINITIONS: ['create', 'get', 'update', 'delete'],
  LOCAL_MACROS: ['create', 'get', 'update', 'delete'],
  PROGRAM: ['create', 'get', 'update', 'delete'],
  INTERFACE: ['create', 'get', 'update', 'delete'],
  FUNCTION_GROUP: ['create', 'get', 'update', 'delete'],
  FUNCTION_MODULE: ['create', 'get', 'update', 'delete'],
  BEHAVIOR_DEFINITION: ['create', 'get', 'update', 'delete'],
  BEHAVIOR_IMPLEMENTATION: ['create', 'get', 'update', 'delete'],
  METADATA_EXTENSION: ['create', 'get', 'update', 'delete'],
  RUNTIME_PROFILE: [],
  RUNTIME_DUMP: [],
};
