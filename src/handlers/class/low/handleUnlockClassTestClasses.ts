/**
 * UnlockClassTestClasses Handler - Unlock ABAP Unit test include for a class
 *
 * Uses AdtClient.getClass().unlockTestClasses from @mcp-abap-adt/adt-clients 19.
 *
 * `unlockTestClasses()` is not part of the `IAdtLockable` shape every other
 * family's `unlock()` implements, and since adt-clients 23 it answers an
 * `IAdtResponse`, taking `analyse` like every member. A refused unlock is
 * reported as one; before, the envelope went unread and every unlock answered
 * success.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

/**
 * The two test-include members, typed. `lockTestClasses`/`unlockTestClasses`
 * are on the concrete `AdtClass` and not on `IClassContract`, which is what
 * `getClass()` is typed to return, so a cast is still needed to reach them.
 * It names what they answer, not `any`: under `any` the change in
 * adt-clients 23 — both answer `IAdtResponse` now, not a bare handle — went
 * unseen, and the whole envelope was handed on as the lock handle
 * (`lockHandle=[object Object]`, SAP 423, E19 2026-09-26).
 */
interface TestClassesLocking {
  lockTestClasses(
    config: { className: string },
    options: { analyse: IAnalyse<IAdtError> },
  ): Promise<IAdtResponse<string, IAdtError>>;
  unlockTestClasses(
    config: { className: string },
    lockHandle: string,
    options: { analyse: IAnalyse<IAdtError> },
  ): Promise<IAdtResponse<unknown, IAdtError>>;
}

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

    const classClient = createAdtClient(
      connection,
      logger,
    ).getClass() as unknown as TestClassesLocking;

    return answer(
      { tool: 'UnlockClassTestClassesLow', detail: 'terse' },
      () =>
        classClient.unlockTestClasses({ className }, lock_handle, {
          analyse: analyseException,
        }),
      () => ({
        success: true,
        class_name: className,
        session_id: session_id || null,
        session_state: null, // Session state management is now handled by auth-broker,
        message: `Test classes for ${className} unlocked successfully.`,
      }),
    );
  } catch (error: any) {
    return return_error(error);
  }
}
