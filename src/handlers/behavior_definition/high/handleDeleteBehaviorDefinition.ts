import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * DeleteBehaviorDefinition Handler - Delete ABAP BehaviorDefinition via ADT
 * deletion API
 *
 * Uses AdtClient.getBehaviorDefinition().delete from
 * @mcp-abap-adt/adt-clients 19. See `handleDeleteDomain.ts` for the shape and
 * the masking this follows: a refusal answers 200, `analyseDeletion` reads
 * it rather than the status, and no lock is taken because a held lock is
 * what makes ADT refuse.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for local objects.',
  inputSchema: z.object({
    behavior_definition_name: z.string().describe('BehaviorDefinition name.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable objects. Optional for local objects.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type DeleteBehaviorDefinitionArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleDeleteBehaviorDefinition(
  context: HandlerContext,
  args: DeleteBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { behavior_definition_name, transport_request } = args;

  if (!behavior_definition_name) {
    return return_error(new Error('behavior_definition_name is required'));
  }

  const name = behavior_definition_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteBehaviorDefinition', detail },
    () =>
      deleteIfDeletable(
        context,
        'behaviorDefinition',
        createAdtClient(connection, logger).getBehaviorDefinition(
          resultsFor(behaviorDefinitionDocuments),
        ),
        { name, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
