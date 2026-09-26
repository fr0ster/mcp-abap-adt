/**
 * LockMetadataExtensionLow Handler - Lock ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().lock from @mcp-abap-adt/adt-clients 19.
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
  name: 'LockMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name (e.g., ZI_MY_DDLX).',
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
    required: ['name'],
  },
} as const;

interface LockMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockMetadataExtension(
  context: HandlerContext,
  args: LockMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();

  return answer(
    { tool: 'LockMetadataExtensionLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension()
        .lock({ name: ddlxName }, { analyse: analyseLock }),
    (lockHandle: string) => ({
      success: true,
      name: ddlxName,
      session_id: connection.getSessionId() || session_id || null,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Metadata Extension ${ddlxName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
