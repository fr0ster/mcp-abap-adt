import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runIsFinished } from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestStatus',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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

export async function handleGetCdsUnitTestStatus(
  context: HandlerContext,
  args: GetCdsUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_long_polling = true } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getStatus` unchanged
  // — same v18-convenience departure and same "no options object at all,
  // so no `analyse`" as `GetUnitTestStatus` (confirmed against the shipped
  // `AdtUnitTest.d.ts`/`AdtCdsUnitTest.d.ts`).
  const cdsUnitTest = createAdtClient(connection, logger).getCdsUnitTest(
    ourUnitTest,
  );

  return answer(
    { tool: 'GetCdsUnitTestStatus', detail: 'terse' },
    () => cdsUnitTest.getStatus(run_id, with_long_polling),
    (status: AdtReading<unknown>) => ({
      success: true,
      run_id,
      finished: runIsFinished(status.value),
      run_status: status.value,
    }),
  );
}
