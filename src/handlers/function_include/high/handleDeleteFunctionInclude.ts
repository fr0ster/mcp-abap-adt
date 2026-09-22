/**
 * DeleteFunctionInclude Handler - Delete ABAP Function Group Include via ADT
 * deletion API
 *
 * Uses AdtClient.getFunctionInclude().delete from
 * @mcp-abap-adt/adt-clients 19. See `handleDeleteDomain.ts` for the shape and
 * the masking this follows: a refusal answers 200, `analyseDeletion` reads
 * it rather than the status, and no lock is taken because a held lock is
 * what makes ADT refuse. Note: the ADT backend rejects deletion of function
 * module includes (those must be deleted via the Function Builder); that
 * server message comes back the same way, as a refusal.
 */

import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteFunctionInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP function group include from the SAP system via ADT deletion API. Note: function module includes must be deleted via the Function Builder; the backend rejects such deletions. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., Z_MY_FG).',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZ_MY_FGF01).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

interface DeleteFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteFunctionInclude(
  context: HandlerContext,
  args: DeleteFunctionIncludeArgs,
) {
  const { connection, logger } = context;
  const { function_group_name, include_name, transport_request } = args;

  if (!function_group_name || !include_name) {
    return return_error(
      new Error('function_group_name and include_name are required'),
    );
  }

  const functionGroupName = function_group_name.toUpperCase();
  const includeName = include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteFunctionInclude', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionInclude(resultsFor(functionIncludeDocuments))
        .delete(
          {
            functionGroupName,
            includeName,
            transportRequest: transport_request,
          },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
