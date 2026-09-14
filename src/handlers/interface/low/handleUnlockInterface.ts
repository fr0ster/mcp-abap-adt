/**
 * UnlockInterface Handler - Unlock ABAP Interface
 *
 * Uses AdtClient.getInterface().unlock from @mcp-abap-adt/adt-clients 19.
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
  name: 'UnlockInterfaceLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Unlock an ABAP interface after modification. Must use the same session_id and lock_handle from LockInterface operation.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockInterface operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockInterface operation. Must be the same as used in LockInterface.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockInterface (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['interface_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockInterfaceArgs {
  interface_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockInterface(
  context: HandlerContext,
  args: UnlockInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, lock_handle, session_id, session_state } = args;

  if (!interface_name || !lock_handle || !session_id) {
    return return_error(
      new Error('interface_name, lock_handle, and session_id are required'),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const interfaceName = interface_name.toUpperCase();

  return answer(
    { tool: 'UnlockInterfaceLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getInterface()
        .unlock({ interfaceName }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
