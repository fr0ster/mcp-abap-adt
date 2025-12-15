/**
 * UpdateClassTestClasses Handler - Update ABAP Unit test include for a class
 *
 * Uses CrudClient.updateClassTestIncludes from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UpdateClassTestClassesLow",
  description: "[low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_MY_CLASS)."
      },
      test_class_source: {
        type: "string",
        description: "Complete ABAP Unit test class source code."
      },
      lock_handle: {
        type: "string",
        description: "Test classes lock handle from LockClassTestClassesLow."
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
    required: ["class_name", "test_class_source", "lock_handle"]
  }
} as const;

interface UpdateClassTestClassesArgs {
  class_name: string;
  test_class_source: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleUpdateClassTestClasses(connection: AbapConnection, args: UpdateClassTestClassesArgs) {
  try {
    const {
      class_name,
      test_class_source,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateClassTestClassesArgs;

    if (!class_name || !test_class_source || !lock_handle) {
      return return_error(new Error('class_name, test_class_source, and lock_handle are required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleUpdateClassTestClasses',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    const className = class_name.toUpperCase();
    handlerLogger.info(`Starting test classes update for: ${className}`);

    try {
      await client.updateClassTestIncludes({
        className,
        testClassCode: test_class_source
      }, lock_handle);
      const updateResult = client.getTestClassUpdateResult();


      handlerLogger.info(`✅ UpdateClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          session_id: session_id || null,
          status: updateResult?.status,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Test classes for ${className} updated successfully. Remember to unlock using UnlockClassTestClassesLow.`
        }, null, 2)
      } as AxiosResponse);
    } catch (error: any) {
      handlerLogger.error(`Error updating test classes for ${className}: ${error?.message || error}`);
      const reason = error?.response?.status === 404
        ? `Class ${className} not found.`
        : error?.response?.status === 423
        ? `Test classes for ${className} are locked by another user or lock handle is invalid.`
        : error?.message || String(error);
      return return_error(new Error(reason));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

