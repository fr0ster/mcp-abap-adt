/**
 * UnlockClass Handler - Unlock ABAP Class
 *
 * Uses AdtClient.getClass().unlock from @mcp-abap-adt/adt-clients 19.
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
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockClassLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockClass operation.',
      },
    },
    required: ['class_name', 'lock_handle'],
  },
} as const;

interface UnlockClassArgs {
  class_name: string;
  lock_handle: string;
}

export async function handleUnlockClass(
  context: HandlerContext,
  args: UnlockClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, lock_handle } = args;

  if (!class_name || !lock_handle) {
    return return_error(new Error('class_name and lock_handle are required'));
  }

  const className = class_name.toUpperCase();

  return answer(
    { tool: 'UnlockClassLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getClass()
        .unlock({ className }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
