/**
 * Shared object_type → IAdtObject resolver for the read-only version-history
 * handlers (GetObjectVersions / GetObjectVersionSource).
 *
 * Mirrors the switch in handleLockObject EXACTLY: the SAME object_type values,
 * the SAME client.getX() accessors, and the SAME config name keys. Instead of
 * calling .lock(...), callers use the returned IAdtObject to call
 * .getVersions(config) / .getVersionSource(contentUri).
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtObject } from '@mcp-abap-adt/interfaces';

/**
 * object_type values supported for version history: the source-backed subset
 * of LockObject's types. function_group, domain, data_element, and package
 * have no /source/main and never supported version history (getVersions/
 * getVersionSource always threw ADT_UNSUPPORTED_OPERATION at runtime); the
 * adt-clients 8.0.0 capability narrowing now makes that a compile-time fact.
 */
export const VERSIONED_OBJECT_TYPES = [
  'class',
  'program',
  'interface',
  'function_module',
  'table',
  'structure',
  'ddl',
  'behavior_definition',
  'metadata_extension',
] as const;

export interface ResolvedVersionedObject {
  /** The IAdtObject instance to call getVersions/getVersionSource on. */
  obj: IAdtObject<any, any>;
  /** Identity config to pass to getVersions(config). */
  config: Record<string, unknown>;
}

/**
 * Resolve an object_type + name into an IAdtObject instance and its identity
 * config. Returns null for an unknown object_type (caller emits the error).
 *
 * @throws Error for a malformed function_module identity (missing group name).
 */
export function resolveVersionedObject(
  client: AdtClient,
  objectType: string,
  objectName: string,
  functionGroupName?: string,
): ResolvedVersionedObject | null {
  const name = objectName.toUpperCase();
  switch (objectType) {
    case 'class':
      return { obj: client.getClass(), config: { className: name } };
    case 'program':
      return { obj: client.getProgram(), config: { programName: name } };
    case 'interface':
      return { obj: client.getInterface(), config: { interfaceName: name } };
    case 'function_module': {
      // Identity is the FM name + its owning function group. The group can be
      // passed explicitly (function_group_name) or via GROUP|FM_NAME, as the
      // lock handler accepts.
      let groupName = functionGroupName?.toUpperCase();
      let fmName = name;
      if (name.includes('|')) {
        const [g, fm] = name.split('|');
        groupName = (functionGroupName?.toUpperCase() || g).toUpperCase();
        fmName = fm;
      }
      if (!groupName) {
        throw new Error(
          'function_group_name is required for function_module (or use GROUP|FM_NAME).',
        );
      }
      return {
        obj: client.getFunctionModule(),
        config: { functionGroupName: groupName, functionModuleName: fmName },
      };
    }
    case 'table':
      return { obj: client.getTable(), config: { tableName: name } };
    case 'structure':
      return { obj: client.getStructure(), config: { structureName: name } };
    case 'ddl':
      return { obj: client.getDdl(), config: { ddlName: name } };
    case 'behavior_definition':
      return { obj: client.getBehaviorDefinition(), config: { name } };
    case 'metadata_extension':
      return { obj: client.getMetadataExtension(), config: { name } };
    default:
      return null;
  }
}
