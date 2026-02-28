/**
 * CreateFunctionModule Handler - Create ABAP Function Module
 *
 * Uses AdtClient.createFunctionModule from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionModuleLow',
  description:
    '[low-level] Create a new ABAP function module. - use CreateFunctionModule (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFG_MY_GROUP).',
      },
      description: {
        type: 'string',
        description: 'Function module description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
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
    required: [
      'function_module_name',
      'function_group_name',
      'description',
      'package_name',
    ],
  },
} as const;

interface CreateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateFunctionModule MCP tool
 *
 * Uses AdtClient.createFunctionModule - low-level single method call
 */
export async function handleCreateFunctionModule(
  context: HandlerContext,
  args: CreateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      function_module_name,
      function_group_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state,
    } = args as CreateFunctionModuleArgs;

    // Validation
    if (
      !function_module_name ||
      !function_group_name ||
      !description ||
      !package_name
    ) {
      return return_error(
        new Error(
          'function_module_name, function_group_name, description, and package_name are required',
        ),
      );
    }

    const client = createAdtClient(connection);
    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(
      `Starting function module creation: ${functionModuleName} in ${functionGroupName}`,
    );

    try {
      // Create function module
      await client.getFunctionModule().create({
        functionModuleName,
        functionGroupName,
        description,
        packageName: package_name,
        sourceCode: '',
        transportRequest: transport_request,
      });
      try {
        await client
          .getFunctionModule()
          .read({ functionModuleName, functionGroupName }, 'inactive', {
            withLongPolling: true,
          });
      } catch (_readError: any) {
        // Read is best-effort; create may still succeed without immediate read.
      }

      // Get updated session state after create

      logger?.info(`✅ CreateFunctionModule completed: ${functionModuleName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            description,
            package_name: package_name,
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Function module ${functionModuleName} created successfully. Use LockFunctionModule and UpdateFunctionModule to add source code, then UnlockFunctionModule and ActivateObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating function module ${functionModuleName}: ${error?.message || error}`,
      );
      const responseData =
        typeof error.response?.data === 'string'
          ? error.response.data
          : error.response?.data
            ? JSON.stringify(error.response.data)
            : '';
      const responseSnippet = responseData
        ? responseData.slice(0, 1000)
        : undefined;
      if (responseSnippet) {
        logger?.warn(
          `CreateFunctionModule returned HTTP ${error.response?.status} for ${functionModuleName}. Response: ${responseSnippet}`,
        );
      }

      // Parse error message
      let errorMessage = `Failed to create function module: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Function module ${functionModuleName} already exists.`;
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
