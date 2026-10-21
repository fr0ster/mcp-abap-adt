/**
 * A unit-test run's result, read once (compact `HandlerUnitTestResult`,
 * `HandlerCdsUnitTestResult`, and `HandlerGet` of a `UNIT_TEST` /
 * `CDS_UNIT_TEST` run; spec §4.6).
 *
 * One request: `GET /sap/bc/adt/abapunit/results/{run_id}`, answered as SAP
 * gave it. The run's status is the caller's to read
 * (`GET /sap/bc/adt/abapunit/runs/{run_id}`); a result read before the status
 * says `FINISHED` is whatever SAP answers for it, and a finished run's result
 * carries `executionTime` on each test method.
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { testRunner } from './runTests';

export interface ResultOnceArgs {
  run_id?: unknown;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
  detail?: 'terse' | 'full' | 'raw';
}

/**
 * `getResult` alone, a failure carrying `step`: `{ success, run_id, run_result }`, `run_result` the
 * parse of SAP's document (`detail: 'raw'`: the document itself).
 */
export async function readResultOnce(
  context: HandlerContext,
  tool: string,
  step: string,
  args: ResultOnceArgs,
) {
  const runId = typeof args?.run_id === 'string' ? args.run_id.trim() : '';
  if (!runId) return return_error(new Error('run_id is required'));

  const runner = testRunner(context, 'class');
  const detail = detailOf(args);

  return answer(
    { tool, detail },
    atStep(step, () =>
      runner.getResult(runId, {
        analyse: analyseException,
        withNavigationUris: args.with_navigation_uris,
        format: args.format,
      }),
    ),
    (result: AdtReading<unknown>) => ({
      success: true,
      run_id: runId,
      run_result: detail === 'raw' ? result.raw : result.value,
    }),
  );
}
