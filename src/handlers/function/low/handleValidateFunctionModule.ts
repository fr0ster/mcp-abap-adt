/**
 * ValidateFunctionModuleLow Handler - Validate ABAP Function Module Name
 *
 * Uses AdtClient.getFunctionModule().validate from @mcp-abap-adt/adt-clients 19.
 *
 * No `package_name` parameter exists on this tool, and none reaches the wire:
 * the shipped `validateFunctionModuleName(connection, group, module,
 * config.description)` takes three positional arguments plus a description —
 * no package at all. Verified against `AdtFunctionModule.js`.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_FUGR_TEST_0001)',
      },
      function_module_name: {
        type: 'string',
        description: 'Function module name to validate (e.g., Z_TEST_FM)',
      },
      description: {
        type: 'string',
        description: 'Optional description for validation',
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
    required: ['function_group_name', 'function_module_name'],
  },
} as const;

interface ValidateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  description?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateFunctionModule(
  context: HandlerContext,
  args: ValidateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_group_name,
    function_module_name,
    description,
    session_id,
    session_state,
  } = args;

  if (!function_group_name || !function_module_name) {
    return return_error(
      new Error('function_group_name and function_module_name are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionGroupName = function_group_name.toUpperCase();
  const functionModuleName = function_module_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .validate(
          { functionModuleName, functionGroupName, description },
          { analyse: analyseException },
        ),
    project(detail, terseValidation),
  );
}
