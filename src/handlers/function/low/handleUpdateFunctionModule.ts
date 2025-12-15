/**
 * UpdateFunctionModule Handler - Update ABAP Function Module Source Code
 *
 * Uses CrudClient.updateFunctionModule from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateFunctionModuleLow",
  description: "[low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_TEST_FM). Function module must already exist."
      },
      function_group_name: {
        type: "string",
        description: "Function group name containing the function module (e.g., Z_TEST_FG)."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP function module source code."
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
    required: ["function_module_name", "function_group_name", "source_code", "lock_handle"]
  }
} as const;

interface UpdateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
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
 * Main handler for UpdateFunctionModule MCP tool
 *
 * Uses CrudClient.updateFunctionModule - low-level single method call
 */
export async function handleUpdateFunctionModule(connection: AbapConnection, args: UpdateFunctionModuleArgs) {
  try {
    const {
      function_module_name,
      function_group_name,
      source_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateFunctionModuleArgs;

    // Validation
    if (!function_module_name || !function_group_name || !source_code || !lock_handle) {
      return return_error(new Error('function_module_name, function_group_name, source_code, and lock_handle are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleUpdateFunctionModuleLow',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();

    handlerLogger.info(`Starting function module update: ${functionModuleName} in ${functionGroupName}`);

    try {
      // Update function module with source code
      await client.updateFunctionModule({ functionModuleName: functionModuleName, functionGroupName: functionGroupName, sourceCode: source_code }, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for function module ${functionModuleName}`);
      }

      // Get updated session state after update


      handlerLogger.info(`✅ UpdateFunctionModule completed: ${functionModuleName}`);

      // Get lock handle from builder (it should still be there after update)
      const lockHandleFromBuilder = client.getLockHandle();

      return return_response({
        data: JSON.stringify({
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          lock_handle: lockHandleFromBuilder || lock_handle, // Return lock handle for unlock
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Function module ${functionModuleName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error updating function module ${functionModuleName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to update function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Function module ${functionModuleName} is locked by another user or lock handle is invalid.`;
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
