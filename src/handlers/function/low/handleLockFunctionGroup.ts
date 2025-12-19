/**
 * LockFunctionGroup Handler - Lock ABAP FunctionGroup
 *
 * Uses CrudClient.lockFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "LockFunctionGroupLow",
  description: "[low-level] Lock an ABAP function group for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "FunctionGroup name (e.g., Z_MY_PROGRAM)."
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
    required: ["function_group_name"]
  }
} as const;

interface LockFunctionGroupArgs {
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockFunctionGroup MCP tool
 *
 * Uses CrudClient.lockFunctionGroup - low-level single method call
 */
export async function handleLockFunctionGroup(context: HandlerContext, args: LockFunctionGroupArgs) {
  const { connection, logger } = context;
  try {
    const {
      function_group_name,
      session_id,
      session_state
    } = args as LockFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(`Starting function group lock: ${functionGroupName}`);

    try {
      // Lock function group
      await client.lockFunctionGroup({ functionGroupName: functionGroupName });
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for function group ${functionGroupName}`);
      }

      // Get updated session state after lock
      const actualSessionId = connection.getSessionId() || session_id || null;
      // Session state is passed through from input - auth-broker manages it
      const actualSessionState = session_state || null;

      logger?.info(`✅ LockFunctionGroup completed: ${functionGroupName}`);
      logger?.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_group_name: functionGroupName,
          session_id: actualSessionId,
          lock_handle: lockHandle,
          session_state: actualSessionState,
          message: `FunctionGroup ${functionGroupName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error locking function group ${functionGroupName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to lock function group: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `FunctionGroup ${functionGroupName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `FunctionGroup ${functionGroupName} is already locked by another user.`;
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
