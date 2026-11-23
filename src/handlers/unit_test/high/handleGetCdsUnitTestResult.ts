import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { wireAnswer } from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { readGivenRun, unfinishedRun } from '../shared/pollRun';
import { type ResultOnceArgs, readResultOnce } from '../shared/resultOnce';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve CDS unit test run result for a run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered.',
  inputSchema: z.object({
    run_id: requiredText('run_id is required').describe(
      'Run identifier returned by unit test run.',
    ),
    with_navigation_uris: z
      .boolean()
      .default(false)
      .optional()
      .describe('Include navigation URIs in result if supported.'),
    format: z
      .enum(['abapunit', 'junit'])
      .optional()
      .describe('Result format: abapunit or junit.'),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type GetCdsUnitTestResultArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetCdsUnitTestResult(
  context: HandlerContext,
  args: GetCdsUnitTestResultArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetCdsUnitTestResult',
        shape: 'assembled',
      },
      () => answeredGetCdsUnitTestResult(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetCdsUnitTestResult(context, args);
}

async function answeredGetCdsUnitTestResult(
  context: HandlerContext,
  args: GetCdsUnitTestResultArgs,
) {
  const { run_id, with_navigation_uris, format } = args; // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getResult` unchanged
  // — same `readGivenRun` reconstruction as `GetUnitTestResult`, for
  // the same reason (no status of its own to poll on this tool's surface).
  const cdsUnitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetCdsUnitTestResult', detail },
    () =>
      readGivenRun(
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
    (outcome) =>
      !outcome.finished
        ? unfinishedRun(run_id, outcome.runStatus)
        : {
            success: true,
            run_id,
            finished: true,
            run_result: outcome.result.value,
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
