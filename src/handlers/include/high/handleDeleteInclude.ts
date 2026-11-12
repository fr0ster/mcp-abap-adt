import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * DeleteInclude Handler - Delete an ABAP Include via the ADT deletion API
 *
 * As `DeleteProgram`: the deletion check first, the delete only if it
 * permits (`deleteIfDeletable`), no lock — a held lock is what makes ADT
 * refuse. A refusal answers 200 inside the document, which `analyseDeletion`
 * reads rather than the status. The client is the on-premise one, so a
 * connection declared otherwise is refused `variant_not_served` before
 * anything is sent.
 */

import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteInclude',
  available_in: ['onprem'] as const,
  description:
    'Deletes the ABAP include named by include_name through the ADT deletion service, after asking whether it can be deleted. Returns the deletion result.',
  inputSchema: z.object({
    include_name: z.string().describe('Include name.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable objects. Optional for local objects.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface DeleteIncludeArgs {
  include_name?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteInclude(
  context: HandlerContext,
  args: DeleteIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }

  const includeName = args.include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteInclude', detail },
    () =>
      deleteIfDeletable(
        context,
        'include',
        createOnPremAdtClient(connection, logger).getInclude(
          resultsFor(includeDocuments),
        ),
        { includeName, transportRequest: args.transport_request },
      ),
    project(detail, terseDeletion),
  );
}
