/**
 * UpdateTableLow Handler - Update ABAP Table DDL Source
 *
 * Uses AdtClient.getTable().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.source`.** `AdtTable.update()`'s
 * shipped body does keep a fallback — `const source = options?.source ||
 * config.source` — but this handler writes through `options` only, the one
 * channel every sibling family in this cluster shares, and never puts a
 * source string on `config`. Verified against `AdtTable.js`, not the
 * declaration file.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description:
          'Table name (e.g., ZOK_T_TEST_0001). Table must already exist.',
      },
      ddl_code: {
        type: 'string',
        description: 'Complete DDL source code for the table definition.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
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
    required: ['table_name', 'ddl_code', 'lock_handle'],
  },
} as const;

interface UpdateTableArgs {
  table_name: string;
  ddl_code: string;
  lock_handle: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateTable(
  context: HandlerContext,
  args: UpdateTableArgs,
) {
  const { connection, logger } = context;
  const {
    table_name,
    ddl_code,
    lock_handle,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!table_name || !ddl_code || !lock_handle) {
    return return_error(
      new Error('table_name, ddl_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const tableName = table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateTableLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .update(
          { tableName, transportRequest: transport_request },
          {
            source: ddl_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
