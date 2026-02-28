/**
 * GetMetadataExtension Handler - Read ABAP MetadataExtension via AdtClient
 *
 * Uses AdtClient.getMetadataExtension().read() for high-level read operation.
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
  name: 'GetMetadataExtension',
  description:
    'Retrieve ABAP metadata extension definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['metadata_extension_name'],
  },
} as const;

interface GetMetadataExtensionArgs {
  metadata_extension_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetMetadataExtension MCP tool
 *
 * Uses AdtClient.getMetadataExtension().read() - high-level read operation
 */
export async function handleGetMetadataExtension(
  context: HandlerContext,
  args: GetMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  try {
    const { metadata_extension_name, version = 'active' } =
      args as GetMetadataExtensionArgs;

    // Validation
    if (!metadata_extension_name) {
      return return_error(new Error('metadata_extension_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const metadataExtensionName = metadata_extension_name.toUpperCase();

    logger?.info(
      `Reading metadata extension ${metadataExtensionName}, version: ${version}`,
    );

    try {
      // Read metadata extension using AdtClient
      const metadataExtensionObject = client.getMetadataExtension();
      const readResult = await metadataExtensionObject.read(
        { name: metadataExtensionName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`MetadataExtension ${metadataExtensionName} not found`);
      }

      // Extract data from read result
      const metadataExtensionData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetMetadataExtension completed successfully: ${metadataExtensionName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            metadata_extension_name: metadataExtensionName,
            version,
            metadata_extension_data: metadataExtensionData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading metadata extension ${metadataExtensionName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `MetadataExtension ${metadataExtensionName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `MetadataExtension ${metadataExtensionName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
