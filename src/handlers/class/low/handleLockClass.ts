/**
 * LockClass Handler - Lock ABAP Class
 *
 * Uses AdtClient.getClass().lock from @mcp-abap-adt/adt-clients 19.
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
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP class for modification. Uses session from HandlerContext. Returns lock handle that must be used in subsequent update/unlock operations.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
    },
    required: ['class_name'],
  },
} as const;

interface LockClassArgs {
  class_name: string;
}

export async function handleLockClass(
  context: HandlerContext,
  args: LockClassArgs,
) {
  const { connection, logger } = context;
  const { class_name } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = class_name.toUpperCase();

  return answer(
    { tool: 'LockClassLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getClass()
        .lock({ className }, { analyse: analyseLock }),
    (lockHandle: string) => ({
      success: true,
      class_name: className,
      lock_handle: lockHandle,
      message: `Class ${className} locked successfully. Use this lock_handle for subsequent update/unlock operations.`,
    }),
  );
}
