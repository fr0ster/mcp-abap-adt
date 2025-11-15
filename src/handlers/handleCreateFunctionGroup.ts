/**
 * CreateFunctionGroup Handler - ABAP Function Group Creation via ADT API
 *
 * Uses FunctionGroupBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { FunctionGroupBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateFunctionGroup",
  description: "Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars)."
      },
      description: {
        type: "string",
        description: "Function group description. If not provided, function_group_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      activate: {
        type: "boolean",
        description: "Activate function group after creation. Default: true. Set to false for batch operations."
      }
    },
    required: ["function_group_name", "package_name"]
  }
} as const;

interface CreateFunctionGroupArgs {
  function_group_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateFunctionGroup MCP tool
 *
 * Uses FunctionGroupBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateFunctionGroup(args: any) {
  try {
    // Validate required parameters
    if (!args?.function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const typedArgs = args as CreateFunctionGroupArgs;
    const connection = getManagedConnection();
    const functionGroupName = typedArgs.function_group_name.toUpperCase();

    logger.info(`Starting function group creation: ${functionGroupName}`);

    try {
      // Create builder with configuration
      const builder = new FunctionGroupBuilder(connection, logger, {
        functionGroupName: functionGroupName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
        description: typedArgs.description || functionGroupName
      });

      // Build operation chain: validate -> create -> (activate)
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .validate()
        .then(b => b.create())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Function group creation chain failed:', error);
          throw error;
        });

      logger.info(`✅ CreateFunctionGroup completed successfully: ${functionGroupName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_group_name: functionGroupName,
          package_name: typedArgs.package_name,
          transport_request: typedArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Function group ${functionGroupName} created successfully${shouldActivate ? ' and activated' : ''}`
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating function group ${functionGroupName}:`, error);

      // Check if function group already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        return return_error(new Error(`Function group ${functionGroupName} already exists. Please delete it first or use a different name.`));
      }

      if (error.response?.status === 400) {
        return return_error(new Error(`Bad request. Check if function group name is valid and package exists.`));
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to create function group ${functionGroupName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
