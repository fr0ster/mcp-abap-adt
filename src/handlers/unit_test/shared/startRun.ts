/**
 * Start a class ABAP Unit run for named container/test class pairs and answer
 * its run id, without waiting.
 *
 * The compact facade's operation (`HandlerUnitTestRun`): compact is the
 * granular surface — start here, ask later with the status and result
 * facades. The core tools run and wait in one call (`runTests.ts`).
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

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

  const runner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getClassTestRunner(ourUnitTest);
  return answer(
    { tool: 'HandlerUnitTestRun', detail: 'terse' },
    () =>
      runner.run(
        tests.map((test) => ({
          containerClass: test.container_class.toUpperCase(),
          testClass: test.test_class.toUpperCase(),
        })),
        {
          analyse: analyseUnitTestStart,
          title,
          context: args.context,
          scope: scope
            ? {
                ownTests: scope.own_tests,
                foreignTests: scope.foreign_tests,
                addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
              }
            : undefined,
          riskLevel: risk_level,
          duration,
        },
      ),
    (runId: string) => ({ success: true, run_id: runId }),
  );
}
