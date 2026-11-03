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
  behaviorDefinitionDocuments,
  classDocuments,
  ddlDocuments,
  functionModuleDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseUnsupportedStatus,
  type IObjectVersion,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  IAdtVersionable,
  IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import {
  VERSIONED_KINDS,
  type VersionedKind,
} from '../../../lib/adtProjections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { carryingFailure } from '../../../lib/strategies/step';

/** object_type values supported for version history (same set as LockObject). */
// Only object types whose adt-clients handler actually implements version
// history (IAdtSourceObject) belong here. function_group, domain, data_element
// and package are IAdtNonVersionedObject — their getVersions/getVersionSource
// throw "not supported", so exposing them here advertised a capability that
// never worked. The lock switch (handleLockObject) is intentionally wider:
// those types ARE lockable, just not versioned.
export const VERSIONED_OBJECT_TYPES = VERSIONED_KINDS.onprem;

/**
 * The version members of one object, its identity bound: the history read
 * names the object the resolver was given, and a version's source is read by
 * the content URI the history answered. The values are what the version
 * result set makes of them (`resultsFor`: `objectVersions`, `asItCame`).
 */
export interface ResolvedVersionedObject {
  getVersions(options: {
    analyse: IAnalyse;
  }): Promise<IAdtResponse<IObjectVersion[]>>;
  getVersionSource(
    contentUri: string,
    options: { analyse: IAnalyse },
  ): Promise<IAdtResponse<string>>;
}

/** `obj`'s version members with `config` bound to the history read. */
function bound<C>(
  obj: IAdtVersionable<C, IObjectVersion[], string>,
  config: Partial<C>,
): ResolvedVersionedObject {
  return {
    getVersions: (options) => obj.getVersions(config, options),
    getVersionSource: (contentUri, options) =>
      obj.getVersionSource(contentUri, options),
  };
}

/**
 * Resolve an object_type + name into an IAdtObject instance and its identity
 * config. The kind is checked at the tool's boundary against the declared
 * variant's projection (`VERSIONED_KINDS`), so every kind here is served.
 *
 * @throws Error for a malformed function_module identity (missing group name).
 */
export function resolveVersionedObject(
  client: IServerAdtClient,
  objectType: VersionedKind,
  objectName: string,
  functionGroupName?: string,
): ResolvedVersionedObject {
  const name = objectName.toUpperCase();
  switch (objectType) {
    case 'class':
      return bound(client.getClass(resultsFor(classDocuments)), {
        className: name,
      });
    case 'program':
      return bound(client.getProgram(resultsFor(programDocuments)), {
        programName: name,
      });
    case 'interface':
      return bound(client.getInterface(resultsFor(interfaceDocuments)), {
        interfaceName: name,
      });
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
      return bound(
        client.getFunctionModule(resultsFor(functionModuleDocuments)),
        { functionGroupName: groupName, functionModuleName: fmName },
      );
    }
    case 'table':
      return bound(client.getTable(resultsFor(tableDocuments)), {
        tableName: name,
      });
    case 'structure':
      return bound(client.getStructure(resultsFor(structureDocuments)), {
        structureName: name,
      });
    case 'ddl':
      return bound(client.getDdl(resultsFor(ddlDocuments)), { ddlName: name });
    case 'behavior_definition':
      return bound(
        client.getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments)),
        { name },
      );
    case 'metadata_extension':
      return bound(
        client.getMetadataExtension(resultsFor(metadataExtensionDocuments)),
        { name },
      );
    case 'table_type':
      return bound(client.getTableType(resultsFor(tableTypeDocuments)), {
        tableTypeName: name,
      });
  }
}

/**
 * Unwrap a failed version answer into the throw the version tools catch.
 *
 * `getVersions`/`getVersionSource` answer `IAdtResponse`; the tools serialised
 * that envelope as it was, and a response object serialises as `{"ok":true}` —
 * every version listing answered that and nothing else (on premise, 2026-09-26).
 */
function thrown(error: IAdtError, step: string): Error {
  const failure = Object.assign(
    new Error(error.message),
    error.code !== undefined ? { code: error.code } : {},
  );
  // The method's error rides on the throw, as it is, with the step: the
  // consumer gets it, not this message (`return_error`).
  return carryingFailure(failure, error, step);
}

/**
 * The version history, as `IObjectVersion[]`. A system without the resource
 * answers 404/406; `analyseUnsupportedStatus` names that as the unsupported
 * operation the tools report (in adt-clients 22 the member threw it itself).
 */
export async function readVersions(
  resolved: ResolvedVersionedObject,
): Promise<IObjectVersion[]> {
  const answered = await resolved.getVersions({
    analyse: analyseUnsupportedStatus([404, 406], 'version history'),
  });
  if (!answered.ok) throw thrown(answered.getError(), 'read versions');
  return answered.getResult().value;
}

/** One version's source, as the text it came as. */
export async function readVersionSource(
  resolved: ResolvedVersionedObject,
  contentUri: string,
): Promise<string> {
  const answered = await resolved.getVersionSource(contentUri, {
    analyse: analyseUnsupportedStatus([404, 406], 'version source'),
  });
  if (!answered.ok) throw thrown(answered.getError(), 'read version source');
  return answered.getResult().value;
}
