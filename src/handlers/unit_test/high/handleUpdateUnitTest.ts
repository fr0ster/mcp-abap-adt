/**
 * UpdateUnitTest Handler - Update ABAP Unit test run via AdtClient
 *
 * Uses AdtClient.getUnitTest().update() for high-level update operation.
 * Note: ADT does not support update for unit test runs.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateUnitTest',
  description:
    'Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.',
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

interface UpdateUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for UpdateUnitTest MCP tool
 *
 * Uses AdtClient.getUnitTest().update() - high-level update operation
 */
export async function handleUpdateUnitTest(
  context: HandlerContext,
  args: UpdateUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as UpdateUnitTestArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = new AdtClient(connection, logger);
    const unitTest = client.getUnitTest();

    logger?.info(`Updating unit test run: ${run_id}`);

    try {
      await unitTest.update({ runId: run_id });

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id,
            message: `Unit test run ${run_id} updated successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating unit test run ${run_id}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
