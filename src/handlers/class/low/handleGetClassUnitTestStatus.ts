/**
 * GetClassUnitTestStatus Handler - Fetch ABAP Unit run status
 *
 * Uses CrudClient.getClassUnitTestRunStatus from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { return_error, return_response, logger as baseLogger, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetClassUnitTestStatusLow",
  description: "[low-level] Retrieve ABAP Unit run status XML for a previously started run_id.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: {
        type: "string",
        description: "Run identifier returned by RunClassUnitTestsLow."
      },
      with_long_polling: {
        type: "boolean",
        description: "Optional flag to enable SAP long-polling (default true)."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["run_id"]
  }
} as const;

interface GetStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleGetClassUnitTestStatus(connection: AbapConnection, args: GetStatusArgs) {
  try {
    const {
      run_id,
      with_long_polling = true,
      session_id,
      session_state
    } = args as GetStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleGetClassUnitTestStatus',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    handlerLogger.info(`Fetching ABAP Unit status for run ${run_id}`);

    try {
      await client.getClassUnitTestRunStatus(run_id, with_long_polling);
      const statusResponse = client.getAbapUnitStatusResponse();

      if (!statusResponse) {
        throw new Error('SAP did not return ABAP Unit status response');
      }

      return return_response(statusResponse);
    } catch (error: any) {
      handlerLogger.error(`Error retrieving ABAP Unit status for run ${run_id}: ${error?.message || error}`);
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

