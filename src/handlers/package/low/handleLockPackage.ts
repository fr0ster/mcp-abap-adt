/**
 * LockPackage Handler - Lock ABAP Package
 *
 * Uses AdtClient.getPackage().lock from @mcp-abap-adt/adt-clients 19.
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
import { connectionForPackageLock } from '../../../lib/packageSessions';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockPackageLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. super_package is required by this schema but not read by the lock endpoint — see its own parameter description. Always unlock. A package can be saved only once per ABAP session (SAP answers PAK/058 "Package … is already locked" otherwise). Over RFC, where every call shares one session, the lock is taken in an ABAP session of its own, kept under the returned lock_handle for UpdatePackageLow and UnlockPackageLow, and closed by UnlockPackageLow. Over HTTP the connection keeps the stateful context of the lock to the lock and unlock requests, so the update runs outside it.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name.',
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

  // The lock is taken in an ABAP session of its own and kept under its handle,
  // for UpdatePackageLow and UnlockPackageLow to find: a package can be saved
  // only once per session (PAK/058, lib/packageSessions.ts), on RFC and HTTP.
  const lockOn = await connectionForPackageLock(connection, logger);

  return answer(
    { tool: 'LockPackageLow', detail: 'terse' },
    async () => {
      try {
        const locked = await createAdtClient(lockOn.connection, logger)
          .getPackage()
          .lock({ packageName }, { analyse: analyseLock });
        if (locked.ok) lockOn.keep(locked.getResult().value);
        else await lockOn.drop();
        return locked;
      } catch (error) {
        await lockOn.drop();
        throw error;
      }
    },
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
