/**
 * LockBehaviorImplementation Handler - Lock ABAP Behavior Implementation Class
 *
 * Uses AdtClient.getBehaviorImplementation().lock from
 * @mcp-abap-adt/adt-clients 19. A behavior implementation *is* a class, and
 * `AdtBehaviorImplementation.lock()` delegates to the class's own lock — but
 * it is reached through `getBehaviorImplementation`, not `getClass`, so a
 * swap between the two families stays visible (see the low-tier strategy
 * test: both answer through `classDocuments` and are otherwise
 * indistinguishable to the compiler).
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
  name: 'LockBehaviorImplementationLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP behavior implementation class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY).',
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
    required: ['class_name'],
  },
} as const;

interface LockBehaviorImplementationArgs {
  class_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockBehaviorImplementation(
  context: HandlerContext,
  args: LockBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  const { class_name, session_id, session_state } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();

  return answer(
    { tool: 'LockBehaviorImplementationLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorImplementation()
        .lock({ className }, { analyse: analyseLock }),
    (lockHandle: string) => ({
      success: true,
      class_name: className,
      lock_handle: lockHandle,
      session_id: connection.getSessionId() || session_id || null,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Behavior Implementation ${className} locked successfully. Use lock_handle in subsequent update/unlock operations.`,
    }),
  );
}
