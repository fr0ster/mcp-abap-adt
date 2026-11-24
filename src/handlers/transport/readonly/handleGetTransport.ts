import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';

/**
 * GetTransport Handler - read a transport request or a transport task.
 *
 * The request is adt-clients' `getRequest().readObjects()` (#235). SAP's one
 * handler answers both kinds of number (`CL_CTS_ADT_TM_RES_REQUEST_CONT->
 * fetch_request_data`, the same on premise and on ABAP Cloud), and the two
 * cannot be told apart by their form, so the document says which was read
 * (`kind`):
 *
 * - a request's (`tm:root/@tm:object_type` `R`, or none) carries the request
 *   in `tm:request`, with its tasks and their objects;
 * - a task's (`T`, `prepare_tm_root_for_task`) carries the task and its
 *   `tm:abap_object` entries in `tm:task`, and only the parent request's
 *   header in `tm:request`. Read as a request it answered the parent's type
 *   and target for the task with no objects (measured on premise and on the
 *   cloud, 2026-11-22), so a task is read from `tm:task`, and the parent is
 *   answered apart, as `parent_request`.
 *
 * `detail` shapes the answer as the other transport reads do. Terse is what
 * the model acts on: a request's header and its tasks as rows, without
 * objects (a task is read by its number for them); a task's header, its
 * parent's, and its objects as rows of type, name and position (the position
 * a removal names). Full is the whole parse and raw the document, for
 * debugging. `include_objects` and `include_tasks` stay, for compatibility,
 * as terse's choice to leave a task's object rows or a request's task rows
 * out (their counts stay).
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ITransportIncompleteEntry,
  type ITransportItem,
  type ITransportRequestItem,
  type ITransportTaskItem,
  transportItem,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { answer, answerCaught } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  entries,
  formatted,
  fullLevel,
  type ListDetailTable,
  rawLevel,
  readingAt,
  shownBeside,
  whole,
  writeJson,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withStep } from '../../../lib/strategies/step';
import { failed } from '../../../lib/strategies/stepResponse';
import { return_error } from '../../../lib/utils';
import type { XmlNode } from '../../../lib/xml/node';

/** A request's tasks, one entry each: what its terse answer lists. */
const REQUEST_LISTS = {
  tasks: about(
    'for each of its tasks: its number, owner, status, description and how many objects it holds',
    entries('tasks', (task: ITransportRequestItem['tasks'][number]) => ({
      number: task.header.number,
      owner: task.header.owner,
      status: task.header.status,
      description: task.header.description,
      object_count: task.objectCount,
    })),
  ),
};

/** A task's objects, one entry each: what its terse answer lists. */
const TASK_LISTS = {
  objects: about(
    'for each of its objects: its program ID, type, name and position',
    entries(
      'objects',
      (entry: ITransportTaskItem['objects'][number]): ObjectRow => ({
        pgmid: entry.pgmid,
        type: entry.type,
        name: entry.name,
        position: entry.position,
      }),
    ),
  ),
  incompleteEntries: about(
    'the objects SAP lists only in part, with what it gives of each',
    entries('incompleteEntries', incompleteRow, {
      as: 'incomplete_objects',
      omitEmpty: true,
    }),
  ),
};

