import type { CompactObjectType } from './compactObjectTypes';

export type LowObjectType =
  | 'class'
  | 'program'
  | 'interface'
  | 'function_group'
  | 'function_module'
  | 'table'
  | 'structure'
  | 'view'
  | 'domain'
  | 'data_element'
  | 'package'
  | 'behavior_definition'
  | 'behavior_implementation'
  | 'metadata_extension';

const compactToLowMap: Partial<Record<CompactObjectType, LowObjectType>> = {
  CLASS: 'class',
  PROGRAM: 'program',
  INTERFACE: 'interface',
  FUNCTION_GROUP: 'function_group',
  FUNCTION_MODULE: 'function_module',
  TABLE: 'table',
  STRUCTURE: 'structure',
  VIEW: 'view',
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
