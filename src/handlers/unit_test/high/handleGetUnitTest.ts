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
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ABAP Unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result. ' +
    'On legacy systems (BASIS < 7.50) this always refuses: a legacy run answers its result synchronously inside ' +
    'RunUnitTest/CreateUnitTest, but AdtClientLegacy.getUnitTest() returns a new instance every time it is ' +
    'called, even on the same client, so this tool always refuses (issue #208).',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunUnitTest.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestArgs {
  run_id: string;
}

export async function handleGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
  const { connection, logger } = context;
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which answered status and result together. That method no longer
  // exists on `AdtUnitTest` in v19. Its work moved here: `pollUntilFinished`
  // reconstructs it (bounded status polling, only fetching the result once
  // the run is confirmed `FINISHED`) rather than fetching both blindly —
  // see `pollRun.ts`'s own comment for why a naive `pair()` was wrong here.
  // Neither `getStatus` nor `getResult` takes an options object at all —
  // confirmed against the shipped `AdtUnitTest.d.ts` — so no `analyse` is
  // passed to either.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);

  return answer(
    { tool: 'GetUnitTest', detail: 'terse' },
    () =>
      pollUntilFinished(
        (id, withLongPolling) => unitTest.getStatus(id, withLongPolling),
        run_id,
        () => unitTest.getResult(run_id),
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
            message: `Run ${run_id} has not finished after ${MAX_STATUS_POLLS} status checks; call GetUnitTest again to keep polling.`,
          },
  );
}
