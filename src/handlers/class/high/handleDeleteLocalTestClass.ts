/**
 * DeleteLocalTestClass Handler - Delete Local Test Class via AdtClient
 *
 * Uses AdtClient.getLocalTestClass().delete() for high-level delete operation.
 * Deletes by updating with empty code.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteLocalTestClass',
  description:
    'Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects).',
      },
      activate_on_delete: {
        type: 'boolean',
        description:
          'Activate parent class after deleting test class. Default: false',
        default: false,
      },
    },
    required: ['class_name'],
  },
} as const;

interface DeleteLocalTestClassArgs {
  class_name: string;
  transport_request?: string;
  activate_on_delete?: boolean;
}

/**
 * Main handler for DeleteLocalTestClass MCP tool
 *
 * Uses AdtClient.getLocalTestClass().delete() - high-level delete operation
 */
export async function handleDeleteLocalTestClass(
  context: HandlerContext,
  args: DeleteLocalTestClassArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      transport_request,
      activate_on_delete = false,
    } = args as DeleteLocalTestClassArgs;

    // Validation
    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Deleting local test class for ${className}`);

    try {
      // Delete local test class using AdtClient (updates with empty code)
      const localTestClass = client.getLocalTestClass();
      const deleteResult = await localTestClass.delete({
        className,
        transportRequest: transport_request,
      });

      if (!deleteResult) {
        throw new Error(
          `Delete did not return a result for local test class in ${className}`,
        );
      }

      // If activation requested, activate parent class
      if (activate_on_delete) {
        await client.getClass().activate({ className });
      }

      logger?.info(
        `✅ DeleteLocalTestClass completed successfully: ${className}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_delete,
            message: `Local test class deleted successfully from ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting local test class for ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete local test class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local test class for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