export const TOOL_DEFINITION = {
  name: 'GetTransport',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads an ABAP transport or one of its tasks by its number, and says which of the two it is.',
    ),
  }),
  inputSchema: z.object({
    transport_number: z.string().describe('Transport request or task number'),
    include_objects: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        "With detail terse: list a task's objects (default: true); their count is answered either way.",
      ),
    include_tasks: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        "With detail terse: list a request's tasks (default: true); their count is answered either way.",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** A document that is not the transport asked for: fixed words, nothing of SAP's. */
export const NOT_THE_TRANSPORT_ASKED =
  'The answer is not the transport request or task asked for: its document names another number, or none.';

/** What terse answers of a document, by its kind. */
interface TerseOptions {
  readonly number: string;
  readonly includeObjects: boolean;
  readonly includeTasks: boolean;
}

/**
 * A request's terse answer: its header and its tasks as rows, each with the
 * count of its objects; no object is listed.
 */
function terseRequest(item: ITransportRequestItem, options: TerseOptions) {
  const request = item.header;
  // Every task, one row each, written from the request's own list — none
  // when the caller asked for their count alone.
  return writeJson(
    {
      success: true,
      transport_number: options.number,
      kind: 'request',
      transport: {
        number: request.number,
        description: request.description,
        type: request.type,
        status: request.status,
        owner: request.owner,
        target_system: request.target,
      },
    },
    options.includeTasks ? { tasks: item.tasks } : {},
    REQUEST_LISTS,
    { task_count: item.tasks.length },
  );
}

/** An object row of a task, written or held: pgmid, type, name and position. */
interface ObjectRow {
  pgmid?: string | undefined;
  type?: string | undefined;
  name?: string | undefined;
  position?: string | undefined;
}

/**
 * A task's terse answer: its header from `tm:task`, never the parent's, the
 * parent's header apart, and its objects as rows of pgmid, type, name and
 * position (`LIMU` or `R3TR` decides what a move or a removal addresses);
 * each entry SAP lists without a name or a type under `incomplete_objects`.
 */
function terseTask(item: ITransportTaskItem, options: TerseOptions) {
  const task = item.header;
  const parent = item.parent;
  const incompleteCount = (item.incompleteEntries ?? []).length;
  // The objects and the incomplete ones, one entry each, written from the
  // task's own lists — none when the caller asked for their count alone.
  return writeJson(
    {
      success: true,
      transport_number: options.number,
      kind: 'task',
      task: {
        number: task.number,
        parent: task.parent,
        description: task.description,
        type: task.type,
        status: task.status,
        owner: task.owner,
      },
      parent_request: {
        number: parent?.number,
        type: parent?.type,
        status: parent?.status,
        target_system: parent?.target,
      },
    },
    options.includeObjects
      ? { objects: item.objects, incompleteEntries: item.incompleteEntries }
      : {},
    TASK_LISTS,
    // Every entry SAP lists, one without a name or a type included.
    { object_count: item.objects.length + incompleteCount },
  );
}

/**
 * An entry SAP lists without a name or a type (`incompleteEntries`, 0.28.2):
 * every identity field it carries, the ones it lacks absent.
 */
function incompleteRow(entry: ITransportIncompleteEntry) {
  return {
    ...(entry.pgmid !== undefined ? { pgmid: entry.pgmid } : {}),
    ...(entry.type !== undefined ? { type: entry.type } : {}),
    ...(entry.name !== undefined ? { name: entry.name } : {}),
    ...(entry.position !== undefined ? { position: entry.position } : {}),
  };
}

/**
 * The transport asked for, as adt-strategies reads it by its number
 * (`transportItem`, 0.28.1: a task's document is the task, never its parent,
 * marked or not; a document naming another number, none, or more than one
 * element of it is not it); `undefined` when the answer is not that
 * transport.
 */
function itemOf(
  answer: IAdtWireResponse,
  number: string,
): ITransportItem | undefined {
  try {
    return transportItem(number.trim().toUpperCase())(answer);
  } catch {
    return undefined;
  }
}

/** A level's reading: the transport read by its number, and what is shown. */
interface TransportRead {
  readonly item: ITransportItem | undefined;
  readonly shown: object | XmlNode | string | undefined;
}

/**
 * What `GetTransport` answers at each `detail`: the reading passed to the
 * call, selected before it (`src/lib/detail`). Every level reads the
 * transport by its number first, so a document that is not it is refused at
 * every level; terse then answers the item's rows, medium and full the
 * parse, raw the document.
 */
function transportReadings(
  options: TerseOptions,
): ListDetailTable<TransportRead> {
  const read = (answer: IAdtWireResponse) => ({
    item: itemOf(answer, options.number),
    answer,
  });
  return {
    // Every task or object the transport holds, by the listing writer.
    terse: written(read, ({ item }) =>
      shownBeside<{ item: ITransportItem | undefined }, object>(
        { item },
        item === undefined
          ? undefined
          : item.kind === 'task'
            ? terseTask(item, options)
            : terseRequest(item, options),
      ),
    ),
    // The document's parse whole, as it is.
    medium: whole(
      formatted(read, ({ item, answer }) => ({
        item,
        shown: fullLevel(answer).value,
      })),
    ),
    full: formatted(read, ({ item, answer }) => ({
      item,
      shown: fullLevel(answer).value,
    })),
    raw: formatted(read, ({ item, answer }) => ({
      item,
      shown: rawLevel(answer).value,
    })),
  };
}

/**
 * Main handler for GetTransport MCP tool
 */
export async function handleGetTransport(
  context: HandlerContext,
  args: GetTransportArgs,
) {
  const { logger } = context;
  // A blank number is refused before any request.
  if (!args?.transport_number?.trim()) {
    return return_error('Transport number is required');
  }
  const detail = detailOf(args);
  const options: TerseOptions = {
    number: args.transport_number,
    includeObjects: args.include_objects !== false,
    includeTasks: args.include_tasks !== false,
  };
  logger?.debug(`GetTransport: ${args.transport_number}`);
  let read: IAdtResponse<AdtReading<TransportRead>, IAdtError>;
  try {
    // The request's or task's document: adt-clients' one read of either.
    read = await createAdtClient(context.connection, context.logger)
      .getRequest({
        ...resultsFor(transportDocuments),
        objects: readingAt(transportReadings(options), levelOf(args)),
      })
      .readObjects(args.transport_number, { analyse: analyseException });
  } catch (thrown) {
    return answerCaught(thrown, { tool: 'GetTransport', detail });
  }
  // The document must be the transport asked for, at every detail, before
  // anything is answered as success.
  if (read.ok && read.getResult().value.value.item === undefined) {
    return return_error(NOT_THE_TRANSPORT_ASKED);
  }
  const answered = read;
  return answer(
    { tool: 'GetTransport', detail },
    async () =>
      answered.ok
        ? answered
        : failed(withStep(answered.getError(), 'read transport request')),
    (reading: AdtReading<TransportRead>) => reading.value.shown ?? '',
  );
}
