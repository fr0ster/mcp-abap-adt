/**
 * Shared object_type → IAdtObject resolver for the read-only version-history
 * handlers (GetObjectVersions / GetObjectVersionSource).
 *
 * Uses the SAME client.getX() accessors and config name keys as handleLockObject,
 * but only for the object types that actually support version history
 * (IAdtSourceObject). Callers use the returned handler to call
 * .getVersions(config) / .getVersionSource(contentUri). Non-versioned lockable
 * types (function_group, domain, data_element, package) are deliberately absent.
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtObject } from '@mcp-abap-adt/interfaces';

/** object_type values supported for version history (same set as LockObject). */
// Only object types whose adt-clients handler actually implements version
// history (IAdtSourceObject) belong here. function_group, domain, data_element
// and package are IAdtNonVersionedObject — their getVersions/getVersionSource
// throw "not supported", so exposing them here advertised a capability that
// never worked. The lock switch (handleLockObject) is intentionally wider:
// those types ARE lockable, just not versioned.
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
