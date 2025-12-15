/**
 * GetClassUnitTestResult Handler - Fetch ABAP Unit run result
 *
 * Uses CrudClient.getClassUnitTestRunResult from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { return_error, return_response, logger as baseLogger, getManagedConn
import { AbapConnection } from '@mcp-abap-adt/connection';ection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetClassUnitTestResultLow",
  description: "[low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: {
        type: "string",
        description: "Run identifier returned by RunClassUnitTestsLow."
      },
      with_navigation_uris: {
        type: "boolean",
        description: "Optional flag to request navigation URIs in SAP response (default true)."
      },
      format: {
        type: "string",
        enum: ["abapunit", "junit"],
        description: "Preferred response format. Defaults to 'abapunit'."
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

interface GetResultArgs {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleGetClassUnitTestResult(connection: AbapConnection, args: GetResultArgs) {
  try {
    const {
      run_id,
      with_navigation_uris,
      format,
      session_id,
      session_state
    } = args as GetResultArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleGetClassUnitTestResult',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    handlerLogger.info(`Fetching ABAP Unit result for run ${run_id}`);

    try {
      await client.getClassUnitTestRunResult(run_id, {
        withNavigationUris: with_navigation_uris,
        format
      });

      const resultResponse = client.getAbapUnitResultResponse();

      if (!resultResponse) {
        throw new Error('SAP did not return ABAP Unit result response');
      }

      return return_response(resultResponse);
    } catch (error: any) {
      handlerLogger.error(`Error retrieving ABAP Unit result for run ${run_id}: ${error?.message || error}`);
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

