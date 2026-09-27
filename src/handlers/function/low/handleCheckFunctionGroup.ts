/**
 * CheckFunctionGroupLow Handler - Syntax check for ABAP Function Group
 *
 * Uses AdtClient.getFunctionGroup().check from @mcp-abap-adt/adt-clients 19.
 *
 * No `version` parameter exists on this tool, so `status` is always
 * `undefined`. The shipped `check(config, status, options)` reads `status
 * === 'active' ? 'active' : 'inactive'`, so an omitted status checks the
 * inactive version. Verified against `AdtFunctionGroup.js`.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckFunctionGroupLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name (e.g., Z_MY_PROGRAM).',
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
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name'],
  },
} as const;

interface CheckFunctionGroupArgs {
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckFunctionGroup(
  context: HandlerContext,
  args: CheckFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const { function_group_name, session_id, session_state } = args;

  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckFunctionGroupLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionGroup(resultsFor(functionGroupDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, and there is no `version` parameter on this tool to say
        // otherwise.
        .check({ functionGroupName }, args.version, {
          analyse: analyseException,
        }),
    project(detail, terseCheck),
  );
}
