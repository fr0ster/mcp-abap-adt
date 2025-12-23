/**
 * GetUnitTest Handler - Read ABAP Unit test status/result via AdtClient
 *
 * Uses AdtClient.getUnitTest().read() for high-level read operation.
 * Retrieves test run status and result for a previously started run.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  description:
    'Retrieve ABAP Unit test run status and result for a previously started run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunUnitTest.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for GetUnitTest MCP tool
 *
 * Uses AdtClient.getUnitTest().read() - high-level read operation
 */
export async function handleGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as GetUnitTestArgs;

    // Validation
    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = new AdtClient(connection, logger);
    const unitTest = client.getUnitTest();

    logger?.info(`Reading unit test run status/result for run_id: ${run_id}`);

    try {
      // Read test run using AdtClient
      const readResult = await unitTest.read({ runId: run_id });

      if (!readResult) {
        throw new Error(`Unit test run ${run_id} not found`);
      }

      logger?.info(
        `✅ GetUnitTest completed successfully for run_id: ${run_id}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id: readResult.runId,
            run_status: readResult.runStatus,
            run_result: readResult.runResult,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading unit test run ${run_id}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read unit test run: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Unit test run ${run_id} not found.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
