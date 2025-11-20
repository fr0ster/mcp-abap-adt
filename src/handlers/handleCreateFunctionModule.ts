/**
 * CreateFunctionModule Handler - ABAP Function Module Creation via ADT API
 *
 * Uses FunctionModuleBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { FunctionModuleBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateFunctionModule",
  description: "Create a new ABAP function module within an existing function group. Uses stateful session with LOCK/UNLOCK workflow for source code upload.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Parent function group name (e.g., ZTEST_FG_001)"
      },
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars)."
      },
      source_code: {
        type: "string",
        description: "ABAP source code for the function module including signature (FUNCTION name IMPORTING/EXPORTING ... ENDFUNCTION)."
      },
      description: {
        type: "string",
        description: "Optional description for the function module"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      activate: {
        type: "boolean",
        description: "Whether to activate the function module after creation (default: true)",
        default: true
      }
    },
    required: ["function_group_name", "function_module_name", "source_code"]
  }
};

interface CreateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  source_code: string;  // Required: no default generation
  description?: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateFunctionModule MCP tool
 *
 * Uses FunctionModuleBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateFunctionModule(args: any) {
  try {
    // Validate required parameters
    if (!args?.function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }
    if (!args?.function_module_name) {
      return return_error(new Error('function_module_name is required'));
    }
    if (!args?.source_code) {
      return return_error(new Error('source_code is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const typedArgs = args as CreateFunctionModuleArgs;
    const connection = getManagedConnection();
    const functionGroupName = typedArgs.function_group_name.toUpperCase();
    const functionModuleName = typedArgs.function_module_name.toUpperCase();

    logger.info(`Starting function module creation: ${functionModuleName} in ${functionGroupName}`);

    try {
      // Create builder with configuration
      const builder = new FunctionModuleBuilder(connection, logger, {
        functionGroupName: functionGroupName,
        functionModuleName: functionModuleName,
        sourceCode: typedArgs.source_code,
        description: typedArgs.description || functionModuleName,
        transportRequest: typedArgs.transport_request
      });

      // Build operation chain: validate -> create -> lock -> update -> check -> unlock -> (activate)
      // Note: create() creates empty function module, then lock() -> update() fills it with source code
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .validate()
        .then(b => b.create())
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Function module creation chain failed:', error);
          throw error;
        });

      logger.info(`✅ CreateFunctionModule completed successfully: ${functionModuleName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          transport_request: typedArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Function module ${functionModuleName} created successfully${shouldActivate ? ' and activated' : ''}`
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating function module ${functionModuleName}:`, error);

      // Check if function module already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        return return_error(new Error(`Function module ${functionModuleName} already exists in group ${functionGroupName}. Please delete it first or use a different name.`));
      }

      if (error.response?.status === 404) {
        return return_error(new Error(`Function group ${functionGroupName} not found. Create the function group first.`));
      }

      if (error.response?.status === 400) {
        return return_error(new Error(`Bad request. Check if function module name is valid and function group exists.`));
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to create function module ${functionModuleName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
