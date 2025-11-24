/**
 * UpdateClass Handler - Update ABAP Class Source Code
 *
 * Uses CrudClient.updateClass from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateClassLow",
  description: "[low-level] Update source code of an existing ABAP class. Requires lock handle from LockObject. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject. Required for update operation."
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
    required: ["class_name", "source_code", "lock_handle"]
  }
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateClass MCP tool
 *
 * Uses CrudClient.updateClass - low-level single method call
 */
export async function handleUpdateClass(args: any) {
  try {
    const {
      class_name,
      source_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateClassArgs;

    // Validation
    if (!class_name || !source_code || !lock_handle) {
      return return_error(new Error('class_name, source_code, and lock_handle are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const className = class_name.toUpperCase();

    logger.info(`Starting class update: ${className}`);

    try {
      // Update class with source code
      await client.updateClass(className, source_code, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for class ${className}`);
      }

      // Get updated session state after update
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UpdateClass completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Class ${className} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating class ${className}:`, error);

      // Parse error message
      let errorMessage = `Failed to update class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Class ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user or lock handle is invalid.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

