/**
 * DeleteFunctionModuleLow Handler - Delete ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().delete from @mcp-abap-adt/adt-clients 19.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFG_MY_GROUP).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface DeleteFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteFunctionModule(
  context: HandlerContext,
  args: DeleteFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const { function_module_name, function_group_name, transport_request } = args;

  if (!function_module_name || !function_group_name) {
    return return_error(
      new Error('function_module_name and function_group_name are required'),
    );
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .delete(
          {
            functionModuleName,
            functionGroupName,
            transportRequest: transport_request,
          },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
