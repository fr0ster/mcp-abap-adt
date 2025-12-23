/**
 * DeleteInterface Handler - Delete ABAP Interface via AdtClient
 *
 * Uses AdtClient.getInterface().delete() for high-level delete operation.
 * Includes deletion check before actual deletion.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteInterface',
  description:
    'Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_INTERFACE).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['interface_name'],
  },
} as const;

interface DeleteInterfaceArgs {
  interface_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteInterface MCP tool
 *
 * Uses AdtClient.getInterface().delete() - high-level delete operation with deletion check
 */
export async function handleDeleteInterface(
  context: HandlerContext,
  args: DeleteInterfaceArgs,
) {
  const { connection, logger } = context;
  try {
    const { interface_name, transport_request } = args as DeleteInterfaceArgs;

    // Validation
    if (!interface_name) {
      return return_error(new Error('interface_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const interfaceName = interface_name.toUpperCase();

    logger?.info(`Starting interface deletion: ${interfaceName}`);

    try {
      // Delete interface using AdtClient (includes deletion check)
      const interfaceObject = client.getInterface();
      const deleteResult = await interfaceObject.delete({
        interfaceName,
        transportRequest: transport_request,
      });

      if (!deleteResult || !deleteResult.deleteResult) {
        throw new Error(
          `Delete did not return a response for interface ${interfaceName}`,
        );
      }

      logger?.info(
        `✅ DeleteInterface completed successfully: ${interfaceName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            interface_name: interfaceName,
            transport_request: transport_request || null,
            message: `Interface ${interfaceName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting interface ${interfaceName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete interface: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Interface ${interfaceName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Interface ${interfaceName} is locked by another user. Cannot delete.`;
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
