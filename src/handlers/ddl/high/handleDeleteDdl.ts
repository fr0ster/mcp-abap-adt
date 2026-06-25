/**
 * DeleteView Handler - Delete ABAP View via AdtClient
 *
 * Uses AdtClient.getDdl().delete() for high-level delete operation.
 * Includes deletion check before actual deletion.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Delete an ABAP view from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'View name (e.g., Z_MY_VIEW).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['ddl_name'],
  },
} as const;

interface DeleteDdlArgs {
  ddl_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteDdl MCP tool
 *
 * Uses AdtClient.getDdl().delete() - high-level delete operation with deletion check
 */
export async function handleDeleteDdl(
  context: HandlerContext,
  args: DeleteDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, transport_request } = args as DeleteDdlArgs;

    // Validation
    if (!ddl_name) {
      return return_error(new Error('ddl_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting view deletion: ${ddlName}`);

    try {
      // Delete view using AdtClient (includes deletion check)
      const viewObject = client.getDdl();
      const deleteResult = await viewObject.delete({
        ddlName: ddlName,
        transportRequest: transport_request,
      });

      if (!deleteResult || !deleteResult.deleteResult) {
        throw new Error(`Delete did not return a response for view ${ddlName}`);
      }

      logger?.info(`✅ DeleteDdl completed successfully: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            transport_request: transport_request || null,
            message: `View ${ddlName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting view ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${ddlName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `View ${ddlName} is locked by another user. Cannot delete.`;
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
