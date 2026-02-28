/**
 * GetUnitTestResult Handler - Read ABAP Unit test run result via AdtClient
 *
 * Uses AdtClient.getUnitTest().getResult() for result retrieval.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestResult',
  description: 'Retrieve ABAP Unit test run result for a run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
      with_navigation_uris: {
        type: 'boolean',
        description: 'Include navigation URIs in result if supported.',
        default: false,
      },
      format: {
        type: 'string',
        description: 'Result format: abapunit or junit.',
        enum: ['abapunit', 'junit'],
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestResultArgs {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
}

/**
 * Main handler for GetUnitTestResult MCP tool
 *
 * Uses AdtClient.getUnitTest().getResult()
 */
export async function handleGetUnitTestResult(
  context: HandlerContext,
  args: GetUnitTestResultArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id, with_navigation_uris, format } =
      args as GetUnitTestResultArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = createAdtClient(connection, logger);
    const unitTest = client.getUnitTest();

    logger?.info(`Reading unit test result for run_id: ${run_id}`);

    try {
      const readResult = await unitTest.read({ runId: run_id });

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id,
            run_result: readResult?.runResult,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading unit test result ${run_id}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
