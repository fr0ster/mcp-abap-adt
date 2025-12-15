/**
 * UnlockClassTestClasses Handler - Unlock ABAP Unit test include for a class
 *
 * Uses CrudClient.unlockTestClasses from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UnlockClassTestClassesLow",
  description: "[low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_MY_CLASS)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle returned by LockClassTestClassesLow."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["class_name", "lock_handle"]
  }
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

export async function handleUnlockClassTestClasses(connection: AbapConnection, args: UnlockClassTestClassesArgs) {
  try {
    const {
      class_name,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockClassTestClassesArgs;

    if (!class_name || !lock_handle) {
      return return_error(new Error('class_name and lock_handle are required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleUnlockClassTestClasses',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    const className = class_name.toUpperCase();
    handlerLogger.info(`Starting test classes unlock for: ${className}`);

    try {
      await client.unlockTestClasses({ className }, lock_handle);


      handlerLogger.info(`✅ UnlockClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Test classes for ${className} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);
    } catch (error: any) {
      handlerLogger.error(`Error unlocking test classes for ${className}: ${error?.message || error}`);
      const reason = error?.response?.status === 404
        ? `Class ${className} or the provided lock handle was not found.`
        : error?.message || String(error);
      return return_error(new Error(reason));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

