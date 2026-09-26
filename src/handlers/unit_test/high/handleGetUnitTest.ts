import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import {
  MAX_STATUS_POLLS,
  pollUntilFinished,
  type RunOutcome,
} from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP Unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunUnitTest.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestArgs {
  run_id: string;
  detail?: 'terse' | 'full' | 'raw';
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
  // `getStatus` and `getResult` take the run and, since adt-clients 23,
  // options with `analyse`; `analyseException` is passed to both.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetUnitTest', detail },
    () =>
      pollUntilFinished(
        (id, withLongPolling) =>
          unitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () => unitTest.getResult(run_id, { analyse: analyseException }),
      ),
    // Task 28 fix round 1: `status` and, once finished, `result` are both
    // `structured` `AdtReading`s (`getResult`'s slot is `structured` in
    // `READING_BY_SLOT`, same as `getStatus`'s) — a real reading was behind
    // this answer all along, and `detail` was owed. `raw` answers the wire
    // documents; `terse` and `full` both answer the parse, because no
    // fixture in the corpus proves a further reduction of a test-run result
    // is safe (see `GetCdsUnitTestResult`'s own doc comment on the same
    // point) — `detail` is still genuinely different at `raw`, which is
    // what makes the parameter real rather than decorative.
    (outcome: RunOutcome<AdtReading<unknown>>) =>
      outcome.finished
        ? {
            success: true,
            run_id,
            finished: true,
            run_status:
              detail === 'raw' ? outcome.status.raw : outcome.status.value,
            run_result:
              detail === 'raw' ? outcome.result?.raw : outcome.result?.value,
          }
        : {
            success: true,
            run_id,
            finished: false,
            run_status:
              detail === 'raw' ? outcome.status.raw : outcome.status.value,
            message: `Run ${run_id} has not finished after ${MAX_STATUS_POLLS} status checks; call GetUnitTest again to keep polling.`,
          },
  );
}
