/**
 * UnlockStructureLow Handler - Unlock ABAP Structure
 *
 * Uses AdtClient.getStructure().unlock from @mcp-abap-adt/adt-clients 19.
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
  name: 'UnlockStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructureLow operation.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockStructureLow operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockStructureLow operation. Must be the same as used in LockStructureLow.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockStructureLow (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['structure_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockStructureArgs {
  structure_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockStructure(
  context: HandlerContext,
  args: UnlockStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, lock_handle, session_id, session_state } = args;

  if (!structure_name || !lock_handle || !session_id) {
    return return_error(
      new Error('structure_name, lock_handle, and session_id are required'),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const structureName = structure_name.toUpperCase();

  return answer(
    { tool: 'UnlockStructureLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getStructure()
        .unlock({ structureName }, lock_handle, { analyse: analyseException }),
    (value) => terseWrite(value, 200),
  );
}
