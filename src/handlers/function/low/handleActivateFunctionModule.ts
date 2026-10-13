/**
 * ActivateFunctionModuleLow Handler - Activate ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().activate from @mcp-abap-adt/adt-clients 19.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP function module. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name.',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name.',
      },
      session_id: {
        type: 'string',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
      },
      session_state: {
        type: 'object',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface ActivateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateFunctionModule(
  context: HandlerContext,
  args: ActivateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const { function_module_name, function_group_name } = args;

  if (!function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .activate(
          { functionModuleName, functionGroupName },
          { analyse: analyseActivation },
        ),
    project(detail, terseActivation),
  );
}
