/**
 * ValidateFunctionModule Handler - Validate ABAP function module name via ADT API
 *
 * Uses validateFunctionModuleName from @mcp-abap-adt/adt-clients/core/functionModule for function module-specific validation.
 * Requires function group name.
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ValidateFunctionModule",
  description: "Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., Z_FUGR_TEST_0001)"
      },
      function_module_name: {
        type: "string",
        description: "Function module name to validate (e.g., Z_TEST_FM)"
      },
      description: {
        type: "string",
        description: "Optional description for validation"
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
    required: ["function_group_name", "function_module_name"]
  }
} as const;

interface ValidateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  description?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateFunctionModule MCP tool
 */
export async function handleValidateFunctionModule(args: any) {
  try {
    const {
      function_group_name,
      function_module_name,
      description,
      session_id,
      session_state
    } = args as ValidateFunctionModuleArgs;

    if (!function_group_name || !function_module_name) {
      return return_error(new Error('function_group_name and function_module_name are required'));
    }

    const connection = getManagedConnection();

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
    const functionModuleName = function_module_name.toUpperCase();

    logger.info(`Starting function module validation: ${functionModuleName} in group ${functionGroupName}`);

    try {
      const client = new CrudClient(connection);

      await client.validateFunctionModule(functionModuleName, functionGroupName);
      const result = client.getValidationResult();
      if (!result) {
        throw new Error('Validation did not return a result');
      }

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ ValidateFunctionModule completed: ${functionModuleName}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message || 'N/A'}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          description: description || null,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `Function module name ${functionModuleName} is valid and available`
            : `Function module name ${functionModuleName} validation failed: ${result.message || 'Unknown error'}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating function module ${functionModuleName}:`, error);

      let errorMessage = `Failed to validate function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found.`;
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

