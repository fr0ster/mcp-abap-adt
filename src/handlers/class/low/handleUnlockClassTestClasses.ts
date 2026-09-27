/**
 * UnlockClassTestClasses Handler - Unlock ABAP Unit test include for a class
 *
 * Uses AdtClient.getClass().unlockTestClasses from @mcp-abap-adt/adt-clients 19.
 *
 * `unlockTestClasses()` is not part of the `IAdtLockable` shape every other
 * family's `unlock()` implements, but since adt-clients 23 it answers the way
 * `unlock` does: an `IAdtResponse`, with an `analyse` of its own.
 *
 * **So the answer is read, not merely awaited.** The call goes through an
 * `as any` (see below), so nothing in the compiler noticed that a refused
 * release stopped arriving as a throw. Awaiting and reporting success would
 * leave the class locked with this tool saying it was released — the one
 * outcome an unlock must never report.
 *
 * The `as any` stays, for a structural reason rather than a typing gap the
 * package left open: `AdtClient.getClass()` is typed to return
 * `IClassContract<R>`, which is `IAdtCreatable & IAdtReadable & … &
 * IAdtLockable & …` — the CRUD surface every family shares.
 * `unlockTestClasses` exists on the concrete `AdtClass` class but was never
 * added to that shared contract, so there is no public type through which
 * `getClass()` can reach it. Casting past `IClassContract` is the only way
 * this repository has to call it through the client facade at all.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockClassTestClassesLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle returned by LockClassTestClassesLow.',
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
    required: ['class_name', 'lock_handle'],
  },
} as const;

interface UnlockClassTestClassesArgs {
  class_name: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUnlockClassTestClasses(
  context: HandlerContext,
  args: UnlockClassTestClassesArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, lock_handle, session_id, session_state } = args;

    if (!class_name || !lock_handle) {
      return return_error(new Error('class_name and lock_handle are required'));
    }

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const className = class_name.toUpperCase();
    logger?.info(`Starting test classes unlock for: ${className}`);

    try {
      const classClient = createAdtClient(connection, logger).getClass() as any;
      const released = await classClient.unlockTestClasses(
        { className },
        lock_handle,
        { analyse: analyseException },
      );
      if (!released?.ok) {
        return return_error(
          new Error(
            released?.getError?.()?.message ??
              `The test classes of ${className} were NOT released, and the answer carried no message.`,
          ),
        );
      }

      logger?.info(`✅ UnlockClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Test classes for ${className} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error unlocking test classes for ${className}: ${error?.message || error}`,
      );
      const reason =
        error?.response?.status === 404
          ? `Class ${className} or the provided lock handle was not found.`
          : error?.message || String(error);
      return return_error(new Error(reason));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
