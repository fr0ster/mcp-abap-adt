/**
 * UnlockPackage Handler - Unlock ABAP Package
 *
 * Uses AdtClient.getPackage().unlock from @mcp-abap-adt/adt-clients 19.
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
  name: 'UnlockPackageLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_TEST_0002). Package must already exist.',
      },
      super_package: {
        type: 'string',
        description:
          'Does not reach the unlock endpoint — the shipped unlockPackage() call takes only the package name and lock handle. Kept for compatibility with CreatePackage/ValidatePackage, which do read it.',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockObject operation',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockObject operation. Must be the same as used in LockObject.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['package_name', 'super_package', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockPackageArgs {
  package_name: string;
  super_package: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockPackage(
  context: HandlerContext,
  args: UnlockPackageArgs,
) {
  const { connection, logger } = context;
  const {
    package_name,
    super_package,
    lock_handle,
    session_id,
    session_state,
  } = args;

  if (!package_name || !super_package || !lock_handle || !session_id) {
    return return_error(
      new Error(
        'package_name, super_package, lock_handle, and session_id are required',
      ),
    );
  }

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const packageName = package_name.toUpperCase();

  return answer(
    { tool: 'UnlockPackageLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getPackage()
        .unlock({ packageName }, lock_handle),
    (value) => terseWrite(value, 200),
  );
}
