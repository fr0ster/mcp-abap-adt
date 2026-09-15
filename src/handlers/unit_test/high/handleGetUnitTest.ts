import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ABAP Unit test run status and result for a previously started run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunUnitTest.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestArgs {
  run_id: string;
}

export async function handleGetUnitTest(
  context: HandlerContext,
  args: GetUnitTestArgs,
) {
  const { connection, logger } = context;
  const { run_id } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which answered status and result together. That method no longer
  // exists on `AdtUnitTest` in v19 — `read`/`readMetadata` there take
  // `IUnitTestConfig` (`className`, the tests' source), not a run id.
  // Getting both halves of a run now needs two calls of its own, so this
  // is the one Get* handler in the unit-test family that follows the pair
  // shape, not the single-call one every sibling in this file uses.
  // Neither `getStatus` nor `getResult` takes an options object at all —
  // confirmed against the shipped `AdtUnitTest.d.ts` — so no `analyse` is
  // passed to either.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);

  return answer(
    { tool: 'GetUnitTest', detail: 'terse' },
    () =>
      pair(
        () => unitTest.getStatus(run_id),
        () => unitTest.getResult(run_id),
      ),
    ([status, result]: [AdtReading<unknown>, AdtReading<unknown>]) => ({
      success: true,
      run_id,
      run_status: status.value,
      run_result: result.value,
    }),
  );
}
