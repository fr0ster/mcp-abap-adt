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
 * **The entries are adt-strategies' `transportObjectEntries`** (0.28.0):
 * each entry once, with its task and its position — a request's aggregate
 * `tm:all_objects` is not read beside its tasks' entries. Each `detail`
 * level is the reading passed to the call: terse and medium over those
 * entries, full the parse, raw the document.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ITransportObjectEntry,
  transportObjectEntries,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
  tsv,
  tsvRow,
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
function transportRows(
  transportNumber: string,
  entries: readonly ITransportObjectEntry[],
): string {
  const lines = [
    `# transport ${transportNumber}`,
    `# count ${entries.length}`,
    tsv(['type', 'name', 'position'], []),
  ];
  let task: string | undefined;
  let pgmid: string | undefined;
  for (const entry of entries) {
    const entryTask = entry.task ?? '';
    const entryPgmid = entry.pgmid ?? 'R3TR';
    if (entryTask !== task) {
      task = entryTask;
      pgmid = undefined;
      if (entryTask !== '') lines.push(`# task ${entryTask}`);
    }
    if (entryPgmid !== pgmid) {
      pgmid = entryPgmid;
      lines.push(`# pgmid ${entryPgmid}`);
    }
    lines.push(tsvRow([entry.type, entry.name, entry.position ?? '']));
  }
  return lines.join('\n');
}

export async function handleReadTransportObjects(
  context: HandlerContext,
  args: ReadTransportObjectsArgs,
) {
  const { connection, logger } = context;

  const detail = detailOf(args);

  const terseObjects = (entries: readonly ITransportObjectEntry[]) => {
    return {
      success: true,
      transport_number: args.transport_number,
      count: entries.length,
      objects: entries.map(
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
      ),
    };
  };

  // What the entries answer at each level: the reading the slot is given,
  // selected before the call (`src/lib/detail`) — terse and medium over
  // adt-strategies' `transportObjectEntries` (each entry once, with its task
  // and position, since 0.28.0), full the parse, raw the document.
  const readings: DetailTable<
    string | XmlNode | ReturnType<typeof terseObjects>
  > = {
    terse: formatted(transportObjectEntries, (entries) =>
      transportRows(args.transport_number, entries),
    ),
    medium: formatted(transportObjectEntries, terseObjects),
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
