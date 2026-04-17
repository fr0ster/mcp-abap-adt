/**
 * CreateFunctionModule Handler - ABAP Function Module Creation via ADT API
 *
 * Workflow: validate -> create (object in initial state)
 * Source code is set via UpdateFunctionModule handler.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionModule',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: FunctionModule. Will be useful for creating function module. Create a new ABAP function module within an existing function group. Creates the function module in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Parent function group name (e.g., ZTEST_FG_001)',
      },
      function_module_name: {
        type: 'string',
        description:
          'Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).',
      },
      description: {
        type: 'string',
        description: 'Optional description for the function module',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
    },
    required: ['function_group_name', 'function_module_name'],
  },
};

interface CreateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  description?: string;
  transport_request?: string;
}

/**
 * Main handler for CreateFunctionModule MCP tool
 */
export async function handleCreateFunctionModule(
  context: HandlerContext,
  args: CreateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }
    if (!args?.function_module_name) {
      return return_error(new Error('function_module_name is required'));
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const functionModuleName = args.function_module_name.toUpperCase();

    logger?.info(
      `Starting function module creation: ${functionModuleName} in ${functionGroupName}`,
    );

    try {
      const client = createAdtClient(connection, logger);

      // Validate
      await client.getFunctionModule().validate({
        functionModuleName,
        functionGroupName,
        packageName: '',
        description: args.description || functionModuleName,
      });

      // Create
      // Note: Package name inherited from parent function group
      await client.getFunctionModule().create({
        functionModuleName,
        functionGroupName,
        description: args.description || functionModuleName,
        packageName: '', // packageName inherited from function group
        sourceCode: '',
        transportRequest: args.transport_request,
      });

      logger?.info(`Function module created: ${functionModuleName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          transport_request: args.transport_request || 'local',
          message: `Function module ${functionModuleName} created successfully. Use UpdateFunctionModule to set source code.`,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating function module ${functionModuleName}: ${error?.message || error}`,
      );

      // Check if function module already exists
      if (
        error.message?.includes('already exists') ||
        error.response?.status === 409
      ) {
        return return_error(
          new Error(
            `Function module ${functionModuleName} already exists in group ${functionGroupName}. Please delete it first or use a different name.`,
          ),
        );
      }

      if (error.response?.status === 404) {
        return return_error(
          new Error(
            `Function group ${functionGroupName} not found. Create the function group first.`,
          ),
        );
      }

      if (error.response?.status === 400) {
        return return_error(
          new Error(
            `Bad request. Check if function module name is valid and function group exists.`,
          ),
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      return return_error(
        new Error(
          `Failed to create function module ${functionModuleName}: ${errorMessage}`,
        ),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
