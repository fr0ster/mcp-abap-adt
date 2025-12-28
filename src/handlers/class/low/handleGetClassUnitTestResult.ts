/**
 * GetClassUnitTestResult Handler - Fetch ABAP Unit run result
 *
 * Uses AdtClient.getUnitTest().getResult from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtResponse } from '@mcp-abap-adt/interfaces';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClassUnitTestResultLow',
  description:
    '[low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunClassUnitTestsLow.',
      },
      with_navigation_uris: {
        type: 'boolean',
        description:
          'Optional flag to request navigation URIs in SAP response (default true).',
      },
      format: {
        type: 'string',
        enum: ['abapunit', 'junit'],
        description: "Preferred response format. Defaults to 'abapunit'.",
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['run_id'],
  },
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

export async function handleGetClassUnitTestResult(
  context: HandlerContext,
  args: GetResultArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id, with_navigation_uris, format, session_id, session_state } =
      args as GetResultArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    const client = new AdtClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
    }

    logger?.info(`Fetching ABAP Unit result for run ${run_id}`);

    try {
      const unitTest = client.getUnitTest() as any;
      const resultResponse = await unitTest.getResult(run_id, {
        withNavigationUris: with_navigation_uris,
        format,
      });

      if (!resultResponse) {
        throw new Error('SAP did not return ABAP Unit result response');
      }

      return return_response(resultResponse as IAdtResponse);
    } catch (error: any) {
      logger?.error(
        `Error retrieving ABAP Unit result for run ${run_id}: ${error?.message || error}`,
      );
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
