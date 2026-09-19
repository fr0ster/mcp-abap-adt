/**
 * DeleteFunctionModule Handler - Delete ABAP FunctionModule via ADT deletion
 * API
 *
 * Uses AdtClient.getFunctionModule().delete from
 * @mcp-abap-adt/adt-clients 19. See `handleDeleteDomain.ts` for the shape and
 * the masking this follows: a refusal answers 200, `analyseDeletion` reads
 * it rather than the status, and no lock is taken because a held lock is
 * what makes ADT refuse.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).',
      },
      function_group_name: {
        type: 'string',
        description:
          'FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
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
    { tool: 'DeleteFunctionModule', detail },
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
