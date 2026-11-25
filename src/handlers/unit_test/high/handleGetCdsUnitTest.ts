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
  name: 'GetCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRead('the status and result', 'a CDS unit test run', 'waits'),
  ),
  inputSchema: z.object({
    run_id: z.string().describe('Run identifier returned by unit test run.'),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type GetCdsUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetCdsUnitTest',
        shape: 'assembled',
      },
      () => answeredGetCdsUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredGetCdsUnitTest(context, args);
}

async function answeredGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getStatus`/
  // `getResult` unchanged — same `readGivenRun` reconstruction and same
  // "neither takes an options object" as `GetUnitTest`. No fixture in the
  // corpus captures a CDS run specifically (only the plain-class
  // `unittest-run-passing`/`refusal-unittest-run-failing` cases are
  // captured), so this handler's tests use synthetic markers, not a claim
  // of CDS-specific corpus evidence.
  const cdsUnitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool: 'GetCdsUnitTest', detail },
    () =>
      readGivenRun(
        (id, withLongPolling) =>
          cdsUnitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () => cdsUnitTest.getResult(run_id, { analyse: analyseException }),
      ),
    // As `GetUnitTest`: the parse of both readings; `raw` is answered above.
    (outcome) => runOutcomeWithStatus(run_id, outcome),
  );
}
