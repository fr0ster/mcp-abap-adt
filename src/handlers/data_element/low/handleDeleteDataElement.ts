/**
 * DeleteDataElement Handler - Delete ABAP DataElement
 *
 * Uses AdtClient.deleteDataElement from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteDataElementLow',
  description:
    '[low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'DataElement name (e.g., Z_MY_PROGRAM).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['data_element_name'],
  },
} as const;

interface DeleteDataElementArgs {
  data_element_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteDataElement MCP tool
 *
 * Uses AdtClient.deleteDataElement - low-level single method call
 */
export async function handleDeleteDataElement(
  context: HandlerContext,
  args: DeleteDataElementArgs,
) {
  const { connection, logger } = context;
  try {
    const { data_element_name, transport_request } =
      args as DeleteDataElementArgs;

    // Validation
    if (!data_element_name) {
      return return_error(new Error('data_element_name is required'));
    }

    const client = createAdtClient(connection);
    const dataElementName = data_element_name.toUpperCase();

    logger?.info(`Starting data element deletion: ${dataElementName}`);

    try {
      // Delete data element
      const deleteState = await client.getDataElement().delete({
        dataElementName: dataElementName,
        transportRequest: transport_request,
      });
      const deleteResult = deleteState.deleteResult;

      if (!deleteResult) {
        throw new Error(
          `Delete did not return a response for data element ${dataElementName}`,
        );
      }

      logger?.info(
        `✅ DeleteDataElement completed successfully: ${dataElementName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            data_element_name: dataElementName,
            transport_request: transport_request || null,
            message: `DataElement ${dataElementName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting data element ${dataElementName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete data element: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DataElement ${dataElementName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `DataElement ${dataElementName} is locked by another user. Cannot delete.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request. Check if transport request is required and valid.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
