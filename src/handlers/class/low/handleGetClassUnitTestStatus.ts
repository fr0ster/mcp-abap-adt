/**
 * GetClassUnitTestStatus Handler - Fetch ABAP Unit run status
 *
 * Uses AdtClient.getClassUnitTestRunStatus from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 *
 * **Deliberately excluded from Task 14's `class/low` migration and its
 * `tsc`/`check-analyse` gates.** This reaches `getUnitTest()`, not
 * `getClass()` — a different family with its own result set (`ourUnitTest`,
 * already exported from `resultSets.ts`) and its own `analyseUnitTest`
 * strategy — and it stays on `client.getUnitTest() as any` until the task
 * that wires the unit-test members and that shared result set migrates it
 * (it is one of the "twenty-three tools that reach a legacy contract"). The
 * carve-out is real, but nothing holds it in place any more: `client.
 * getUnitTest() as any` silences the compiler rather than naming an error
 * for it to keep finding, and the build reports zero errors with this file
 * exactly as it is. Nothing but this comment marks the carve-out until the
 * task that wires the unit-test members reads it.
 *
 * **Fix round 1, task 25.** The first pass here cast `statusResponse as
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
 * **Task 28: why this tool carries no `detail`.** `GetUnitTestStatus`
 * (`unit_test/high/`), the migrated, generic sibling this one predates, DOES
 * have `detail` — its `getStatus` runs through `resultsFor(unitTestDocuments)`
 * and answers a real `AdtReading` with `raw` genuinely distinct from `value`.
 * This handler is still on the pre-migration `client.getUnitTest() as any`
 * escape hatch named above: `(value: string) => value` treats the answer as
 * an already-opaque string, not an `AdtReading`, because nothing here builds
 * one. There are no layers to choose between until the carve-out itself is
 * closed — adding `detail` to a tool with no reading behind it would be the
 * lie this migration's one rule exists to prevent, not a fix.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClassUnitTestStatusLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Retrieve ABAP Unit run status XML for a previously started run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunClassUnitTestsLow.',
      },
      with_long_polling: {
        type: 'boolean',
        description: 'Optional flag to enable SAP long-polling (default true).',
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

export async function handleGetClassUnitTestStatus(
  context: HandlerContext,
  args: GetStatusArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      run_id,
      with_long_polling = true,
      session_id,
      session_state,
    } = args as GetStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }
    const client = createAdtClient(connection, logger);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    logger?.info(`Fetching ABAP Unit status for run ${run_id}`);

    const unitTest = client.getUnitTest();

    return await answer(
      { tool: 'GetClassUnitTestStatusLow', detail: 'terse' },
      () =>
        unitTest.getStatus(run_id, with_long_polling, {
          analyse: analyseException,
        }),
      (value: string) => value,
    );
  } catch (error: any) {
    return return_error(error);
  }
}
