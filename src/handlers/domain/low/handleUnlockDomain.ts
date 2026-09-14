/**
 * UnlockDomain Handler - Unlock ABAP Domain
 *
 * Uses AdtClient.getDomain().unlock from @mcp-abap-adt/adt-clients 19.
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
  name: 'UnlockDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockDomain operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockDomain operation. Must be the same as used in LockDomain.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['domain_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockDomainArgs {
  domain_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockDomain(
  context: HandlerContext,
  args: UnlockDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, lock_handle, session_id, session_state } = args;

  if (!domain_name || !lock_handle || !session_id) {
    return return_error(
      new Error('domain_name, lock_handle, and session_id are required'),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const domainName = domain_name.toUpperCase();

  return answer(
    { tool: 'UnlockDomainLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getDomain()
        .unlock({ domainName }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
