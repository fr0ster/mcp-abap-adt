/**
 * Run the ABAP Unit tests of named container/test class pairs — the compact
 * facade's operation (`HandlerUnitTestRun`), with the runner the caller names:
 *
 * - `async` (the default): start the run and answer its run id, without
 *   waiting — ask later with the status and result facades;
 * - `sync`: one `POST /abapunit/testruns`, answered with the finished result
 *   (`runSync.ts`); every test class of each named container runs, and
 *   `title` and `context` are not sent.
 *
 * The core tools run and wait in one call (`runTests.ts`, `runSync.ts`).
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runnerOf, type UnitTestRunner } from './runner';
import { projectSync, runTestsSync } from './runSync';

export type { UnitTestRunner } from './runner';

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
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
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
        runTestsSync(
          context,
          { carrier: 'class', target: definitions },
          { scope: runScope, riskLevel: risk_level, duration },
        ),
      projectSync('terse'),
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
