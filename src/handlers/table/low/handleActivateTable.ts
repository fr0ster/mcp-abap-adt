/**
 * ActivateTableLow Handler - Activate ABAP Table
 *
 * Uses AdtClient.getTable().activate from @mcp-abap-adt/adt-clients 19.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Table. Will be useful for activating, creating, or updating a table. [low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., ZT_MY_TABLE).',
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
    required: ['table_name'],
  },
} as const;

interface ActivateTableArgs {
  table_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateTable(
  context: HandlerContext,
  args: ActivateTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, session_id, session_state } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const tableName = table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateTableLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .activate({ tableName }, { analyse: ourActivation }),
    project(detail, terseActivation),
  );
}
