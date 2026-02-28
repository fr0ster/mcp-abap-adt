/**
 * GetFunctionGroup Handler - Read ABAP FunctionGroup via AdtClient
 *
 * Uses AdtClient.getFunctionGroup().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionGroup',
  description:
    'Retrieve ABAP function group definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['function_group_name'],
  },
} as const;

interface GetFunctionGroupArgs {
  function_group_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetFunctionGroup MCP tool
 *
 * Uses AdtClient.getFunctionGroup().read() - high-level read operation
 */
export async function handleGetFunctionGroup(
  context: HandlerContext,
  args: GetFunctionGroupArgs,
) {
  const { connection, logger } = context;
  try {
    const { function_group_name, version = 'active' } =
      args as GetFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(
      `Reading function group ${functionGroupName}, version: ${version}`,
    );

    try {
      // Read function group using AdtClient
      const functionGroupObject = client.getFunctionGroup();
      const readResult = await functionGroupObject.read(
        { functionGroupName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`FunctionGroup ${functionGroupName} not found`);
      }

      // Extract data from read result
      const functionGroupData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetFunctionGroup completed successfully: ${functionGroupName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_group_name: functionGroupName,
            version,
            function_group_data: functionGroupData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading function group ${functionGroupName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read function group: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `FunctionGroup ${functionGroupName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `FunctionGroup ${functionGroupName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
