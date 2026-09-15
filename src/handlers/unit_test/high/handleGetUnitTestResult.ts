import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestResult',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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

export async function handleGetUnitTestResult(
  context: HandlerContext,
  args: GetUnitTestResultArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_navigation_uris, format } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // Same v18-convenience departure as `GetUnitTestStatus`: fetching a
  // finished run's result is `getResult(runId, options?:
  // IUnitTestResultOptions)`, and `IUnitTestResultOptions` is
  // `{withNavigationUris?, format?}` — confirmed against the shipped
  // `AdtUnitTest.d.ts` — with no `analyse` field, so none is passed.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);

  return answer(
    { tool: 'GetUnitTestResult', detail: 'terse' },
    () =>
      unitTest.getResult(run_id, {
        withNavigationUris: with_navigation_uris,
        format,
      }),
    (result: AdtReading<unknown>) => ({
      success: true,
      run_id,
      run_result: result.value,
    }),
  );
}
