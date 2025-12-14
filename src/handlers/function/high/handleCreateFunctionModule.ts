/**
 * CreateFunctionModule Handler - ABAP Function Module Creation via ADT API
 *
 * Uses FunctionModuleBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

import { getManagedConnection } from '../../../lib/utils.js';
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
export async function handleCreateFunctionModule(args: CreateFunctionModuleArgs) {
  let connection: any = null;
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
    // Note: package_name is not available for function modules (inherited from function group)
    // Skip validation for now - function group should handle transport request validation
    // try {
    //   validateTransportRequest(args.package_name, args.transport_request);
    // } catch (error) {
    //   return return_error(error as Error);
    // }

    const typedArgs = args as CreateFunctionModuleArgs;
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();
    const functionGroupName = typedArgs.function_group_name.toUpperCase();
    const functionModuleName = typedArgs.function_module_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleCreateFunctionModule',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting function module creation: ${functionModuleName} in ${functionGroupName}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Validate
      await client.validateFunctionModule({
        functionModuleName,
        functionGroupName,
        packageName: '',
        description: typedArgs.description || functionModuleName
      });

      // Create
      // Note: Package name inherited from parent function group
      await client.createFunctionModule({
        functionModuleName,
        functionGroupName,
        description: typedArgs.description || functionModuleName,
        packageName: '', // packageName inherited from function group
        sourceCode: typedArgs.source_code || '',
        transportRequest: typedArgs.transport_request
      });

      // Lock
      await client.lockFunctionModule({ functionModuleName, functionGroupName });
      const lockHandle = client.getLockHandle();

      // Update with source code
      await client.updateFunctionModule({ functionModuleName, functionGroupName, sourceCode: typedArgs.source_code }, lockHandle);

      // Check
      await client.checkFunctionModule({ functionModuleName, functionGroupName });

      // Unlock
      await client.unlockFunctionModule({ functionModuleName, functionGroupName }, lockHandle);

      // Activate if requested
      if (shouldActivate) {
        await client.activateFunctionModule({ functionModuleName, functionGroupName });
      }

      handlerLogger.info(`✅ CreateFunctionModule completed successfully: ${functionModuleName}`);

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
      handlerLogger.error(`Error creating function module ${functionModuleName}: ${error?.message || error}`);

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
  } finally {
    try {
      if (connection) {
        connection.reset();
        const handlerLogger = getHandlerLogger(
          'handleCreateFunctionModule',
          process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
        );
        handlerLogger.debug('Reset function module connection after use');
      }
    } catch (resetError: any) {
      const handlerLogger = getHandlerLogger(
        'handleCreateFunctionModule',
        process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
      );
      handlerLogger.error(`Failed to reset function module connection: ${resetError?.message || resetError}`);
    }
  }
}
