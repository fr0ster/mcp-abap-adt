/**
 * CheckFunctionModuleLow Handler - Syntax check for ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().check from @mcp-abap-adt/adt-clients 19.
 *
 * `version` defaults to `'active'` when omitted — the pre-migration default,
 * kept rather than switched to the shipped member's own inactive default (see
 * `CheckClassLow`, which keeps the same 'active' default for the same
 * reason). The shipped `checkFunctionModule(connection, group, module,
 * version, undefined, contentTypes)` hardcodes its source argument to
 * `undefined`, so no source is ever forwarded, matching the pre-migration
 * tool schema (which has no `source_code` parameter). Verified against
 * `AdtFunctionModule.js`.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckFunctionModuleLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_FUGR_TEST_0001)',
      },
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_TEST_FM)',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active",
        enum: ['active', 'inactive'],
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

interface CheckFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckFunctionModule(
  context: HandlerContext,
  args: CheckFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_group_name,
    function_module_name,
    version,
    session_id,
    session_state,
  } = args;

  if (!function_group_name || !function_module_name) {
    return return_error(
      new Error('function_group_name and function_module_name are required'),
    );
  }

  const checkVersion =
    version && ['active', 'inactive'].includes(version.toLowerCase())
      ? (version.toLowerCase() as 'active' | 'inactive')
      : 'active';

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionGroupName = function_group_name.toUpperCase();
  const functionModuleName = function_module_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .check({ functionModuleName, functionGroupName }, checkVersion, {
          analyse: analyseCheck,
        }),
    project(detail, terseCheck),
  );
}
