/**
 * Running ABAP Unit tests with the synchronous runner: one
 * `POST /sap/bc/adt/abapunit/testruns`, answered with the finished result
 * (adt-clients 37.2.0: `runSync` on the class, report, function group and
 * function module runners).
 *
 * Beside the asynchronous runner (`runTests.ts`, `startRun.ts`: start, poll,
 * read the result), which stays the default. A system may have only one of
 * the two endpoints (issue #286: an on-premise system with
 * `/abapunit/testruns` alone), so the caller names the runner; nothing here
 * asks the system which one it has.
 *
 * The answer is the `aunit:runResult` document, read by the runner's `result`
 * strategy — the one `getResult` reads with — so a test that failed is an
 * `alert` in the result, as in the asynchronous result, and `analyseException`
 * leaves it there: a failing test is the run's finding, not a refusal.
 *
 * What each target runs (adt-clients' measurements, on premise, BASIS 816):
 * a class target of test definitions runs every test class of each distinct
 * container; a function module's run covers every test of its group, as the
 * asynchronous one does; `title` and `context` are not sent.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  IClassUnitTestDefinition,
  IClassUnitTestRunOptions,
} from '@mcp-abap-adt/interfaces-adt';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';

/** What a synchronous run is given, per object type. */
export type SyncRunTarget =
  | { carrier: 'class'; target: string | IClassUnitTestDefinition[] }
  | { carrier: 'program'; programName: string }
  | { carrier: 'functionGroup'; functionGroupName: string }
  | {
      carrier: 'functionModule';
      functionGroupName: string;
      functionModuleName: string;
    };

type SyncAnswer = Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;

/** One request: the run, answered with its finished result. */
export function runTestsSync(
  context: HandlerContext,
  run: SyncRunTarget,
  options: Omit<IClassUnitTestRunOptions, 'title' | 'context'> = {},
): SyncAnswer {
  const executor = new AdtExecutor(context.connection, context.logger);
  const withAnalyse = { ...options, analyse: analyseException };
  const send = (): SyncAnswer => {
    switch (run.carrier) {
      case 'program':
        return executor
          .getProgramTestRunner(ourUnitTest)
          .runSync(run.programName.toUpperCase(), withAnalyse) as SyncAnswer;
      case 'functionGroup':
        return executor
          .getFunctionGroupTestRunner(ourUnitTest)
          .runSync(
            run.functionGroupName.toUpperCase(),
            withAnalyse,
          ) as SyncAnswer;
      case 'functionModule':
        return executor.getFunctionModuleTestRunner(ourUnitTest).runSync(
          {
            functionGroupName: run.functionGroupName.toUpperCase(),
            functionModuleName: run.functionModuleName.toUpperCase(),
          },
          withAnalyse,
        ) as SyncAnswer;
      default:
        return executor
          .getClassTestRunner(ourUnitTest)
          .runSync(run.target, withAnalyse) as SyncAnswer;
    }
  };
  return atStep('run', send)() as SyncAnswer;
}

/** What a synchronous run tool answers: the finished result. */
export function projectSync(detail: 'terse' | 'full' | 'raw') {
  return (result: AdtReading<unknown>) => ({
    success: true,
    runner: 'sync',
    finished: true,
    run_result: detail === 'raw' ? result.raw : result.value,
  });
}
