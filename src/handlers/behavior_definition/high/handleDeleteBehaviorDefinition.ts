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
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['behavior_definition_name'],
  },
} as const;

interface DeleteBehaviorDefinitionArgs {
  behavior_definition_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
        createAdtClient(connection, logger).getBehaviorDefinition(
          resultsFor(behaviorDefinitionDocuments),
        ),
        { name, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
