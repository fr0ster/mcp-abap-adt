/**
 * UpdateFunctionModule Handler - Update Existing ABAP Function Module Source Code
 *
 * Uses FunctionModuleBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { e } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UpdateFunctionModule",
  description: "Update source code of an existing ABAP function module. Locks the function module, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing function modules without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name containing the function module (e.g., ZOK_FG_MCP01)."
      },
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable function modules."
      },
      activate: {
        type: "boolean",
        description: "Activate function module after source update. Default: false. Set to true to activate immediately."
      }
    },
    required: ["function_group_name", "function_module_name", "source_code"]
  }
} as const;

interface UpdateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateFunctionModule MCP tool
 *
 * Uses FunctionModuleBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateFunctionModule(connection: AbapConnection, args: UpdateFunctionModuleArgs): Promise<any> {
    try {
    // Validate inputs
    if (!args.function_module_name || args.function_module_name.length > 30) {
      return return_error(new Error("Function module name is required and must not exceed 30 characters"));
    }
    if (!args.function_group_name || args.function_group_name.length > 30) {
      return return_error(new Error("Function group name is required and must not exceed 30 characters"));
    }
    if (!args.source_code) {
      return return_error(new Error("Source code is required"));
    }

            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    const functionGroupName = args.function_group_name.toUpperCase();
    const functionModuleName = args.function_module_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleUpdateFunctionModule',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting function module source update: ${functionModuleName} in ${functionGroupName}`);

    try {
      const client = new CrudClient(connection);
      const shouldActivate = args.activate === true;

      // Execute operation chain: lock -> update -> check -> unlock -> (activate)
      try {
        await client.lockFunctionModule({ functionModuleName, functionGroupName });
        const lockHandle = client.getLockHandle();
        await client.updateFunctionModule({ functionModuleName, functionGroupName, sourceCode: args.source_code }, lockHandle);
        await client.checkFunctionModule({ functionModuleName, functionGroupName });
        await client.unlockFunctionModule({ functionModuleName, functionGroupName }, lockHandle);
        if (shouldActivate) {
          await client.activateFunctionModule({ functionModuleName, functionGroupName });
        }
      } catch (error) {
        handlerLogger.error(`Function module update chain failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }

      handlerLogger.info(`✅ UpdateFunctionModule completed successfully: ${functionModuleName}`);

      const result = {
        success: true,
        function_module_name: functionModuleName,
        function_group_name: functionGroupName,
        activated: shouldActivate,
        message: `Function module ${functionModuleName} source code updated successfully${shouldActivate ? ' and activated' : ''}`
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      handlerLogger.error(`Error updating function module source ${functionModuleName}: ${error?.message || error}`);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update function module source: ${errorMessage}`));
    } finally {
      try {
        if (connection) {
          connection.reset();
          handlerLogger.debug('Reset function module connection after use');
        }
      } catch (resetError: any) {
        handlerLogger.error(`Failed to reset function module connection: ${resetError?.message || resetError}`);
      }
    }

  } catch (error: any) {
    return return_error(error);
  }
}
