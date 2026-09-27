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
  name: 'GetCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve CDS unit test run result for a run_id. Polls the run status a bounded number of times first — this member has no result of its own to answer for a run that has not finished, and no fixture in the corpus proves what one would look like, so this never guesses: it answers finished:false with the last status seen instead. ' +
    'Refused outright on legacy systems (BASIS < 7.50): AdtClientLegacy.getCdsUnitTest() throws — the CDS framework endpoints this needs are not present there (issue #207).',
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

interface GetCdsUnitTestResultArgs {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetCdsUnitTestResult(
  context: HandlerContext,
  args: GetCdsUnitTestResultArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_navigation_uris, format } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getResult` unchanged
  // — same `pollUntilFinished` reconstruction as `GetUnitTestResult`, for
  // the same reason (no status of its own to poll on this tool's surface).
  const cdsUnitTest = createAdtClient(connection, logger).getCdsUnitTest(
    ourUnitTest,
  );
  const detail = detailOf(args);

  return answer(
    { tool: 'GetCdsUnitTestResult', detail },
    () =>
      pollUntilFinished(
        (id, withLongPolling) =>
          cdsUnitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () =>
          cdsUnitTest.getResult(run_id, {
            analyse: analyseException,
            withNavigationUris: with_navigation_uris,
            format,
          }),
      ),
    // Task 28 fix round 1 — same finding, same fix as `GetUnitTestResult`.
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
