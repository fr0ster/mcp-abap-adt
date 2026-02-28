/**
 * GetDataElement Handler - Read ABAP Data Element via AdtClient
 *
 * Uses AdtClient.getDataElement().read() for high-level read operation.
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
  name: 'GetDataElement',
  description:
    'Retrieve ABAP data element definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., Z_MY_DATA_ELEMENT).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['data_element_name'],
  },
} as const;

interface GetDataElementArgs {
  data_element_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetDataElement MCP tool
 *
 * Uses AdtClient.getDataElement().read() - high-level read operation
 */
export async function handleGetDataElement(
  context: HandlerContext,
  args: GetDataElementArgs,
) {
  const { connection, logger } = context;
  try {
    const { data_element_name, version = 'active' } =
      args as GetDataElementArgs;

    // Validation
    if (!data_element_name) {
      return return_error(new Error('data_element_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const dataElementName = data_element_name.toUpperCase();

    logger?.info(
      `Reading data element ${dataElementName}, version: ${version}`,
    );

    try {
      // Read data element using AdtClient
      const dataElementObject = client.getDataElement();
      const readResult = await dataElementObject.read(
        { dataElementName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Data element ${dataElementName} not found`);
      }

      // Extract data from read result
      const dataElementData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetDataElement completed successfully: ${dataElementName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            data_element_name: dataElementName,
            version,
            data_element_data: dataElementData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading data element ${dataElementName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read data element: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Data element ${dataElementName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Data element ${dataElementName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
