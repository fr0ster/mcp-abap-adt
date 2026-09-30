/**
 * Running ABAP Unit tests for a tool: start the run, wait for it within a
 * bound, and answer the result — one call, so a model asking "run the tests"
 * needs no second tool unless the run outlasts the bound.
 *
 * The runners are adt-clients 24's, one per object type
 * (`AdtExecutor.get{Class,Program,FunctionGroup,FunctionModule}TestRunner`).
 * They share `getStatus`/`getResult` by run id, so any of them answers about
 * any run; `ourUnitTest` is the one result set they all read with.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  analyseUnitTestStart,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtAnalyseOptions,
  IAdtError,
  IAdtResponse,
  IUnitTestResultOptions,
} from '@mcp-abap-adt/interfaces-adt';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import {
  MAX_STATUS_POLLS,
  pollUntilFinished,
  type RunOutcome,
} from './pollRun';

/** The object types a run can be started for, each with its own runner. */
export type TestCarrier =
  | 'class'
  | 'program'
  | 'functionGroup'
  | 'functionModule';

/**
 * What a tool needs of a runner: start one by the object's name, and ask
 * about a run by its id. Declared here because adt-clients 24 exports the
 * runners' result sets from its root but not the runner classes.
 */
export interface IUnitTestRunner {
  run(
    objectName: string,
    options: IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<unknown, IAdtError>>;
  getStatus(
    runId: string,
    withLongPolling: boolean | undefined,
    options: IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
  getResult(
    runId: string,
    options: IUnitTestResultOptions & IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
}

export function testRunner(
  context: HandlerContext,
  carrier: TestCarrier,
): IUnitTestRunner {
  const executor = new AdtExecutor(context.connection, context.logger);
  switch (carrier) {
    case 'program':
      return executor.getProgramTestRunner(ourUnitTest);
    case 'functionGroup':
      return executor.getFunctionGroupTestRunner(ourUnitTest);
    case 'functionModule':
      return executor.getFunctionModuleTestRunner(ourUnitTest);
    default:
      return executor.getClassTestRunner(ourUnitTest);
  }
}

export interface RunAndWait extends RunOutcome<AdtReading<unknown>> {
  readonly runId: string;
}

/**
 * Start a run of every test the named object holds, then poll it to the end —
 * `MAX_STATUS_POLLS` long polls at most — and fetch the result.
 */
export async function runAndWait(
  context: HandlerContext,
  carrier: TestCarrier,
  objectName: string,
): Promise<IAdtResponse<RunAndWait, IAdtError>> {
  const runner = testRunner(context, carrier);
  const started = await runner.run(objectName.toUpperCase(), {
    // A run SAP did not start is a failure (adt-clients MIGRATION-23 §3).
    analyse: analyseUnitTestStart,
  });
  if (!started.ok) {
    return started as unknown as IAdtResponse<RunAndWait, IAdtError>;
  }
  const runId = String(started.getResult().value);
  const outcome = await pollUntilFinished(
    (id, withLongPolling) =>
      runner.getStatus(id, withLongPolling, { analyse: analyseException }),
    runId,
    () => runner.getResult(runId, { analyse: analyseException }),
  );
  if (!outcome.ok) {
    return outcome as unknown as IAdtResponse<RunAndWait, IAdtError>;
  }
  const value = { ...outcome.getResult().value, runId };
  return {
    ...outcome,
    getResult: () => ({ ...outcome.getResult(), value }),
  } as unknown as IAdtResponse<RunAndWait, IAdtError>;
}

/**
 * What a run tool answers: the result when the run finished, the run id and
 * where to ask when it did not. `raw` answers the wire document, `terse` and
 * `full` the parse — no fixture proves a further reduction of a test-run result
 * is safe.
 */
export function projectRun(detail: 'terse' | 'full' | 'raw') {
  return (run: RunAndWait) =>
    run.finished
      ? {
          success: true,
          run_id: run.runId,
          finished: true,
          run_result: detail === 'raw' ? run.result?.raw : run.result?.value,
        }
      : {
          success: true,
          run_id: run.runId,
          finished: false,
          run_status: detail === 'raw' ? run.status.raw : run.status.value,
          message: `The run has not finished after ${MAX_STATUS_POLLS} status checks. Fetch its result later with GetUnitTestResult and this run_id.`,
        };
}
