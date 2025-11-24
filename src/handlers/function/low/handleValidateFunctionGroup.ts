/**
 * ValidateFunctionGroup Handler - Validate ABAP FunctionGroup Name
 *
 * Uses CrudClient.validateFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ValidateFunctionGroupLow",
  description: "[low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "FunctionGroup name to validate (e.g., Z_MY_PROGRAM)."
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

interface ValidateFunctionGroupArgs {
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateFunctionGroup MCP tool
 *
 * Uses CrudClient.validateFunctionGroup - low-level single method call
 */
export async function handleValidateFunctionGroup(args: any) {
  try {
    const {
      function_group_name,
      session_id,
      session_state
    } = args as ValidateFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
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

    const functionGroupName = function_group_name.toUpperCase();

    logger.info(`Starting function group validation: ${functionGroupName}`);

    try {
      // Validate function group
      await client.validateFunctionGroup(functionGroupName);
      const result = client.getValidationResult();

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ ValidateFunctionGroup completed: ${functionGroupName}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          function_group_name: functionGroupName,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `FunctionGroup name ${functionGroupName} is valid and available`
            : `FunctionGroup name ${functionGroupName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating function group ${functionGroupName}:`, error);

      // Parse error message
      let errorMessage = `Failed to validate function group: ${error.message || String(error)}`;

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

