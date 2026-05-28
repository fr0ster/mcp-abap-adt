/**
 * GetATCRunStatus Handler - Read ATC run status via AdtClient
 *
 * Polls /sap/bc/adt/atc/runs/{run_id} and returns the raw XML status body.
 * Look for status="finished" / status="cancelled" / status="running".
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetATCRunStatus',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Read the status of an asynchronous ATC run by run_id. Response body contains ' +
    'status="finished" once the run is complete; status="cancelled" if it was cancelled. ' +
    'Once finished, fetch results with GetATCFindings using the corresponding worklist_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunATC.',
      },
      with_long_polling: {
        type: 'boolean',
        description:
          'Use server-side long polling so the call returns sooner after the run finishes.',
        default: true,
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetATCRunStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
}

export async function handleGetATCRunStatus(
  context: HandlerContext,
  args: GetATCRunStatusArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id, with_long_polling } = args as GetATCRunStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = createAdtClient(connection, logger);
    const atc = client.getAtc();

    logger?.info(`Reading ATC run status for run_id: ${run_id}`);

    try {
      const response = await atc.getStatus(run_id, with_long_polling ?? true);
      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id,
            run_status: response.data,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: unknown) {
      const err = error as Error;
      logger?.error(
        `Error reading ATC run status ${run_id}: ${err?.message ?? String(error)}`,
      );
      return return_error(new Error(err?.message ?? String(error)));
    }
  } catch (error: unknown) {
    return return_error(error as Error);
  }
}
