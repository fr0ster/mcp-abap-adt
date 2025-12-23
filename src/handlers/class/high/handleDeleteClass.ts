/**
 * DeleteClass Handler - Delete ABAP Class via AdtClient
 *
 * Uses AdtClient.getClass().delete() for high-level delete operation.
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
  name: 'DeleteClass',
  description:
    'Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['class_name'],
  },
} as const;

interface DeleteClassArgs {
  class_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteClass MCP tool
 *
 * Uses AdtClient.getClass().delete() - high-level delete operation with deletion check
 */
export async function handleDeleteClass(
  context: HandlerContext,
  args: DeleteClassArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, transport_request } = args as DeleteClassArgs;

    // Validation
    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Starting class deletion: ${className}`);

    try {
      // Delete class using AdtClient (includes deletion check)
      const classObject = client.getClass();
      const deleteResult = await classObject.delete({
        className,
        transportRequest: transport_request,
      });

      if (!deleteResult || !deleteResult.deleteResult) {
        throw new Error(
          `Delete did not return a response for class ${className}`,
        );
      }

      logger?.info(`✅ DeleteClass completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            message: `Class ${className} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting class ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Class ${className} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user. Cannot delete.`;
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
