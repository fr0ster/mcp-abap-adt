/**
 * LockFunctionModuleLow Handler - Lock ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().lock from @mcp-abap-adt/adt-clients 19.
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
  name: 'LockFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFG_MY_GROUP).',
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
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface LockFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockFunctionModule(
  context: HandlerContext,
  args: LockFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_module_name,
    function_group_name,
    session_id,
    session_state,
  } = args;

  if (!function_module_name || !function_group_name) {
    return return_error(
      new Error('function_module_name and function_group_name are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();

  return answer(
    { tool: 'LockFunctionModuleLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule()
        .lock({ functionModuleName, functionGroupName }),
    (lockHandle: string) => ({
      success: true,
      function_module_name: functionModuleName,
      function_group_name: functionGroupName,
      session_id: connection.getSessionId() || session_id || null,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Function module ${functionModuleName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
