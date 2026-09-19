/**
 * UnlockProgramLow Handler - Unlock ABAP Program
 *
 * Uses AdtClient.getProgram().unlock from @mcp-abap-adt/adt-clients 19.
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
import {
  isCloudConnection,
  restoreSessionInConnection,
  return_error,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Unlock an ABAP program after modification. Must use the same session_id and lock_handle from LockProgram operation.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockProgram operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockProgram operation. Must be the same as used in LockProgram.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockProgram (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['program_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockProgramArgs {
  program_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockProgram(
  context: HandlerContext,
  args: UnlockProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, lock_handle, session_id, session_state } = args;

  if (!program_name || !lock_handle || !session_id) {
    return return_error(
      new Error('program_name, lock_handle, and session_id are required'),
    );
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const programName = program_name.toUpperCase();

  return answer(
    { tool: 'UnlockProgramLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getProgram()
        .unlock({ programName }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
