/**
 * GetPackage Handler - Read ABAP Package via AdtClient
 *
 * Uses AdtClient.getPackage().read() for high-level read operation.
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
  name: 'GetPackage',
  description:
    'Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., Z_MY_PACKAGE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['package_name'],
  },
} as const;

interface GetPackageArgs {
  package_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetPackage MCP tool
 *
 * Uses AdtClient.getPackage().read() - high-level read operation
 */
export async function handleGetPackage(
  context: HandlerContext,
  args: GetPackageArgs,
) {
  const { connection, logger } = context;
  try {
    const { package_name, version = 'active' } = args as GetPackageArgs;

    // Validation
    if (!package_name) {
      return return_error(new Error('package_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const packageName = package_name.toUpperCase();

    logger?.info(`Reading package ${packageName}, version: ${version}`);

    try {
      // Read package using AdtClient
      const packageObject = client.getPackage();
      const readResult = await packageObject.read(
        { packageName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Package ${packageName} not found`);
      }

      // Extract data from read result
      const packageData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetPackage completed successfully: ${packageName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            package_name: packageName,
            version,
            package_data: packageData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading package ${packageName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Package ${packageName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
