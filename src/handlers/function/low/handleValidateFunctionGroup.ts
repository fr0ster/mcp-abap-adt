/**
 * ValidateFunctionGroupLow Handler - Validate ABAP Function Group Name
 *
 * Uses AdtClient.getFunctionGroup().validate from @mcp-abap-adt/adt-clients 19.
 *
 * `packageName` and `description` both reach the wire: the shipped
 * `validateFunctionGroupName(connection, config.functionGroupName,
 * config.packageName, config.description)` reads all three. `description` is
 * optional on this tool (unlike its sibling families' Validate tools) and
 * falls back to the function group name when omitted, preserving the
 * pre-migration default — the endpoint requires a non-empty description.
 * Verified against `AdtFunctionGroup.js`.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateFunctionGroupLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name to validate (e.g., Z_MY_PROGRAM).',
      },
      package_name: {
        type: 'string',
        description: 'Package name for validation (optional but recommended).',
      },
      description: {
        type: 'string',
        description:
          'Optional description for validation. Defaults to the function group name when omitted — the endpoint requires a non-empty description.',
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
    required: ['function_group_name'],
  },
} as const;

interface ValidateFunctionGroupArgs {
  function_group_name: string;
  package_name?: string;
  description?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateFunctionGroup(
  context: HandlerContext,
  args: ValidateFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const {
    function_group_name,
    package_name,
    description,
    session_id,
    session_state,
  } = args;

  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionGroupName = function_group_name.toUpperCase();
  const validationDescription = description || functionGroupName;
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateFunctionGroupLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionGroup(resultsFor(functionGroupDocuments))
        .validate(
          {
            functionGroupName,
            packageName: package_name?.toUpperCase(),
            description: validationDescription,
          },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
