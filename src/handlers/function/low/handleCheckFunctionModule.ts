/**
 * CheckFunctionModule Handler - Syntax check for ABAP function module via ADT API
 *
 * Uses checkFunctionModule from @mcp-abap-adt/adt-clients/core/functionModule for function module-specific checking.
 * Requires function group name.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';

export const TOOL_DEFINITION = {
  name: "CheckFunctionModule",
  description: "[low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., Z_FUGR_TEST_0001)"
      },
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_TEST_FM)"
      },
      version: {
        type: "string",
        description: "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active",
        enum: ["active", "inactive"]
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

interface CheckFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckFunctionModule MCP tool
 */
export async function handleCheckFunctionModule(args: any) {
  try {
    const {
      function_group_name,
      function_module_name,
      version = 'active',
      session_id,
      session_state
    } = args as CheckFunctionModuleArgs;

    if (!function_group_name || !function_module_name) {
      return return_error(new Error('function_group_name and function_module_name are required'));
    }

    const checkVersion = (version && ['active', 'inactive'].includes(version.toLowerCase()))
      ? version.toLowerCase() as 'active' | 'inactive'
      : 'active';

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

    logger.info(`Starting function module check: ${functionModuleName} in group ${functionGroupName} (version: ${checkVersion})`);

    try {
      const client = new CrudClient(connection);
      await client.checkFunctionModule(functionModuleName, functionGroupName);
      const response = client.getCheckResult();
      if (!response) {
        throw new Error('Function module check did not return a response');
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CheckFunctionModule completed: ${functionModuleName}`);
      logger.info(`   Status: ${checkResult.status}`);
      logger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          function_group_name: functionGroupName,
          function_module_name: functionModuleName,
          version: checkVersion,
          check_result: checkResult,
          session_id: session_id,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: checkResult.success
            ? `Function module ${functionModuleName} has no syntax errors`
            : `Function module ${functionModuleName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error checking function module ${functionModuleName}:`, error);

      let errorMessage = `Failed to check function module: ${error.message || String(error)}`;

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

