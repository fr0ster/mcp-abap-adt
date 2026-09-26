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

import {
  type AdtClient,
  behaviorDefinitionDocuments,
  classDocuments,
  ddlDocuments,
  functionModuleDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseUnsupportedStatus,
  type IObjectVersion,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtVersionable } from '@mcp-abap-adt/interfaces-adt';
import { resultsFor } from '../../../lib/strategies/resultSets';

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
  /**
   * The versions atom to call getVersions/getVersionSource on.
   *
   * `IAdtObject` — a per-type bundle interface — is gone from adt-clients 19
   * (decision 19: member by member). `IAdtVersionable` is the one atom every
   * caller here actually uses, and `getVersionSource`'s source is hardcoded to
   * `string` by `VersionsCapability` regardless of which result set the
   * factory below was given — see `VersionsCapability.d.ts`.
   */
  obj: IAdtVersionable<any, any, string>;
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
      return {
        obj: client.getClass(resultsFor(classDocuments)),
        config: { className: name },
      };
    case 'program':
      return {
        obj: client.getProgram(resultsFor(programDocuments)),
        config: { programName: name },
      };
    case 'interface':
      return {
        obj: client.getInterface(resultsFor(interfaceDocuments)),
        config: { interfaceName: name },
      };
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
        obj: client.getFunctionModule(resultsFor(functionModuleDocuments)),
        config: { functionGroupName: groupName, functionModuleName: fmName },
      };
    }
    case 'table':
      return {
        obj: client.getTable(resultsFor(tableDocuments)),
        config: { tableName: name },
      };
    case 'structure':
      return {
        obj: client.getStructure(resultsFor(structureDocuments)),
        config: { structureName: name },
      };
    case 'ddl':
      return {
        obj: client.getDdl(resultsFor(ddlDocuments)),
        config: { ddlName: name },
      };
    case 'behavior_definition':
      return {
        obj: client.getBehaviorDefinition(
          resultsFor(behaviorDefinitionDocuments),
        ),
        config: { name },
      };
    case 'metadata_extension':
      return {
        obj: client.getMetadataExtension(
          resultsFor(metadataExtensionDocuments),
        ),
        config: { name },
      };
    default:
      return null;
  }
}

/**
 * Unwrap a failed version answer into the throw the version tools catch.
 *
 * `getVersions`/`getVersionSource` answer `IAdtResponse`; the tools serialised
 * that envelope as it was, and a response object serialises as `{"ok":true}` —
 * every version listing answered that and nothing else (E19, 2026-09-26).
 */
function thrown(error: { message: string; code?: string }): Error {
  const failure = new Error(error.message) as Error & { code?: string };
  if (error.code !== undefined) failure.code = error.code;
  return failure;
}

/**
 * The version history, as `IObjectVersion[]`. A system without the resource
 * answers 404/406; `analyseUnsupportedStatus` names that as the unsupported
 * operation the tools report (in adt-clients 22 the member threw it itself).
 */
export async function readVersions(
  resolved: ResolvedVersionedObject,
): Promise<IObjectVersion[]> {
  const answered = await resolved.obj.getVersions(resolved.config, {
    analyse: analyseUnsupportedStatus([404, 406], 'version history'),
  });
  if (!answered.ok) throw thrown(answered.getError());
  return answered.getResult().value as IObjectVersion[];
}

/** One version's source, as the text it came as. */
export async function readVersionSource(
  resolved: ResolvedVersionedObject,
  contentUri: string,
): Promise<string> {
  const answered = await resolved.obj.getVersionSource(contentUri, {
    analyse: analyseUnsupportedStatus([404, 406], 'version source'),
  });
  if (!answered.ok) throw thrown(answered.getError());
  return String(answered.getResult().value);
}
