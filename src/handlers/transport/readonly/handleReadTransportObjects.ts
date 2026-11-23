import * as z from 'zod';
import { requiredText } from '../../../lib/handlers/argumentRules';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
/**
 * ReadTransportObjects — what a transport request or task holds.
 *
 * **This is where a `tm:position` comes from, and there is nowhere else.**
 * `RemoveTransportObject` requires one; measured against an on-premise system
 * on 2026-09-21, an entry asked for by `pgmid`/`type`/`name` alone answers
 * `200` with the usual echo document and stays on the task — twenty-two of
 * twenty-two. Without this tool a caller would have to parse a transport
 * document for the number themselves, which is the work the member exists to
 * end.
 *
 * **The entries are adt-strategies' `transportObjectEntryList`** (0.28.2):
 * each entry once, with its task and its position — a request's aggregate
 * `tm:all_objects` is not read beside its tasks' entries — and each entry
 * SAP lists without a name or a type apart, in `incompleteEntries`, answered
 * at every level with every identity field it carries. Each `detail`
 * level is the reading passed to the call: terse and medium over those
 * entries, full the parse, raw the document.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ITransportIncompleteEntry,
  type ITransportObjectEntry,
  type ITransportObjectEntryList,
  transportObjectEntryList,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  answered,
  completeAnswer,
  type DetailTable,
  formatted,
  fullLevel,
  identityOf,
  type Line,
  rawLevel,
  readingAt,
  Written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { resultsFor } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';

export const TOOL_DEFINITION = {
  name: 'ReadTransportObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Lists the objects the transport request or task named by transport_number holds, each with its `position`, which a removal of the entry names. A task answers its own entries; a request answers every task's entries, each once, with its `task` number and position — the task a removal addresses.",
  inputSchema: z.object({
    transport_number: requiredText('transport_number is required').describe(
      'Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.',
    ),
    ...DETAIL_SHAPE,
  }),
} as const;

type ReadTransportObjectsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * One entry of the terse answer: `pgmid` `R3TR` where SAP gave none, and
 * `position` `null` where SAP gave none.
 */
export interface ReadTransportEntry {
  pgmid: string;
  type: string;
  name: string;
  position: string | null;
  task?: string;
  description?: string;
  lock_status?: string;
}

/** One entry, as this tool reads it. */
interface Entry {
  name: string;
  type: string;
  pgmid?: string | undefined;
  description?: string | undefined;
  position?: string | undefined;
  lockStatus?: string | undefined;
  /** The task the entry is on, when a request was read. */
  task?: string | undefined;
}

/**
 * The entries as TSV (terse): `# transport N` and `# count`, the header
 * `type\tname\tposition`, then `# task T` and `# pgmid P` group lines before
 * the rows they hold — a removal names the task, the pgmid, the type, the
 * name and the position. Every entry is answered.
 */
/** An entry's identity in the terse rows: its type, name and position, as written. */
const entryIdentity = (entry: ITransportObjectEntry) =>
  identityOf([entry.type, entry.name, entry.position ?? '']);

/** An incomplete entry's identity: its mark and the fields it carries, as written. */
const incompleteIdentity = (entry: ITransportIncompleteEntry) =>
  identityOf(['incomplete', ...incompleteWords(entry)]);

/** An incomplete entry's words: every identity field it carries, `field=value`. */
const incompleteWords = (entry: ITransportIncompleteEntry) =>
  incompleteFields(entry).map(([field, value]) => `${field}=${value}`);

/** Every item the reading held: its entries and its incomplete entries. */
export function heldEntries(list: ITransportObjectEntryList): string[] {
  return [
    ...list.entries.map(entryIdentity),
    ...(list.incompleteEntries ?? []).map(incompleteIdentity),
  ];
}

function transportRows(
  transportNumber: string,
  list: ITransportObjectEntryList,
): Written<string> {
  const entries = list.entries;
  const incomplete = list.incompleteEntries ?? [];
  const lines: Line[] = [
    { head: 'transport', value: transportNumber },
    { head: 'count', value: String(entries.length + incomplete.length) },
    { header: ['type', 'name', 'position'] },
  ];
  let task: string | undefined;
  let pgmid: string | undefined;
  for (const entry of entries) {
    const entryTask = entry.task ?? '';
    const entryPgmid = entry.pgmid ?? 'R3TR';
    if (entryTask !== task) {
      task = entryTask;
      pgmid = undefined;
      if (entryTask !== '') lines.push({ head: 'task', value: entryTask });
    }
    if (entryPgmid !== pgmid) {
      pgmid = entryPgmid;
      lines.push({ head: 'pgmid', value: entryPgmid });
    }
    lines.push({ row: [entry.type, entry.name, entry.position ?? ''] });
  }
  // An entry SAP lists without a name or a type: a line of every identity
  // field it carries, the ones it lacks absent.
  for (const entry of incomplete) {
    lines.push({ mark: 'incomplete', words: incompleteWords(entry) });
  }
  return Written.text(lines, [0, 1, 2]);
}

