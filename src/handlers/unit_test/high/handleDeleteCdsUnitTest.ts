/**
 * DeleteCdsUnitTest Handler - Delete CDS unit test class via AdtClient
 *
 * Uses AdtClient.getCdsUnitTest().delete() for CDS-specific delete operation.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteCdsUnitTest',
  description: 'Delete a CDS unit test class (global class).',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Global test class name (e.g., ZCL_CDS_TEST).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
    },
    required: ['class_name'],
  },
} as const;

interface DeleteCdsUnitTestArgs {
  class_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().delete() - CDS-specific delete operation
 */
export async function handleDeleteCdsUnitTest(
  context: HandlerContext,
  args: DeleteCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, transport_request } = args as DeleteCdsUnitTestArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const className = class_name.toUpperCase();

    const client = new AdtClient(connection, logger);
    const cdsUnitTest = client.getCdsUnitTest();

    logger?.info(`Deleting CDS unit test class: ${className}`);

    try {
      const deleteResult = await cdsUnitTest.delete({
        className,
        transportRequest: transport_request,
      });

      if (!deleteResult?.testClassState) {
        throw new Error(
          `Delete did not return a response for CDS unit test class ${className}`,
        );
      }

      logger?.info(`✅ DeleteCdsUnitTest completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            message: `CDS unit test class ${className} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting CDS unit test class ${className}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
