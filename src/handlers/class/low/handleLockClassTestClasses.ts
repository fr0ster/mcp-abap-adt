/**
 * LockClassTestClasses Handler - Lock ABAP Unit test include for a class
 *
 * Uses AdtClient.getClass().lockTestClasses from @mcp-abap-adt/adt-clients 19.
 *
 * `lockTestClasses()` is not part of the `IAdtLockable` shape every other
 * family's `lock()` implements — it takes only a config and answers a bare
 * `string`, not an `IAdtResponse`. There is therefore no `analyse` to inject
 * (the member has no `options` parameter at all) and no reading to route
 * through `answer()`: this stays a direct call, the same shape the pre-19
 * code already used.
 *
 * The `as any` stays, for a structural reason rather than a typing gap the
 * package left open: `AdtClient.getClass()` is typed to return
 * `IClassContract<R>`, which is `IAdtCreatable & IAdtReadable & … &
 * IAdtLockable & …` — the CRUD surface every family shares. `lockTestClasses`
 * exists on the concrete `AdtClass` class but was never added to that shared
 * contract, so there is no public type through which `getClass()` can reach
 * it. Casting past `IClassContract` is the only way this repository has to
 * call it through the client facade at all.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockClassTestClassesLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
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
    required: ['class_name'],
  },
} as const;

interface LockClassTestClassesArgs {
  class_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockClassTestClasses(
  context: HandlerContext,
  args: LockClassTestClassesArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, session_id, session_state } = args;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const className = class_name.toUpperCase();
    logger?.info(`Starting test classes lock for: ${className}`);

    try {
      const classClient = createAdtClient(connection, logger).getClass() as any;
      const lockHandle = await classClient.lockTestClasses({ className });

      if (!lockHandle) {
        throw new Error(
          `Lock did not return a test classes lock handle for class ${className}`,
        );
      }

      logger?.info(`✅ LockClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            session_id: session_id || null,
            test_classes_lock_handle: lockHandle,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Test classes for ${className} locked successfully. Use this test_classes_lock_handle for update/unlock operations.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error locking test classes for ${className}: ${error?.message || error}`,
      );
      const reason =
        error?.response?.status === 404
          ? `Class ${className} not found.`
          : error?.response?.status === 409
            ? `Test classes for ${className} are already locked by another user.`
            : error?.message || String(error);
      return return_error(new Error(reason));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
