import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SortAndCompressTransportTask',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      purpose: purpose(
        'Sorts the objects of a transport task and merges its duplicates.',
      ),
    }),
  ),
  inputSchema: z.object({
    transport_number: z
      .string()
      .describe('Number of the transport task to sort and compress.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type SortAndCompressTransportTaskArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

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
  const terseSort = () => transportSort(args.transport_number);

  return answer(
    { tool: 'SortAndCompressTransportTask', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .sortAndCompress(args.transport_number, { analyse: analyseException }),
    project(detail, terseSort),
  );
}

/** What a sort answers: SAP took it, the task, and where to confirm it. */
export function transportSort(transportNumber: string) {
  return {
    accepted: true,
    transport_number: transportNumber,
    confirm_with: `ReadTransportObjects on ${transportNumber} — this answer only says the request was understood; it carries no object list.`,
  };
}
