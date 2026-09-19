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
 * The carve-out is real, but nothing holds it in place any more: `client.
 * getUnitTest() as any` silences the compiler rather than naming an error
 * for it to keep finding, and the build reports zero errors with this file
 * exactly as it is. Nothing but this comment marks the carve-out until the
 * task that wires the unit-test members reads it.
 *
 * **Fix round 1, task 25.** The first pass here cast `resultResponse as
 * AxiosResponse`, on the wrong belief that `getUnitTest()`'s members still
 * answered the pre-19 transport frame. They do not: `ITestRunInformation`
 * (`@mcp-abap-adt/interfaces`) already declares `getResult`/`getStatus` as
 * `Promise<IAdtResponse<T>>`, and `AdtUnitTest.d.ts` confirms the shipped
 * class implements exactly that — `getUnitTest() as any` erases the type,
 * not the runtime shape. `IAdtResponse` has no `.data` at all, so every call
 * answered `{isError:false, content:[{text: undefined}]}` regardless of
 * `.ok` — a refusal reported as success, the masking class this repository
 * has removed three times elsewhere. Fixed by unwrapping through `answer()`
 * instead of guessing at a shape.
 *
 * **Fix round 2, task 25.** The outer `try`/`catch` this handler had before
 * fix round 1 is restored: `createAdtClient`/`restoreSessionInConnection`
 * run before `answer()` is reached and are not inside it, so a throw there
 * (a direct caller, e.g. a soft-mode integration test that calls the
 * handler function itself rather than through the server) used to surface
 * as a rejected promise instead of an error result. `RunClassUnitTests.ts`,
 * the still-unmigrated sibling in this directory, keeps the same guard.
 *
 * **Task 28: why this tool carries no `detail`.** Same reasoning as
 * `GetClassUnitTestStatus.ts` in this directory: the migrated, generic
 * `GetUnitTestResult` (`unit_test/high/`) DOES have `detail`, because its
 * `getResult` answers a real `AdtReading`. This handler is still on the
 * pre-migration `client.getUnitTest() as any` escape hatch, treating the
 * answer as an already-opaque value with no reading behind it — nothing to
 * choose a level of until the carve-out above is closed.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClassUnitTestResultLow',
  available_in: ['onprem', 'cloud'] as const,
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
    }

    logger?.info(`Fetching ABAP Unit result for run ${run_id}`);

    const unitTest = client.getUnitTest() as any;

    return await answer(
      { tool: 'GetClassUnitTestResultLow', detail: 'terse' },
      () =>
        unitTest.getResult(run_id, {
          withNavigationUris: with_navigation_uris,
          format,
        }),
      (value: string) => value,
    );
  } catch (error: any) {
    return return_error(error);
  }
}
