/**
 * CheckFunctionGroup Handler - Syntax check for ABAP FunctionGroup
 *
 * Uses CrudClient.checkFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
export const TOOL_DEFINITION = {
  name: "CheckFunctionGroupLow",
  description: "[low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.",
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

interface CheckFunctionGroupArgs {
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckFunctionGroup MCP tool
 *
 * Uses CrudClient.checkFunctionGroup - low-level single method call
 */
export async function handleCheckFunctionGroup(connection: AbapConnection, args: CheckFunctionGroupArgs) {
  try {
    const {
      function_group_name,
      session_id,
      session_state
    } = args as CheckFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleCheckFunctionGroup',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const functionGroupName = function_group_name.toUpperCase();

    handlerLogger.info(`Starting function group check: ${functionGroupName}`);

    try {
      // Check function group
      await client.checkFunctionGroup({ functionGroupName: functionGroupName });
      const response = client.getCheckResult();

      if (!response) {
        throw new Error(`Check did not return a response for function group ${functionGroupName}`);
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check


      handlerLogger.info(`✅ CheckFunctionGroup completed: ${functionGroupName}`);
      handlerLogger.debug(`Status: ${checkResult.status} | Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          function_group_name: functionGroupName,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: checkResult.success
            ? `FunctionGroup ${functionGroupName} has no syntax errors`
            : `FunctionGroup ${functionGroupName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking function group ${functionGroupName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to check function group: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `FunctionGroup ${functionGroupName} not found.`;
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
