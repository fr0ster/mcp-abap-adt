/**
 * Running a class's ABAP Unit tests with the synchronous runner: one
 * `POST /sap/bc/adt/abapunit/testruns`, answered with the finished result
 * (adt-clients 37.1.0, `ClassTestRunner.runSync`).
 *
 * Beside the asynchronous runner (`runTests.ts`, `startRun.ts`: start, poll,
 * read the result), which stays as it is. A system may have only one of the
 * two endpoints (issue #286: an on-premise system with `/abapunit/testruns`
 * alone), so both are offered and the caller chooses; nothing here asks the
 * system which one it has.
 *
 * The answer is the `aunit:runResult` document, read by the runner's `result`
 * strategy — the one `getResult` reads with — so a test that failed is an
 * `alert` in the result, as in the asynchronous result, and `analyseException`
 * leaves it there: a failing test is the run's finding, not a refusal.
 *
 * The endpoint addresses whole classes: a target of test definitions runs
 * every test class of each distinct container, and `title` and `context` are
 * not sent.
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

/** A class name (every test class in it), or named test classes in their containers. */
export type SyncRunTarget = string | IClassUnitTestDefinition[];

/** One request: the run, answered with its finished result. */
export function runClassTestsSync(
  context: HandlerContext,
  target: SyncRunTarget,
  options: Omit<IClassUnitTestRunOptions, 'title' | 'context'> = {},
): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> {
  const runner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getClassTestRunner(ourUnitTest);
  return atStep('run', () =>
    runner.runSync(target, { ...options, analyse: analyseException }),
  )() as Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
}
