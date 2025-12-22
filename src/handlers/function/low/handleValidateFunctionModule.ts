/**
 * ValidateFunctionModule Handler - Validate ABAP function module name via ADT API
 *
 * Uses validateFunctionModuleName from @mcp-abap-adt/adt-clients/core/functionModule for function module-specific validation.
 * Requires function group name.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseValidationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateFunctionModuleLow',
  description:
    '[low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_FUGR_TEST_0001)',
      },
      function_module_name: {
        type: 'string',
        description: 'Function module name to validate (e.g., Z_TEST_FM)',
      },
      description: {
        type: 'string',
        description: 'Optional description for validation',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['function_group_name', 'function_module_name'],
  },
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
export async function handleValidateFunctionModule(
  context: HandlerContext,
  args: ValidateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      function_group_name,
      function_module_name,
      description,
      session_id,
      session_state,
    } = args as ValidateFunctionModuleArgs;

    if (!function_group_name || !function_module_name) {
      return return_error(
        new Error('function_group_name and function_module_name are required'),
      );
    }

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionGroupName = function_group_name.toUpperCase();
    const functionModuleName = function_module_name.toUpperCase();

    logger?.info(
      `Starting function module validation: ${functionModuleName} in group ${functionGroupName}`,
    );

    try {
      const client = new CrudClient(connection);

      await client.validateFunctionModule({
        functionModuleName: functionModuleName,
        functionGroupName: functionGroupName,
        packageName: undefined,
        description: description,
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);
      if (!result) {
        throw new Error('Validation did not return a result');
      }

      // Get updated session state after validation

      logger?.info(
        `✅ ValidateFunctionModule completed: ${functionModuleName} (valid=${result.valid}, msg=${result.message || 'N/A'})`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: result.valid,
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            description: description || null,
            validation_result: result,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: result.valid
              ? `Function module name ${functionModuleName} is valid and available`
              : `Function module name ${functionModuleName} validation failed: ${result.message || 'Unknown error'}`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error validating function module ${functionModuleName}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to validate function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
