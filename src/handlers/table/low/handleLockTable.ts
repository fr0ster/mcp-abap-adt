/**
 * LockTableLow Handler - Lock ABAP Table
 *
 * Uses AdtClient.getTable().lock from @mcp-abap-adt/adt-clients 19.
 *
 * `lock()` takes `analyseLock`: adt-clients 23 answers `''` for a 2xx that
 * names no handle and leaves the verdict to the caller; `analyseLock` refuses
 * it, with SAP's answer as `raw_body` (see `lib/strategies/lockAnswer.ts`). Its answer is the lock handle itself, and the
 * projection is the envelope the tool already returned: nothing about `lock`
 * varies with `detail`, so the parameter is not added to this tool's surface.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock a table for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
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
    },
    required: ['table_name'],
  },
} as const;

interface LockTableArgs {
  table_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockTable(
  context: HandlerContext,
  args: LockTableArgs,
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

  return answer(
    { tool: 'LockTableLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getTable()
        .lock({ tableName }, { analyse: analyseLock }),
    (lockHandle: string) => ({
      success: true,
      table_name: tableName,
      session_id: connection.getSessionId() || session_id || null,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Table ${tableName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
