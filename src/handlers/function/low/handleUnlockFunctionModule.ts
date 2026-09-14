/**
 * UnlockFunctionModuleLow Handler - Unlock ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().unlock from @mcp-abap-adt/adt-clients 19.
 *
 * `unlock()` accepts no options either — no `analyse`, and its success value
 * is `void`. There is no `AdtReading` to read a status off (unlock does not go
 * through the result-set strategies at all), so the synthetic 200 below is a
 * stand-in for "the call answered ok" rather than a status read off the wire —
 * `answer()` only reaches this projection once `ok` is already `true`.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { terseWrite } from '../../../lib/strategies/projections';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockFunctionModuleLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.',
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
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockFunctionModule operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: [
      'function_module_name',
      'function_group_name',
      'lock_handle',
      'session_id',
    ],
  },
} as const;

interface UnlockFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockFunctionModule(
  context: HandlerContext,
  args: UnlockFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_module_name,
    function_group_name,
    lock_handle,
    session_id,
    session_state,
  } = args;

  if (
    !function_module_name ||
    !function_group_name ||
    !lock_handle ||
    !session_id
  ) {
    return return_error(
      new Error(
        'function_module_name, function_group_name, lock_handle, and session_id are required',
      ),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();

  return answer(
    { tool: 'UnlockFunctionModuleLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule()
        .unlock({ functionModuleName, functionGroupName }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
