/**
 * What `npm run shared:check` reads: one read per shared name, through its
 * type's read, and the report of what came back. Reads only — nothing here
 * creates, updates, locks, deletes or activates.
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';

/** One shared object as `shared_dependencies.<section>` lists it. */
export interface SharedItem {
  name: string;
  /** function_modules only: the group the module lives in */
  group?: string;
  available_in?: string[];
}

export interface PresenceResult {
  section: string;
  name: string;
  present: boolean;
  /** Why the read said absent when it threw rather than answered */
  detail?: string;
}

type Read = (client: AdtClient, item: SharedItem) => Promise<any>;

const options = { analyse: analyseException };

/**
 * The read per section — the one setup's existence probe uses where it has a
 * read, the object's own read otherwise. A function group, a domain and a
 * data element carry a document, not a source: `readMetadata`.
 */
export const SHARED_READS: Record<string, Read> = {
  tables: (c, i) =>
    c.getTable().read({ tableName: i.name }, undefined, options),
  structures: (c, i) =>
    c.getStructure().read({ structureName: i.name }, undefined, options),
  append_structures: (c, i) =>
    c
      .getAppendStructure()
      .read({ appendStructureName: i.name }, undefined, options),
  views: (c, i) => c.getDdl().read({ ddlName: i.name }, undefined, options),
  behavior_definitions: (c, i) =>
    c.getBehaviorDefinition().read({ name: i.name }, undefined, options),
  classes: (c, i) =>
    c.getClass().read({ className: i.name }, undefined, options),
  function_groups: (c, i) =>
    c.getFunctionGroup().readMetadata({ functionGroupName: i.name }, options),
  function_modules: (c, i) =>
    c.getFunctionModule().read(
      {
        functionModuleName: i.name,
        functionGroupName: i.group,
      } as any,
      undefined,
      options,
    ),
  service_definitions: (c, i) =>
    c
      .getServiceDefinition()
      .read({ serviceDefinitionName: i.name }, undefined, options),
  domains: (c, i) =>
    c.getDomain().readMetadata({ domainName: i.name }, options),
  data_elements: (c, i) =>
    c.getDataElement().readMetadata({ dataElementName: i.name }, options),
  interfaces: (c, i) =>
    c.getInterface().read({ interfaceName: i.name }, undefined, options),
  programs: (c, i) =>
    c.getProgram().read({ programName: i.name }, undefined, options),
  metadata_extensions: (c, i) =>
    c.getMetadataExtension().read({ name: i.name }, undefined, options),
};

/** Sections in the order the report lists them */
export const SHARED_SECTIONS = Object.keys(SHARED_READS);

/**
 * Reads every shared name of every section the system offers it for. An
 * answer that is not ok, or a throw, is absent: nothing is created either way.
 */
export async function readShared(
  client: AdtClient,
  sharedConfig: Record<string, unknown>,
  availableHere: (availableIn?: string[]) => boolean,
): Promise<PresenceResult[]> {
  const results: PresenceResult[] = [];
  for (const section of SHARED_SECTIONS) {
    const items = sharedConfig[section];
    if (!Array.isArray(items)) continue;
    const read = SHARED_READS[section] as Read;
    for (const item of items as SharedItem[]) {
      if (!availableHere(item.available_in)) continue;
      try {
        const answer = await read(client, item);
        results.push({
          section,
          name: item.name,
          present: answer?.ok === true,
        });
      } catch (error: any) {
        results.push({
          section,
          name: item.name,
          present: false,
          detail: String(error?.message ?? error).substring(0, 200),
        });
      }
    }
  }
  return results;
}

export interface PresenceReport {
  present: string[];
  absent: string[];
  /** One line per absent object; empty when all are present */
  message: string;
}

/** Turns per-name read results into the present / absent report. */
export function presenceReport(
  results: ReadonlyArray<PresenceResult>,
): PresenceReport {
  const label = (r: PresenceResult) => `${r.section}: ${r.name}`;
  const present = results.filter((r) => r.present).map(label);
  const missing = results.filter((r) => !r.present);
  const absent = missing.map(label);
  const message =
    missing.length === 0
      ? ''
      : `${missing.length} of ${results.length} shared objects are absent on the system:\n  ${missing
          .map((r) => (r.detail ? `${label(r)} (${r.detail})` : label(r)))
          .join('\n  ')}`;
  return { present, absent, message };
}
