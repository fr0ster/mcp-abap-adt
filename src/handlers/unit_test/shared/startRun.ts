/**
 * Run the ABAP Unit tests of named container/test class pairs — the compact
 * facade's operation (`HandlerUnitTestRun`), with the runner the caller names:
 *
 * - `sync` (the default): one `POST /abapunit/testruns`, answered with the
 *   finished result (`runSync.ts`); every test class of each named container
 *   runs, and `title` and `context` are not sent;
 * - `async`: start the run and answer its run id, without waiting — ask later
 *   with the status and result facades.
 *
 * The core tools run and wait in one call (`runTests.ts`, `runSync.ts`).
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runClassTestsSync } from './runSync';

/** The runners a caller may name; `sync` when none is named. */
export const UNIT_TEST_RUNNERS = ['sync', 'async'] as const;
export type UnitTestRunner = (typeof UNIT_TEST_RUNNERS)[number];

export interface StartUnitTestRunArgs {
  tests: Array<{ container_class: string; test_class: string }>;
  title?: string;
  context?: string;
  scope?: {
    own_tests?: boolean;
    foreign_tests?: boolean;
    add_foreign_tests_as_preview?: boolean;
  };
  risk_level?: { harmless?: boolean; dangerous?: boolean; critical?: boolean };
  duration?: { short?: boolean; medium?: boolean; long?: boolean };
  runner?: UnitTestRunner;
}

export async function handleStartUnitTestRun(
  context: HandlerContext,
  args: StartUnitTestRunArgs,
) {
  const { tests, title, scope, risk_level, duration } = args ?? {};
  if (!Array.isArray(tests) || tests.length === 0) {
    return return_error(
      new Error('tests array with at least one entry is required'),
    );
  }
  const runner = args.runner ?? 'sync';
  if (!UNIT_TEST_RUNNERS.includes(runner)) {
    return return_error(
      new Error(
        `runner must be one of ${UNIT_TEST_RUNNERS.join(', ')}; got ${JSON.stringify(runner)}`,
      ),
    );
  }
  const definitions = tests.map((test) => ({
    containerClass: test.container_class.toUpperCase(),
    testClass: test.test_class.toUpperCase(),
  }));
  const runScope = scope
    ? {
        ownTests: scope.own_tests,
        foreignTests: scope.foreign_tests,
        addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
      }
    : undefined;

  if (runner === 'sync') {
    return answer(
      { tool: 'HandlerUnitTestRun', detail: 'terse' },
      () =>
        runClassTestsSync(context, definitions, {
          scope: runScope,
          riskLevel: risk_level,
          duration,
        }),
      (result: AdtReading<unknown>) => ({
        success: true,
        finished: true,
        run_result: result.value,
      }),
    );
  }

  const asyncRunner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getClassTestRunner(ourUnitTest);
  return answer(
    { tool: 'HandlerUnitTestRun', detail: 'terse' },
    () =>
      asyncRunner.run(definitions, {
        analyse: analyseUnitTestStart,
        title,
        context: args.context,
        scope: runScope,
        riskLevel: risk_level,
        duration,
      }),
    (runId: string) => ({ success: true, run_id: runId }),
  );
}
