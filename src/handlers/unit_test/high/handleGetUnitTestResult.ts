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
  name: 'GetUnitTestResult',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ABAP Unit test run result for a run_id. Polls the run status a bounded number of times first — this member has no result of its own to answer for a run that has not finished, and no fixture in the corpus proves what one would look like, so this never guesses: it answers finished:false with the last status seen instead. ' +
    'On legacy systems (BASIS < 7.50) this always refuses: a legacy run answers its result synchronously inside ' +
    'RunUnitTest/CreateUnitTest, but AdtClientLegacy.getUnitTest() returns a new instance every time it is ' +
    'called, even on the same client, so this tool always refuses (issue #208).',
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
      ...DETAIL_PROPERTY,
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestResultArgs {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetUnitTestResult(
  context: HandlerContext,
  args: GetUnitTestResultArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_navigation_uris, format } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // Same v18-convenience departure as `GetUnitTest`: the old `.read({runId})`
  // this handler called polled status internally before ever answering a
  // result. This tool has no status of its own to poll (`with_long_polling`
  // is not in its surface), so — per the fix ruling — it polls status first
  // via `pollUntilFinished` rather than guessing what `getResult` answers on
  // an unfinished run (uncaptured in the corpus). `getResult`'s options
  // (`IUnitTestResultOptions`) carry no `analyse` field, confirmed against
  // the shipped `AdtUnitTest.d.ts`.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetUnitTestResult', detail },
    () =>
      pollUntilFinished(
        (id, withLongPolling) => unitTest.getStatus(id, withLongPolling),
        run_id,
        () =>
          unitTest.getResult(run_id, {
            withNavigationUris: with_navigation_uris,
            format,
          }),
      ),
    // Task 28 fix round 1: `getResult`'s slot (`result`) is `structured` in
    // `READING_BY_SLOT`, so `outcome.result` is a real `AdtReading`, not a
    // bare value — `detail` was owed and missing. `raw` answers the wire
    // document; `terse`/`full` both answer the parse (no fixture proves a
    // safe further reduction of a test-run result — see this tool's own
    // description above), so `raw` is where the parameter genuinely differs.
    (outcome: RunOutcome<AdtReading<unknown>>) =>
      outcome.finished
        ? {
            success: true,
            run_id,
            finished: true,
            run_result:
              detail === 'raw' ? outcome.result?.raw : outcome.result?.value,
          }
        : {
            success: true,
            run_id,
            finished: false,
            run_status:
              detail === 'raw' ? outcome.status.raw : outcome.status.value,
            message: `Run ${run_id} has not finished after ${MAX_STATUS_POLLS} status checks; no result to fetch yet.`,
          },
  );
}
