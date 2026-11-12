import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';
import { type RunOutcome, readRunOnce, unfinishedRun } from '../shared/pollRun';
import { type ResultOnceArgs, readResultOnce } from '../shared/resultOnce';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve CDS unit test run result for a run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id) answers the run_id and that status at once, and any other status is an error stating what SAP answered.',
  inputSchema: z.object({
    run_id: z.string().describe('Run identifier returned by unit test run.'),
    with_navigation_uris: z
      .boolean()
      .default(false)
      .optional()
      .describe('Include navigation URIs in result if supported.'),
    format: z
      .enum(['abapunit', 'junit'])
      .optional()
      .describe('Result format: abapunit or junit.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetCdsUnitTestResultArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetCdsUnitTestResult(
  context: HandlerContext,
  args: GetCdsUnitTestResultArgs,
) {
  const { run_id, with_navigation_uris, format } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getResult` unchanged
  // — same `readRunOnce` reconstruction as `GetUnitTestResult`, for
  // the same reason (no status of its own to poll on this tool's surface).
  const cdsUnitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetCdsUnitTestResult', detail },
    () =>
      readRunOnce(
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
      !outcome.finished
        ? unfinishedRun(run_id, outcome.runStatus)
        : {
            success: true,
            run_id,
            finished: true,
            run_result:
              detail === 'raw' ? outcome.result.raw : outcome.result.value,
          },
  );
}

/**
 * Compact: the run's result read once — `getResult` alone, answered as SAP
 * gave it (`readResultOnce`). The run's status is the caller's to read.
 */
export async function handleGetCdsUnitTestResultOnce(
  context: HandlerContext,
  args: ResultOnceArgs,
  tool = 'HandlerCdsUnitTestResult',
) {
  return readResultOnce(context, tool, 'read CDS unit test result', args);
}
