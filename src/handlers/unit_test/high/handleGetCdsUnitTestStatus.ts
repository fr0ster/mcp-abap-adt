/**
 * GetCdsUnitTestStatus Handler - Read CDS unit test run status via AdtClient
 *
 * Uses AdtClient.getCdsUnitTest().getStatus() for status retrieval.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestStatus',
  description: 'Retrieve CDS unit test run status for a run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
      with_long_polling: {
        type: 'boolean',
        description: 'Enable long polling while waiting for status.',
        default: true,
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetCdsUnitTestStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
}

/**
 * Main handler for GetCdsUnitTestStatus MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().getStatus()
 */
export async function handleGetCdsUnitTestStatus(
  context: HandlerContext,
  args: GetCdsUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as GetCdsUnitTestStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = createAdtClient(connection, logger);
    const cdsUnitTest = client.getCdsUnitTest();

    logger?.info(`Reading CDS unit test status for run_id: ${run_id}`);

    try {
      const readResult = await cdsUnitTest.read({ runId: run_id });

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id,
            run_status: readResult?.runStatus,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading CDS unit test status ${run_id}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
