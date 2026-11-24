import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { UNIT_TEST_RESULT, unitTestRead } from '../../../lib/description/runs';
import { type AnswerTable, answerAt, wireAnswer } from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import {
  type RunOutcome,
  readGivenRun,
  runOutcomeAnswer,
} from '../shared/pollRun';
import { type ResultOnceArgs, readResultOnce } from '../shared/resultOnce';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRead(
      'the result',
      'an ABAP Unit test run',
      UNIT_TEST_RESULT,
      'waits',
    ),
  ),
  inputSchema: z.object({
    run_id: requiredText('run_id is required').describe(
      'Run id a unit test run answered.',
    ),
    with_navigation_uris: z
      .boolean()
      .optional()
      .describe('Include navigation URIs in result if supported.'),
    format: z
      .enum(['abapunit', 'junit'])
      .optional()
      .describe('Result format: abapunit or junit.'),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type GetUnitTestResultArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetUnitTestResult(
  context: HandlerContext,
  args: GetUnitTestResultArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetUnitTestResult',
        shape: 'assembled',
      },
      () => answeredGetUnitTestResult(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetUnitTestResult(context, args);
}

async function answeredGetUnitTestResult(
  context: HandlerContext,
  args: GetUnitTestResultArgs,
) {
  const { run_id, with_navigation_uris, format } = args; // Same v18-convenience departure as `GetUnitTest`: the old `.read({runId})`
  // this handler called polled status internally before ever answering a
  // result. This tool has no status of its own to poll (`with_long_polling`
  // is not in its surface), so — per the fix ruling — it polls status first
  // via `readGivenRun` rather than guessing what `getResult` answers on
  // an unfinished run (uncaptured in the corpus). `getResult` takes
  // `analyseException` since adt-clients 23.
  const unitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetUnitTestResult', detail },
    () =>
      readGivenRun(
        (id, withLongPolling) =>
          unitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () =>
          unitTest.getResult(run_id, {
            analyse: analyseException,
            withNavigationUris: with_navigation_uris,
            format,
          }),
      ),
    answerAt(resultAnswers(run_id), levelOf(args)),
  );
}

/**
 * The run's answer per level: every level reached answers the parse (no
 * fixture proves a safe further reduction of a test-run result); `raw`
 * never reaches this table — its documents are answered by `wireAnswer`.
 */
function resultAnswers<T>(
  runId: string,
): AnswerTable<RunOutcome<{ value: T }>, object> {
  const parsed = (outcome: RunOutcome<{ value: T }>) =>
    runOutcomeAnswer(runId, outcome);
  return { terse: parsed, medium: parsed, full: parsed, raw: parsed };
}

/**
 * Compact: the run's result read once — `getResult` alone, answered as SAP
 * gave it (`readResultOnce`). The run's status is the caller's to read.
 */
export async function handleGetUnitTestResultOnce(
  context: HandlerContext,
  args: ResultOnceArgs,
  tool = 'HandlerUnitTestResult',
) {
  return readResultOnce(context, tool, 'read unit test result', args);
}
