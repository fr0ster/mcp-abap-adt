/**
 * DeleteBehaviorDefinition Handler - Delete ABAP Behavior Definition
 *
 * Uses AdtClient.getBehaviorDefinition().delete from @mcp-abap-adt/adt-clients 19.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., ZI_MY_BDEF).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface DeleteBehaviorDefinitionArgs {
  name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteBehaviorDefinition(
  context: HandlerContext,
  args: DeleteBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name, transport_request } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteBehaviorDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .delete(
          { name: bdefName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
