/**
 * UpdateCdsUnitTest Handler - Update CDS unit test class via AdtClient
 *
 * Uses AdtClient.getCdsUnitTest().update() for CDS-specific update operation.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsUnitTest',
  description: 'Update a CDS unit test class local test class source code.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Global test class name (e.g., ZCL_CDS_TEST).',
      },
      test_class_source: {
        type: 'string',
        description: 'Updated local test class ABAP source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
    },
    required: ['class_name', 'test_class_source'],
  },
} as const;

interface UpdateCdsUnitTestArgs {
  class_name: string;
  test_class_source: string;
  transport_request?: string;
}

/**
 * Main handler for UpdateCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().update() - CDS-specific update operation
 */
export async function handleUpdateCdsUnitTest(
  context: HandlerContext,
  args: UpdateCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, test_class_source, transport_request } =
      args as UpdateCdsUnitTestArgs;

    if (!class_name || !test_class_source) {
      return return_error(
        new Error('Missing required parameters: class_name, test_class_source'),
      );
    }

    const className = class_name.toUpperCase();

    const client = new AdtClient(connection, logger);
    const cdsUnitTest = client.getCdsUnitTest();

    logger?.info(`Updating CDS unit test class source: ${className}`);

    try {
      const updateResult = await cdsUnitTest.update({
        className,
        testClassSource: test_class_source,
        transportRequest: transport_request,
      });

      if (!updateResult?.testClassState) {
        throw new Error(
          `Update did not return a response for CDS unit test class ${className}`,
        );
      }

      logger?.info(`✅ UpdateCdsUnitTest completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            test_class_state: updateResult.testClassState,
            message: `CDS unit test class ${className} updated successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating CDS unit test class ${className}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
