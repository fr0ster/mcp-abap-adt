import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import {
  MAX_STATUS_POLLS,
  pollUntilFinished,
  type RunOutcome,
} from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve CDS unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetCdsUnitTestArgs {
  run_id: string;
}

export async function handleGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getStatus`/
  // `getResult` unchanged — same `pollUntilFinished` reconstruction and same
  // "neither takes an options object" as `GetUnitTest`. No fixture in the
  // corpus captures a CDS run specifically (only the plain-class
  // `unittest-run-passing`/`refusal-unittest-run-failing` cases are
  // captured), so this handler's tests use synthetic markers, not a claim
  // of CDS-specific corpus evidence.
  const cdsUnitTest = createAdtClient(connection, logger).getCdsUnitTest(
    ourUnitTest,
  );

  return answer(
    { tool: 'GetCdsUnitTest', detail: 'terse' },
    () =>
      pollUntilFinished(
        (id, withLongPolling) => cdsUnitTest.getStatus(id, withLongPolling),
        run_id,
        () => cdsUnitTest.getResult(run_id),
      ),
    (outcome: RunOutcome<unknown>) =>
      outcome.finished
        ? {
            success: true,
            run_id,
            finished: true,
            run_status: outcome.status.value,
            run_result: outcome.result,
          }
        : {
            success: true,
            run_id,
            finished: false,
            run_status: outcome.status.value,
            message: `Run ${run_id} has not finished after ${MAX_STATUS_POLLS} status checks; call GetCdsUnitTest again to keep polling.`,
          },
  );
}
