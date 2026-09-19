/**
 * LockPackage Handler - Lock ABAP Package
 *
 * Uses AdtClient.getPackage().lock from @mcp-abap-adt/adt-clients 19.
 *
 * `lock()` accepts no options at all — not even `analyse` — so there is no
 * strategy to inject here. Its answer is the lock handle itself, and the
 * projection is the envelope the tool already returned: nothing about `lock`
 * varies with `detail`, so the parameter is not added to this tool's surface.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockPackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. super_package is required by this schema but not read by the lock endpoint — see its own parameter description.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_TEST_0002).',
      },
      super_package: {
        type: 'string',
        description:
          'Does not reach the lock endpoint — the shipped lockPackage() call takes only the package name. Kept for compatibility with CreatePackage/ValidatePackage, which do read it.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['package_name', 'super_package'],
  },
} as const;

interface LockPackageArgs {
  package_name: string;
  super_package: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockPackage(
  context: HandlerContext,
  args: LockPackageArgs,
) {
  const { connection, logger } = context;
  const { package_name, super_package, session_id, session_state } = args;

  if (!package_name || !super_package) {
    return return_error(
      new Error('package_name and super_package are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const packageName = package_name.toUpperCase();
  const superPackage = super_package.toUpperCase();

  return answer(
    { tool: 'LockPackageLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger).getPackage().lock({ packageName }),
    (lockHandle: string) => ({
      success: true,
      package_name: packageName,
      super_package: superPackage,
      session_id: connection.getSessionId() || session_id || null,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Package ${packageName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
