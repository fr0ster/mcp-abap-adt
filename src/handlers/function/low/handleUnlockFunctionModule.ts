/**
 * UnlockFunctionModule Handler - Unlock ABAP Function Module
 *
 * Uses CrudClient.unlockFunctionModule from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UnlockFunctionModuleLow",
  description: "[low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.",
  inputSchema: {
    type: "object",
    properties: {
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_MY_FUNCTION)."
      },
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., ZFG_MY_GROUP)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockFunctionModule operation."
      },
      session_id: {
        type: "string",
        description: "Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule."
      },
      session_state: {
        type: "object",
        description: "Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["function_module_name", "function_group_name", "lock_handle", "session_id"]
  }
} as const;

interface UnlockFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockFunctionModule MCP tool
 *
 * Uses CrudClient.unlockFunctionModule - low-level single method call
 */
export async function handleUnlockFunctionModule(args: UnlockFunctionModuleArgs) {
  try {
    const {
      function_module_name,
      function_group_name,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockFunctionModuleArgs;

    // Validation
    if (!function_module_name || !function_group_name || !lock_handle || !session_id) {
      return return_error(new Error('function_module_name, function_group_name, lock_handle, and session_id are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();

    logger.info(`Starting function module unlock: ${functionModuleName} in ${functionGroupName} (session: ${session_id.substring(0, 8)}...)`);

    try {
      // Unlock function module
      await client.unlockFunctionModule({ functionModuleName: functionModuleName, functionGroupName: functionGroupName }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(`Unlock did not return a response for function module ${functionModuleName}`);
      }

      // Get updated session state after unlock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UnlockFunctionModule completed: ${functionModuleName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          session_id: session_id,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Function module ${functionModuleName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error unlocking function module ${functionModuleName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockFunctionModule.`;
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
