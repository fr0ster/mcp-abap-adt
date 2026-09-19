/**
 * ActivateDdlLow Handler - Activate ABAP DDL Source (CDS View)
 *
 * Uses AdtClient.getDdl().activate from @mcp-abap-adt/adt-clients 19.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: DDL source. Will be useful for activating, creating, or updating a DDL source. [low-level] Activate an ABAP DDL source (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZVW_MY_VIEW).',
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
    required: ['ddl_name'],
  },
} as const;

interface ActivateDdlArgs {
  ddl_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateDdl(
  context: HandlerContext,
  args: ActivateDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, session_id, session_state } = args;

  if (!ddl_name) {
    return return_error(new Error('ddl_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateDdlLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDdl(resultsFor(ddlDocuments))
        .activate({ ddlName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
