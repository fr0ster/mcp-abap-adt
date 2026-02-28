/**
 * DeleteUnitTest Handler - Delete ABAP Unit test run via AdtClient
 *
 * Uses AdtClient.getUnitTest().delete() for high-level delete operation.
 * Note: ADT does not support deleting unit test runs.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteUnitTest',
  description:
    'Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by CreateUnitTest/RunUnitTest.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface DeleteUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for DeleteUnitTest MCP tool
 *
 * Uses AdtClient.getUnitTest().delete() - high-level delete operation
 */
export async function handleDeleteUnitTest(
  context: HandlerContext,
  args: DeleteUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as DeleteUnitTestArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = createAdtClient(connection, logger);
    const unitTest = client.getUnitTest();

    logger?.info(`Deleting unit test run: ${run_id}`);

    try {
      await unitTest.delete({ runId: run_id });

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id,
            message: `Unit test run ${run_id} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting unit test run ${run_id}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
