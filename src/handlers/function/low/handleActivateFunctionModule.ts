/**
 * ActivateFunctionModuleLow Handler - Activate ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().activate from @mcp-abap-adt/adt-clients 19.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateFunctionModuleLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: FunctionModule. Will be useful for activating, creating, or updating function module. [low-level] Activate an ABAP function module. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_FM_TEST).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_FG_TEST).',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
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
  const {
    function_module_name,
    function_group_name,
    session_id,
    session_state,
  } = args;

  if (!function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
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
          { analyse: ourActivation },
        ),
    project(detail, terseActivation),
  );
}
