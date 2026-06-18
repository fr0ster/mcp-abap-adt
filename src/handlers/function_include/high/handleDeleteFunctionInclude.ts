/**
 * DeleteFunctionInclude Handler - Delete ABAP Function Group Include via AdtClient
 *
 * Uses AdtClient.getFunctionInclude().delete() for the high-level delete operation.
 * Note: the ADT backend rejects deletion of function module includes (those must be
 * deleted via the Function Builder); that server message propagates as an error.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Delete an ABAP function group include from the SAP system. Note: function module includes must be deleted via the Function Builder; the backend rejects such deletions. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., Z_MY_FG).',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZ_MY_FGF01).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

interface DeleteFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteFunctionInclude MCP tool
 */
export async function handleDeleteFunctionInclude(
  context: HandlerContext,
  args: DeleteFunctionIncludeArgs,
) {
  const { connection, logger } = context;
  try {
    const { function_group_name, include_name, transport_request } =
      args as DeleteFunctionIncludeArgs;

    if (!function_group_name || !include_name) {
      return return_error(
        new Error('function_group_name and include_name are required'),
      );
    }

    const client = createAdtClient(connection, logger);
    const functionGroupName = function_group_name.toUpperCase();
    const includeName = include_name.toUpperCase();

    logger?.info(
      `Starting function include deletion: ${includeName} in ${functionGroupName}`,
    );

    try {
      const obj = client.getFunctionInclude();
      const r = await obj.delete({
        functionGroupName,
        includeName,
        transportRequest: transport_request,
      });

      if (!r || !r.deleteResult) {
        throw new Error(
          `Delete did not return a response for function include ${includeName}`,
        );
      }

      logger?.info(
        `✅ DeleteFunctionInclude completed successfully: ${includeName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_group_name: functionGroupName,
            include_name: includeName,
            transport_request: transport_request || null,
            message: `Function include ${includeName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting function include ${includeName}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to delete function include: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function include ${includeName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Function include ${includeName} is locked by another user. Cannot delete.`;
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
