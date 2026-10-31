import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';
import {
  MAX_STATUS_POLLS_PROPERTY,
  maxStatusPollsOf,
  pollUntilFinished,
  type RunOutcome,
} from '../shared/pollRun';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ABAP Unit test run status and result for a previously started run_id: its status is read by up to max_status_polls long polls (default 5; ADT holds each open while the run is in progress); once the run finished, answers its status and result, else finished:false with the last status seen.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunUnitTest.',
      },
      max_status_polls: MAX_STATUS_POLLS_PROPERTY.max_status_polls,
      ...DETAIL_PROPERTY,
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestArgs {
  run_id: string;
  max_status_polls?: number;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
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
  const unitTest = testRunner(context, 'class');
  const maxStatusPolls = maxStatusPollsOf(args);
  if (maxStatusPolls instanceof Error) return return_error(maxStatusPolls);
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
        maxStatusPolls,
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
            message: `Run ${run_id} has not finished after ${maxStatusPolls} status checks; call GetUnitTest again to keep polling.`,
          },
  );
}
