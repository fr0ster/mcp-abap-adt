import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';
import { pollUntilFinished, type RunOutcome } from '../shared/pollRun';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve CDS unit test run status and result for a previously started run_id: its status is read by long polling until SAP answers the run finished, then its status and result are answered; the call lasts as long as the run.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['run_id'],
  },
} as const;

interface GetCdsUnitTestArgs {
  run_id: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getStatus`/
  // `getResult` unchanged — same `pollUntilFinished` reconstruction and same
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
      pollUntilFinished(
        (id, withLongPolling) =>
          cdsUnitTest.getStatus(id, withLongPolling, {
            analyse: analyseException,
          }),
        run_id,
        () => cdsUnitTest.getResult(run_id, { analyse: analyseException }),
      ),
    // Task 28 fix round 1 — same finding, same fix as `GetUnitTest`: both
    // readings behind this answer are `structured`, and `detail` was owed.
    (outcome: RunOutcome<AdtReading<unknown>>) => ({
      success: true,
      run_id,
      finished: true,
      run_status: detail === 'raw' ? outcome.status.raw : outcome.status.value,
      run_result: detail === 'raw' ? outcome.result.raw : outcome.result.value,
    }),
  );
}
