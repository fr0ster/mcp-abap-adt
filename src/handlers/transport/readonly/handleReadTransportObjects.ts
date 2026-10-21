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
 * **The slot is stamped, not kept, and that is a deliberate reversal.** The
 * shipped reading answers the entries already parsed, which is what a
 * consumer of the library wants — but it answers them *instead of* an
 * `AdtReading`, so there is no document left for `detail: 'raw'` to give and
 * no status to carry. Keeping it would buy a parse we can do in eight lines
 * and cost a caller the raw answer, which is the one thing they cannot
 * reconstruct.
 *
 * So `structured` stamps the slot like its neighbours, and the entries are
 * read out of the parsed document here. That is this repository's half of the
 * split: the package answers a consumer-agnostic reading, and shaping it for
 * an LLM — positions promoted, nulls where the server said nothing — belongs
 * on this side.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadTransportObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Lists the objects the transport request or task named by transport_number holds, each with its `position`, which a removal of the entry names. A task answers its own entries; a request answers every task's entries, each once, with its `task` number and position — the task a removal addresses.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description:
          'Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number'],
  },
} as const;

interface ReadTransportObjectsArgs {
  transport_number: string;
  detail?: 'terse' | 'full' | 'raw';
}

/** One entry, as this tool answers it. */
interface Entry {
  name: string;
  type: string;
  pgmid?: string;
  description?: string;
  position?: string;
  lockStatus?: string;
  /** The task the entry is on, when a request was read. */
  task?: string;
}

/**
 * Every `tm:abap_object` in the parsed document, with the task it is on.
 *
 * A walk rather than a path: a task document holds its objects on
 * `tm:root/tm:task`, a request document on each `tm:request/tm:task`, and a
 * user action echoes one under `tm:request`. **A request document also
 * carries `tm:all_objects`** — the request's aggregate list, every object
 * once more beside its task's entry (measured: 342 there and 342 on the one
 * task, read twice as 684) — so that subtree is not collected: a request's
 * objects are its tasks' entries, each once, each with its task number.
 */
function collect(
  node: unknown,
  found: { attributes: Record<string, string>; task?: string }[],
  task?: string,
  inRequest = false,
): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found, task, inRequest);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '@' || key === 'tm:all_objects') continue;
    if (key === 'tm:abap_object') {
      for (const entry of Array.isArray(value) ? value : [value]) {
        const attributes = (entry as { '@'?: Record<string, string> })?.['@'];
        if (attributes) found.push({ attributes, task });
      }
      continue;
    }
    if (key === 'tm:task' && inRequest) {
      // A task of the request: its entries carry its number.
      for (const child of Array.isArray(value) ? value : [value]) {
        const number = (child as { '@'?: Record<string, string> })?.['@']?.[
          'tm:number'
        ];
        collect(child, found, text(number), false);
      }
      continue;
    }
    collect(value, found, task, key === 'tm:request');
  }
}

const text = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

function entriesOf(value: unknown): Entry[] {
  const found: { attributes: Record<string, string>; task?: string }[] = [];
  collect(value, found);
  const entries: Entry[] = [];
  for (const { attributes, task } of found) {
    const name = text(attributes['tm:name']);
    const type = text(attributes['tm:type']);
    // Nothing can be done with a nameless entry, and a caller counting
    // objects should not count a hole.
    if (name === undefined || type === undefined) continue;
    entries.push({
      name,
      type,
      pgmid: text(attributes['tm:pgmid']),
      description: text(attributes['tm:obj_desc']),
      position: text(attributes['tm:position']),
      lockStatus: text(attributes['tm:lock_status']),
      task,
    });
  }
  return entries;
}

export async function handleReadTransportObjects(
  context: HandlerContext,
  args: ReadTransportObjectsArgs,
) {
  const { connection, logger } = context;

  if (!args?.transport_number) {
    return return_error(new Error('transport_number is required'));
  }

  const detail = detailOf(args);

  const terseObjects: Terse<unknown> = (value) => {
    const entries = entriesOf(value);
    return {
      success: true,
      transport_number: args.transport_number,
      count: entries.length,
      objects: entries.map((entry) => ({
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
      })),
    };
  };

  return answer(
    { tool: 'ReadTransportObjects', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .readObjects(args.transport_number, { analyse: analyseException }),
    project(detail, terseObjects),
  );
}
