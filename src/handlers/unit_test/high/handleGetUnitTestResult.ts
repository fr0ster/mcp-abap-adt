import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';
import { type RunOutcome, readRunOnce, unfinishedRun } from '../shared/pollRun';
import { type ResultOnceArgs, readResultOnce } from '../shared/resultOnce';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the result of the ABAP Unit test run named by run_id, for a run started with wait false or still running: its status is read once by long polling, SAP holding the read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, and a run SAP answers with another status answers the run_id and that status, read on by run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run id a unit test run answered.',
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
  const { run_id, with_navigation_uris, format } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // Same v18-convenience departure as `GetUnitTest`: the old `.read({runId})`
  // this handler called polled status internally before ever answering a
  // result. This tool has no status of its own to poll (`with_long_polling`
  // is not in its surface), so — per the fix ruling — it polls status first
  // via `readRunOnce` rather than guessing what `getResult` answers on
  // an unfinished run (uncaptured in the corpus). `getResult` takes
  // `analyseException` since adt-clients 23.
  const unitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetUnitTestResult', detail },
    () =>
      readRunOnce(
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
    // Task 28 fix round 1: `getResult`'s slot (`result`) is `structured` in
    // `READING_BY_SLOT`, so `outcome.result` is a real `AdtReading`, not a
    // bare value — `detail` was owed and missing. `raw` answers the wire
    // document; `terse`/`full` both answer the parse (no fixture proves a
    // safe further reduction of a test-run result — see this tool's own
    // description above), so `raw` is where the parameter genuinely differs.
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
export async function handleGetUnitTestResultOnce(
  context: HandlerContext,
  args: ResultOnceArgs,
  tool = 'HandlerUnitTestResult',
) {
  return readResultOnce(context, tool, 'read unit test result', args);
}
