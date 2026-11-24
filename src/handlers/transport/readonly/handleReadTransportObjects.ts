import * as z from 'zod';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
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
  about,
  answered,
  type DetailTable,
  entries,
  fullLevel,
  headShape,
  type ListDetailTable,
  marks,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  shapesOf,
  type Written,
  writeJson,
  writeListing,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { resultsFor } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';

/** An incomplete entry's words: every identity field it carries, `field=value`. */
const incompleteWords = (entry: ITransportIncompleteEntry) =>
  incompleteFields(entry).map(([field, value]) => `${field}=${value}`);

/** The lists the transport objects listing writes: what its description states. */
export const TRANSPORT_OBJECTS_LISTS: RowSchemas<ITransportObjectEntryList> = {
  entries: about(
    'for each object, under its task and its program ID',
    rows('entries', {
      columns: [
        {
          name: 'type',
          means: 'its type',
          cell: (entry: ITransportObjectEntry) => entry.type,
        },
        {
          name: 'name',
          means: 'its name',
          cell: (entry: ITransportObjectEntry) => entry.name,
        },
        {
          name: 'position',
          means: 'its position, which a removal names',
          cell: (entry: ITransportObjectEntry) => entry.position ?? '',
        },
      ],
      header: 'always',
      groups: [
        {
          label: 'task',
          of: (entry: ITransportObjectEntry) => entry.task ?? '',
          mode: 'run',
          unless: '',
        },
        {
          label: 'pgmid',
          of: (entry: ITransportObjectEntry) => entry.pgmid ?? 'R3TR',
          mode: 'run',
        },
      ],
    }),
  ),
  incompleteEntries: about(
    'the objects SAP lists nameless or untyped are named by what they carry',
    marks('incompleteEntries', 'incomplete', incompleteWords),
  ),
};

/** The heads the transport objects listing opens with. */
export const TRANSPORT_OBJECTS_HEADS = [
  headShape('transport', 'transport number'),
  headShape('count', 'number of objects'),
];

export const TOOL_DEFINITION = {
  name: 'ReadTransportObjects',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the objects a transport or one of its tasks holds, each with the position a removal names.',
    ),
    returns: returnsOf({
      heads: TRANSPORT_OBJECTS_HEADS,
      of: 'the',
      shapes: [shapesOf(TRANSPORT_OBJECTS_LISTS)],
    }),
    inline: true,
  }),
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
  list: ITransportObjectEntryList,
): Written<string> {
  const incomplete = list.incompleteEntries ?? [];
  return writeListing({
    heads: [
      { head: 'transport', value: transportNumber },
      { head: 'count', value: String(list.entries.length + incomplete.length) },
    ],
    reading: list,
    lists: TRANSPORT_OBJECTS_LISTS,
  });
}

/** An incomplete entry as the medium answer writes it: the fields it carries. */
interface IncompleteObject {
  task?: string;
  pgmid?: string;
  type?: string;
  name?: string;
  position?: string;
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
    const incomplete = list.incompleteEntries ?? [];
    const rest = {
      success: true,
      transport_number: args.transport_number,
      count: list.entries.length + incomplete.length,
    };
    return writeJson(rest, list, {
      // The incomplete ones first, then the objects.
      incompleteEntries: entries(
        'incompleteEntries',
        (entry: ITransportIncompleteEntry): IncompleteObject =>
          Object.fromEntries(incompleteFields(entry)),
        { as: 'incomplete_objects', omitEmpty: true },
      ),
      entries: entries(
        'entries',
        (entry: ITransportObjectEntry): ReadTransportEntry => ({
          pgmid: entry.pgmid ?? 'R3TR',
          type: entry.type,
          name: entry.name,
          // Optional, and said so: an entry the server described without
          // one cannot be removed, and inventing an empty string would
          // produce a call that answers 200 and removes nothing.
          position: entry.position ?? null,
          ...(entry.task ? { task: entry.task } : {}),
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.lockStatus ? { lock_status: entry.lockStatus } : {}),
        }),
        { as: 'objects' },
      ),
    });
  };

  // What the entries answer at each level: the reading the slot is given,
  // selected before the call (`src/lib/detail`) — terse and medium over
  // adt-strategies' `transportObjectEntryList` (each entry once, with its
  // task and position; the incomplete ones apart, since 0.28.2), full the
  // parse, raw the document.
  // Each level writes every entry it was given, by the listing writers.
  const readings: ListDetailTable<
    string | XmlNode | ReturnType<typeof mediumObjects>['answer']
  > = {
    terse: written(transportObjectEntryList, (list) =>
      transportRows(args.transport_number, list),
    ),
    medium: written(transportObjectEntryList, mediumObjects),
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
