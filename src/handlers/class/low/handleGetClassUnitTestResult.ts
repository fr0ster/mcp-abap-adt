/**
 * GetClassUnitTestResult Handler - Fetch ABAP Unit run result
 *
 * Uses AdtClient.getUnitTest().getResult from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 *
 * **Deliberately excluded from Task 14's `class/low` migration and its
 * `tsc`/`check-analyse` gates.** This reaches `getUnitTest()`, not
 * `getClass()` — a different family with its own result set (`ourUnitTest`,
 * already exported from `resultSets.ts`) and its own `analyseUnitTest`
 * strategy — and it stays on `client.getUnitTest() as any` until the task
 * that wires the unit-test members and that shared result set migrates it.
 *
 * Task 25 fixed the one `tsc` error this file owed the build (`IAdtResponse`
 * requiring type arguments under adt-clients 19 — TS2707): `resultResponse`
 * is still the legacy transport-frame object `client.getUnitTest() as any`
 * always returned, so the cast is now `as AxiosResponse` (which still has
 * `.data`) instead of `as IAdtResponse` (which as of 19.0.0 no longer does).
 * No behaviour changed — this is the same object, read the same way; only
 * the name of the lie in the cast changed to a true one.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClassUnitTestResultLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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

    const client = createAdtClient(connection, logger);

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

      return return_response(resultResponse as AxiosResponse);
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
