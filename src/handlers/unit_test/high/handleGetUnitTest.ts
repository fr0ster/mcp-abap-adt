import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { wireAnswer } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { readGivenRun, unfinishedRun } from '../shared/pollRun';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ABAP Unit test run status and result for a previously started run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its status and result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered.',
  inputSchema: z.object({
    run_id: z.string().describe('Run identifier returned by RunUnitTest.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(context.connection, 'assembled', () =>
      answeredGetUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetUnitTest(context, args);
}

async function answeredGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which answered status and result together. That method no longer
  // exists on `AdtUnitTest` in v19. Its work moved here: `readGivenRun`
  // reconstructs it (one long-polled status read, then the result once
  // the run is confirmed `FINISHED`) rather than fetching both blindly —
  // see `pollRun.ts`'s own comment for why a naive `pair()` was wrong here.
  // `getStatus` and `getResult` take the run and, since adt-clients 23,
  // options with `analyse`; `analyseException` is passed to both.
  const unitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetUnitTest', detail },
    () =>
      readGivenRun(
        (id, withLongPolling) =>
          unitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () => unitTest.getResult(run_id, { analyse: analyseException }),
      ),
    // Every level reached here answers the parse of both readings: no
    // fixture in the corpus proves a further reduction of a test-run result
    // is safe. `raw` never reaches here — the status and result documents
    // are answered as SAP sent them (`wireAnswer`, above).
    (outcome) =>
      !outcome.finished
        ? unfinishedRun(run_id, outcome.runStatus)
        : {
            success: true,
            run_id,
            finished: true,
            run_status: outcome.status.value,
            run_result: outcome.result.value,
          },
  );
}
