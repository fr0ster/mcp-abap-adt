/**
 * GetFunctionModule Handler - Read ABAP FunctionModule via AdtClient
 *
 * Uses AdtClient.getFunctionModule().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionModule',
  description:
    'Retrieve ABAP function module definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['function_module_name'],
  },
} as const;

interface GetFunctionModuleArgs {
  function_module_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetFunctionModule MCP tool
 *
 * Uses AdtClient.getFunctionModule().read() - high-level read operation
 */
export async function handleGetFunctionModule(
  context: HandlerContext,
  args: GetFunctionModuleArgs,
) {
  const { connection, logger } = context;
  try {
    const { function_module_name, version = 'active' } =
      args as GetFunctionModuleArgs;

    // Validation
    if (!function_module_name) {
      return return_error(new Error('function_module_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const functionModuleName = function_module_name.toUpperCase();

    logger?.info(
      `Reading function module ${functionModuleName}, version: ${version}`,
    );

    try {
      // Read function module using AdtClient
      const functionModuleObject = client.getFunctionModule();
      const readResult = await functionModuleObject.read(
        { functionModuleName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`FunctionModule ${functionModuleName} not found`);
      }

      // Extract data from read result
      const functionModuleData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetFunctionModule completed successfully: ${functionModuleName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_module_name: functionModuleName,
            version,
            function_module_data: functionModuleData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading function module ${functionModuleName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `FunctionModule ${functionModuleName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `FunctionModule ${functionModuleName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
