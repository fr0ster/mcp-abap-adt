/**
 * LockDdlLow Handler - Lock ABAP DDL Source
 *
 * Uses AdtClient.getDdl().lock from @mcp-abap-adt/adt-clients 19.
 *
 * `lock()` accepts no options at all — not even `analyse` — so there is no
 * strategy to inject here. Its answer is the lock handle itself, and the
 * projection is the envelope the tool already returned: nothing about `lock`
 * varies with `detail`, so the parameter is not added to this tool's surface.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Lock a DDL source for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_PROGRAM).',
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
    required: ['ddl_name'],
  },
} as const;

interface LockDdlArgs {
  ddl_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockDdl(
  context: HandlerContext,
  args: LockDdlArgs,
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

  return answer(
    { tool: 'LockDdlLow', detail: 'terse' },
    () => createAdtClient(connection, logger).getDdl().lock({ ddlName }),
    (lockHandle: string) => ({
      success: true,
      ddl_name: ddlName,
      session_id: connection.getSessionId() || session_id || null,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `DDL source ${ddlName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
