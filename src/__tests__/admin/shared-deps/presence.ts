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

export type PresenceState = 'present' | 'absent' | 'unreadable';

export interface PresenceResult {
  section: string;
  name: string;
  state: PresenceState;
  /** unreadable only: safe facts (HTTP status, failure code), never a message */
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

/** A failure code is kept only when it has the shape of a constant. */
function safeCode(code: unknown): string | undefined {
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,48}$/.test(code)
    ? code
    : undefined;
}

/**
 * What a read said about the object. `absent` only when SAP answered that it
 * is not there (a response with status 404, whatever its origin: the library
 * files a transport-refused status under 'connection'); any other refusal — 401, 5xx, no answer
 * at all — says nothing about the object and is `unreadable`, with the status
 * and code it carried and none of its text.
 */
export function classifyRead(answer: any): {
  state: PresenceState;
  detail?: string;
} {
  if (answer?.ok === true) return { state: 'present' };
  let error: any;
  try {
    error = answer?.getError?.();
  } catch {
    error = undefined;
  }
  const status = error?.response?.status;
  if (status === 404) return { state: 'absent' };
  const facts: string[] = [];
  if (Number.isInteger(status)) facts.push(`HTTP ${status}`);
  const code = safeCode(error?.code);
  if (code) facts.push(code);
  if (!error?.response) facts.push('no answer');
  return {
    state: 'unreadable',
    detail: facts.length ? facts.join(', ') : 'refused',
  };
}

/**
 * Reads every shared name of every section the system offers it for.
 * Reads only: nothing is created either way.
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
        results.push({
          section,
          name: item.name,
          ...classifyRead(await read(client, item)),
        });
      } catch (error: any) {
        // A throw says nothing about the object. Its code, never its message.
        const code = safeCode(error?.code);
        results.push({
          section,
          name: item.name,
          state: 'unreadable',
          detail: code ?? 'thrown',
        });
      }
    }
  }
  return results;
}

export interface PresenceReport {
  present: string[];
  absent: string[];
  unreadable: string[];
  /** The two groups apart; empty when every object is present */
  message: string;
}

/** Turns per-name read results into the present / absent / unreadable report. */
export function presenceReport(
  results: ReadonlyArray<PresenceResult>,
): PresenceReport {
  const label = (r: PresenceResult) => `${r.section}: ${r.name}`;
  const of = (state: PresenceState) => results.filter((r) => r.state === state);
  const present = of('present').map(label);
  const absentR = of('absent');
  const unreadableR = of('unreadable');
  const parts: string[] = [];
  if (absentR.length > 0) {
    parts.push(
      `absent on the system (${absentR.length} of ${results.length}):\n  ${absentR.map(label).join('\n  ')}`,
    );
  }
  if (unreadableR.length > 0) {
    parts.push(
      `could not be read (${unreadableR.length} of ${results.length}), so their presence is unknown:\n  ${unreadableR
        .map((r) => `${label(r)} (${r.detail ?? 'refused'})`)
        .join('\n  ')}`,
    );
  }
  return {
    present,
    absent: absentR.map(label),
    unreadable: unreadableR.map(label),
    message: parts.join('\n'),
  };
}
