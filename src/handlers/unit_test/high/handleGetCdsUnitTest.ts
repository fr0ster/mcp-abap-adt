/**
 * GetCdsUnitTest Handler - Read CDS unit test run status/result via AdtClient
 *
 * Uses AdtClient.getCdsUnitTest().read() for high-level read operation.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTest',
  description:
    'Retrieve CDS unit test run status and result for a previously started run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetCdsUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for GetCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().read() - high-level read operation
 */
export async function handleGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as GetCdsUnitTestArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = new AdtClient(connection, logger);
    const cdsUnitTest = client.getCdsUnitTest();

    logger?.info(
      `Reading CDS unit test run status/result for run_id: ${run_id}`,
    );

    try {
      const readResult = await cdsUnitTest.read({ runId: run_id });

      if (!readResult) {
        throw new Error(`CDS unit test run ${run_id} not found`);
      }

      logger?.info(
        `✅ GetCdsUnitTest completed successfully for run_id: ${run_id}`,
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
        `Error reading CDS unit test run ${run_id}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to read CDS unit test run: ${error.message || String(error)}`;
      if (error.response?.status === 404) {
        errorMessage = `CDS unit test run ${run_id} not found.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
