/**
 * UnlockMetadataExtensionLow Handler - Unlock ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().unlock from @mcp-abap-adt/adt-clients 19.
 *
 * `unlock()` takes `analyseException` too (adt-clients 23), and its success
 * value is SAP's reply, read by nothing. There is no `AdtReading` to read a status off (unlock does not go
 * through the result-set strategies at all), so the synthetic 200 below is a
 * stand-in for "the call answered ok" rather than a status read off the wire —
 * `answer()` only reaches this projection once `ok` is already `true`.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { terseWrite } from '../../../lib/strategies/projections';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP metadata extension after modification. Must use the same session_id and lock_handle from LockMetadataExtensionLow operation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name (e.g., ZI_MY_DDLX).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockMetadataExtensionLow operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockMetadataExtensionLow operation. Must be the same as used in LockMetadataExtensionLow.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockMetadataExtensionLow (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockMetadataExtensionArgs {
  name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockMetadataExtension(
  context: HandlerContext,
  args: UnlockMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, lock_handle, session_id, session_state } = args;

  if (!name || !lock_handle || !session_id) {
    return return_error(
      new Error('name, lock_handle, and session_id are required'),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();

  return answer(
    { tool: 'UnlockMetadataExtensionLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension()
        .unlock({ name: ddlxName }, lock_handle, { analyse: analyseException }),
    (value) => terseWrite(value, 200),
  );
}
