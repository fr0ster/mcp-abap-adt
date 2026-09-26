/**
 * UnlockDdlLow Handler - Unlock ABAP DDL Source
 *
 * Uses AdtClient.getDdl().unlock from @mcp-abap-adt/adt-clients 19.
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
  name: 'UnlockDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP DDL source after modification. Must use the same session_id and lock_handle from LockDdlLow operation.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockDdlLow operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockDdlLow operation. Must be the same as used in LockDdlLow.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockDdlLow (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['ddl_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockDdlArgs {
  ddl_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockDdl(
  context: HandlerContext,
  args: UnlockDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, lock_handle, session_id, session_state } = args;

  if (!ddl_name || !lock_handle || !session_id) {
    return return_error(
      new Error('ddl_name, lock_handle, and session_id are required'),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();

  return answer(
    { tool: 'UnlockDdlLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getDdl()
        .unlock({ ddlName }, lock_handle, { analyse: analyseException }),
    (value) => terseWrite(value, 200),
  );
}
