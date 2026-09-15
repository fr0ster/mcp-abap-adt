import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runIsFinished } from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestStatus',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description: 'Retrieve ABAP Unit test run status for a run_id.',
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

interface GetUnitTestStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
}

export async function handleGetUnitTestStatus(
  context: HandlerContext,
  args: GetUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_long_polling = true } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which no longer exists on `AdtUnitTest` in v19 — that config shape is
  // `IUnitTestConfig` (`className`, not `runId`) and belongs to reading the
  // tests' source, not a run. Polling a run is `getStatus(runId,
  // withLongPolling?)`, which — confirmed against the shipped
  // `AdtUnitTest.d.ts` — takes NO options object at all, so there is no
  // `analyse` to hand it, unlike `read`/`readMetadata` on this same class.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);

  return answer(
    { tool: 'GetUnitTestStatus', detail: 'terse' },
    () => unitTest.getStatus(run_id, with_long_polling),
    (status: AdtReading<unknown>) => ({
      success: true,
      run_id,
      finished: runIsFinished(status.value),
      run_status: status.value,
    }),
  );
}
