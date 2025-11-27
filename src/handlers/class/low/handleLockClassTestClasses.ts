/**
 * LockClassTestClasses Handler - Lock ABAP Unit test include for a class
 *
 * Uses CrudClient.lockTestClasses from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "LockClassTestClassesLow",
  description: "[low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_MY_CLASS)."
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
    required: ["class_name"]
  }
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

export async function handleLockClassTestClasses(args: LockClassTestClassesArgs) {
  try {
    const {
      class_name,
      session_id,
      session_state
    } = args as LockClassTestClassesArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      await connection.connect();
    }

    const className = class_name.toUpperCase();
    logger.info(`Starting test classes lock for: ${className}`);

    try {
      await client.lockTestClasses({ className });
      const lockHandle = client.getTestClassLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a test classes lock handle for class ${className}`);
      }

      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ LockClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          session_id: session_id || null,
          test_classes_lock_handle: lockHandle,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Test classes for ${className} locked successfully. Use this test_classes_lock_handle for update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);
    } catch (error: any) {
      logger.error(`Error locking test classes for ${className}:`, error);
      const reason = error?.response?.status === 404
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


