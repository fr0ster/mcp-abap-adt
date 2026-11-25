import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { unitTestRead } from '../../../lib/description/runs';
import { wireAnswer } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { readGivenRun, runOutcomeWithStatus } from '../shared/pollRun';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRead('the status and result', 'an ABAP Unit test run', 'waits'),
  ),
  inputSchema: z.object({
    run_id: z.string().describe('Run identifier returned by RunUnitTest.'),
    ...ASSEMBLED_DETAIL_SHAPE,
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
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetUnitTest',
        shape: 'assembled',
      },
      () => answeredGetUnitTest(context, { ...args, detail: 'full' }),
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
    (outcome) => runOutcomeWithStatus(run_id, outcome),
  );
}
