/**
 * SortAndCompressTransportTask — the transport organizer's *Sort and
 * compress* on one task (adt-clients 30.0.0, `sortAndCompress`).
 *
 * **Why this exists.** A task that holds the same entry twice refuses
 * `RemoveTransportObject` with `SCTS_ADT_MSG 009`, long text TR292 ("Object
 * entry exists more than once; sort and compress first"), until its list has
 * been sorted and compressed.
 *
 * **What the answer is worth.** Measured on premise (BASIS 816, 2026-10-12):
 * `200` with an empty body — for a task of 161 entries with four held twice,
 * which re-read as 157, and the same for an empty task. The answer carries no
 * list, so it is not evidence of anything but acceptance; `ReadTransportObjects`
 * on the task is, and the answer below says so rather than reporting a
 * success nobody measured — as `RemoveTransportObject` does.
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
  name: 'SortAndCompressTransportTask',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Sort a transport task's object list and merge its duplicate entries. A task holding the same entry twice refuses RemoveTransportObject until this has run.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description: 'Number of the transport task to sort and compress.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number'],
  },
} as const;

interface SortAndCompressTransportTaskArgs {
  transport_number: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleSortAndCompressTransportTask(
  context: HandlerContext,
  args: SortAndCompressTransportTaskArgs,
) {
  const { connection, logger } = context;

  if (!args?.transport_number) {
    return return_error('transport_number is required');
  }

  const detail = detailOf(args);

  // No `success`, for the reason `RemoveTransportObject` gives: the answer is
  // an empty `200` and says nothing about the list, so `success` would claim
  // what nobody measured. `accepted` and the re-read that settles it instead.
  const terseSort: Terse<unknown> = () => ({
    accepted: true,
    transport_number: args.transport_number,
    confirm_with: `ReadTransportObjects on ${args.transport_number} — this answer only says the request was understood; it carries no object list.`,
  });

  return answer(
    { tool: 'SortAndCompressTransportTask', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .sortAndCompress(args.transport_number, { analyse: analyseException }),
    project(detail, terseSort),
  );
}
