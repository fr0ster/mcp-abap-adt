/**
 * ValidateDdlLow Handler - Validate ABAP DDL Source Name
 *
 * Uses AdtClient.getDdl().validate from @mcp-abap-adt/adt-clients 19.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP DDL source name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name to validate (e.g., Z_MY_PROGRAM).',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'DDL source description. Required for validation.',
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
    required: ['ddl_name', 'package_name', 'description'],
  },
} as const;

interface ValidateDdlArgs {
  ddl_name: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateDdl(
  context: HandlerContext,
  args: ValidateDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, description, package_name, session_id, session_state } =
    args;

  if (!ddl_name || !package_name || !description) {
    return return_error(
      new Error('ddl_name, package_name, and description are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateDdlLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDdl(resultsFor(ddlDocuments))
        .validate(
          {
            ddlName,
            description,
            packageName: package_name.toUpperCase(),
          },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
