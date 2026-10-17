import type { CompactObjectType } from './compactObjectTypes';

export type LowObjectType =
  | 'class'
  | 'program'
  | 'interface'
  | 'function_group'
  | 'function_module'
  | 'table'
  | 'structure'
  | 'ddl'
  | 'domain'
  | 'data_element'
  | 'package'
  | 'behavior_definition'
  | 'behavior_implementation'
  | 'metadata_extension'
  | 'service_definition'
  | 'service_binding';

const compactToLowMap: Partial<Record<CompactObjectType, LowObjectType>> = {
  CLASS: 'class',
  PROGRAM: 'program',
  INTERFACE: 'interface',
  FUNCTION_GROUP: 'function_group',
  FUNCTION_MODULE: 'function_module',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DDL: 'ddl',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'data_element',
  PACKAGE: 'package',
  BEHAVIOR_DEFINITION: 'behavior_definition',
  BEHAVIOR_IMPLEMENTATION: 'behavior_implementation',
  METADATA_EXTENSION: 'metadata_extension',
};

export function toLowObjectType(
  objectType: CompactObjectType,
): LowObjectType | null {
  return compactToLowMap[objectType] || null;
}

/**
 * The types `HandlerLock` and `HandlerUnlock` take: those of
 * {@link toLowObjectType}, and the service definition and service binding.
 */
const compactToLockMap: Partial<Record<CompactObjectType, LowObjectType>> = {
  ...compactToLowMap,
  SERVICE_DEFINITION: 'service_definition',
  SERVICE_BINDING: 'service_binding',
};

export function toLockObjectType(
  objectType: CompactObjectType,
): LowObjectType | null {
  return compactToLockMap[objectType] || null;
}
