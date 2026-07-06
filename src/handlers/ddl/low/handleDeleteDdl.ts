/**
 * DeleteDdlLow Handler - Delete ABAP DDL Source
 *
 * Uses AdtClient.getDdl().delete from @mcp-abap-adt/adt-clients.
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
  name: 'DeleteDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Delete a DDL source from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_PROGRAM).',
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
 * Uses AdtClient.getDdl().delete - low-level single method call
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

    logger?.info(`Starting DDL source deletion: ${ddlName}`);

    try {
      // Delete DDL source
      const deleteState = await client.getDdl().delete({
        ddlName: ddlName,
        transportRequest: transport_request,
      });
      const deleteResult = deleteState.deleteResult;

      if (!deleteResult) {
        throw new Error(
          `Delete did not return a response for DDL source ${ddlName}`,
        );
      }

      logger?.info(`✅ DeleteDdlLow completed successfully: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            transport_request: transport_request || null,
            message: `DDL source ${ddlName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting DDL source ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DDL source ${ddlName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `DDL source ${ddlName} is locked by another user. Cannot delete.`;
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
