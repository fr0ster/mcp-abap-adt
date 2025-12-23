/**
 * GetInterface Handler - Read ABAP Interface via AdtClient
 *
 * Uses AdtClient.getInterface().read() for high-level read operation.
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
  name: 'GetInterface',
  description:
    'Retrieve ABAP interface definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_INTERFACE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['interface_name'],
  },
} as const;

interface GetInterfaceArgs {
  interface_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetInterface MCP tool
 *
 * Uses AdtClient.getInterface().read() - high-level read operation
 */
export async function handleGetInterface(
  context: HandlerContext,
  args: GetInterfaceArgs,
) {
  const { connection, logger } = context;
  try {
    const { interface_name, version = 'active' } = args as GetInterfaceArgs;

    // Validation
    if (!interface_name) {
      return return_error(new Error('interface_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const interfaceName = interface_name.toUpperCase();

    logger?.info(`Reading interface ${interfaceName}, version: ${version}`);

    try {
      // Read interface using AdtClient
      const interfaceObject = client.getInterface();
      const readResult = await interfaceObject.read(
        { interfaceName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Interface ${interfaceName} not found`);
      }

      // Extract data from read result
      const interfaceData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetInterface completed successfully: ${interfaceName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            interface_name: interfaceName,
            version,
            interface_data: interfaceData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading interface ${interfaceName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read interface: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Interface ${interfaceName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Interface ${interfaceName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