/** An incomplete entry as the medium answer writes it: the fields it carries. */
interface IncompleteObject {
  task?: string;
  pgmid?: string;
  type?: string;
  name?: string;
  position?: string;
}

/** Every item the reading held, as the medium answer identifies it. */
function heldMedium(list: ITransportObjectEntryList): string[] {
  return [
    ...(list.incompleteEntries ?? []).map((entry) =>
      identityOf([
        entry.pgmid ?? '',
        entry.type ?? '',
        entry.name ?? '',
        entry.task ?? '',
      ]),
    ),
    ...list.entries.map((entry) =>
      identityOf([
        entry.pgmid ?? 'R3TR',
        entry.type,
        entry.name,
        entry.task ?? '',
      ]),
    ),
  ];
}

/** An incomplete entry's identity fields that are present, in a fixed order. */
function incompleteFields(
  entry: ITransportIncompleteEntry,
): Array<[string, string]> {
  const fields: Array<[string, string | undefined]> = [
    ['task', entry.task],
    ['pgmid', entry.pgmid],
    ['type', entry.type],
    ['name', entry.name],
    ['position', entry.position],
  ];
  return fields.flatMap(([field, value]) =>
    value === undefined || value === '' ? [] : [[field, value]],
  );
}

export async function handleReadTransportObjects(
  context: HandlerContext,
  args: ReadTransportObjectsArgs,
) {
  const { connection, logger } = context;

  const detail = detailOf(args);

  const mediumObjects = (list: ITransportObjectEntryList) => {
    const entries: readonly ITransportObjectEntry[] = list.entries;
    const incomplete = list.incompleteEntries ?? [];
    const rest = {
      success: true,
      transport_number: args.transport_number,
      count: entries.length + incomplete.length,
    };
    const objects = entries.map(
      (entry): ReadTransportEntry => ({
        pgmid: entry.pgmid ?? 'R3TR',
        type: entry.type,
        name: entry.name,
        // Optional, and said so: an entry the server described without one
        // cannot be removed, and inventing an empty string would produce a
        // call that answers 200 and removes nothing.
        position: entry.position ?? null,
        ...(entry.task ? { task: entry.task } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.lockStatus ? { lock_status: entry.lockStatus } : {}),
      }),
    );
    const incompleteObjects = incomplete.map(
      (entry): IncompleteObject => Object.fromEntries(incompleteFields(entry)),
    );
    // The items read from the rows written: the incomplete ones, then the
    // objects.
    type Row = IncompleteObject | ReadTransportEntry;
    const keys = ['pgmid', 'type', 'name', 'task'] as const;
    const incompleteRows: Row[] = incompleteObjects;
    const objectRows: Row[] = objects;
    return Written.json<typeof rest, 'incomplete_objects' | 'objects', Row>(
      rest,
      incompleteRows.length > 0
        ? { incomplete_objects: incompleteRows, objects: objectRows }
        : { objects: objectRows },
      keys,
    );
  };

  // What the entries answer at each level: the reading the slot is given,
  // selected before the call (`src/lib/detail`) — terse and medium over
  // adt-strategies' `transportObjectEntryList` (each entry once, with its
  // task and position; the incomplete ones apart, since 0.28.2), full the
  // parse, raw the document.
  // Each formatter answers every entry it was given, or nothing
  // (`completeAnswer`).
  const TOOL = 'ReadTransportObjects';
  const readings: DetailTable<
    string | XmlNode | ReturnType<typeof mediumObjects>['answer']
  > = {
    terse: formatted(
      transportObjectEntryList,
      completeAnswer(TOOL, heldEntries, (list) =>
        transportRows(args.transport_number, list),
      ),
    ),
    medium: formatted(
      transportObjectEntryList,
      completeAnswer(TOOL, heldMedium, mediumObjects),
    ),
    full: fullLevel,
    raw: rawLevel,
  };

  return answer(
    { tool: 'ReadTransportObjects', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest({
          ...resultsFor(transportDocuments),
          objects: readingAt(readings, levelOf(args)),
        })
        .readObjects(args.transport_number, { analyse: analyseException }),
    answered,
  );
}
