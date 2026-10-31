/**
 * Running ABAP Unit tests for a tool: start the run and, with `wait` (the
 * default), read its status once by long polling — SAP holds the read until
 * the run finished — and answer the result of a run SAP answered `FINISHED`,
 * or the run id and SAP's status for any other answer. With `wait: false` the
 * call answers the run id right after the start, and the run is read by its
 * id: a client with a request time limit shorter than the run would cut the
 * waiting call and lose the id (measured with a 60 s client limit and a
 * 200 s run, 2026-10-31).
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
  IClassUnitTestRunOptions,
  IUnitTestResultOptions,
} from '@mcp-abap-adt/interfaces-adt';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { type RunOutcome, readRunOnce, unfinishedRun } from './pollRun';

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
export interface IUnitTestRunner extends IUnitTestRunInformation {
  run(
    objectName: string,
    options: IClassUnitTestRunOptions & IAdtAnalyseOptions<IAdtError>,
  ): Promise<IAdtResponse<unknown, IAdtError>>;
}

/**
 * What waiting for a run needs of a runner: ask about the run by its id. Every
 * runner answers it, the generic one (`getAbapUnitTestRunner`) included.
 */
export interface IUnitTestRunInformation {
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

/**
 * A started run: its id, and — when the call waited — what the long-polled
 * status read found.
 */
export interface StartedRun {
  readonly runId: string;
  readonly waited?: RunOutcome<AdtReading<unknown>>;
}

/**
 * Start a run of every test the named object holds; with `wait`, read its
 * status once by long polling and fetch the result of a finished run.
 */
export async function runAndWait(
  context: HandlerContext,
  carrier: TestCarrier,
  objectName: string,
  wait: boolean,
  runOptions: Omit<IClassUnitTestRunOptions, 'title' | 'context'> = {},
): Promise<IAdtResponse<StartedRun, IAdtError>> {
  const runner = testRunner(context, carrier);
  return waitForRun(runner, wait, () =>
    runner.run(objectName.toUpperCase(), {
      ...runOptions,
      // A run SAP did not start is a failure (see adt-clients' migration guide to 23).
      analyse: analyseUnitTestStart,
    }),
  );
}

/**
 * Start a run with `start` — whose answer is the run's id — and, with `wait`,
 * read its status once with `runner` by long polling and fetch the result of
 * a finished run; without, answer the id alone.
 */
export async function waitForRun(
  runner: IUnitTestRunInformation,
  wait: boolean,
  start: () => Promise<IAdtResponse<unknown, IAdtError>>,
): Promise<IAdtResponse<StartedRun, IAdtError>> {
  const started = await atStep('run', start)();
  if (!started.ok) {
    return started as unknown as IAdtResponse<StartedRun, IAdtError>;
  }
  const runId = String(started.getResult().value);
  const outcome = wait
    ? await readRunOnce(
        (id, withLongPolling) =>
          runner.getStatus(id, withLongPolling, { analyse: analyseException }),
        runId,
        () => runner.getResult(runId, { analyse: analyseException }),
      )
    : undefined;
  if (outcome !== undefined && !outcome.ok) {
    return outcome as unknown as IAdtResponse<StartedRun, IAdtError>;
  }
  const value: StartedRun =
    outcome === undefined
      ? { runId }
      : { runId, waited: outcome.getResult().value };
  const answered = outcome ?? started;
  return {
    ...answered,
    getResult: () => ({ ...answered.getResult(), value }),
  } as unknown as IAdtResponse<StartedRun, IAdtError>;
}

/**
 * What a run tool answers: the result of a run SAP answered `FINISHED`; the
 * run id and SAP's status for a run its long poll answered with another
 * status; the run id alone for a run it did not wait for. `raw` answers the
 * wire document, `terse` and `full` the parse — no fixture proves a further
 * reduction of a test-run result is safe.
 */
export function projectRun(detail: 'terse' | 'full' | 'raw') {
  return (run: StartedRun) => {
    const waited = run.waited;
    if (waited === undefined) return { success: true, run_id: run.runId };
    if (!waited.finished) return unfinishedRun(run.runId, waited.runStatus);
    return {
      success: true,
      run_id: run.runId,
      finished: true,
      run_result: detail === 'raw' ? waited.result.raw : waited.result.value,
    };
  };
}
