/**
 * Run ABAP Unit tests — the compact facade's operation (`HandlerUnitTestRun`)
 * — for exactly one of:
 *
 * - `tests`, named container/test class pairs, with the runner the caller
 *   names:
 *   - `async` (the default): start the run and answer its run id, without
 *     waiting — ask later with the status and result facades;
 *   - `sync`: one `POST /abapunit/testruns`, answered with the finished
 *     result (`runSync.ts`); every test class of each named container runs,
 *     and `title` and `context` are not sent.
 * - `target`, a run target as `RunAbapUnit` takes it (`runTarget.ts`): started
 *   through adt-clients' generic runner (`getAbapUnitTestRunner().run`) and
 *   answered with its run id. The generic runner starts a target only
 *   asynchronously — its `runSync` takes ADT URIs, not a target — so `target`
 *   with `runner: 'sync'` is refused before anything is sent. `title`,
 *   `context`, `scope`, `risk_level` and `duration` are the run options it
 *   takes (`IClassUnitTestRunOptions`).
 *
 * The core tools run and wait in one call (`runTests.ts`, `runSync.ts`).
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runnerOf, scopeOf, type UnitTestRunner } from './runner';
import { projectSync, runTestsSync } from './runSync';
import { type RunTargetArgs, runFlagsOf, runTargetOf } from './runTarget';

export type { UnitTestRunner } from './runner';

export interface StartUnitTestRunArgs {
  tests?: Array<{ container_class: string; test_class: string }>;
  title?: string;
  context?: string;
  scope?: {
    own_tests?: boolean;
    foreign_tests?: boolean;
    add_foreign_tests_as_preview?: boolean;
  };
  risk_level?: { harmless?: boolean; dangerous?: boolean; critical?: boolean };
  duration?: { short?: boolean; medium?: boolean; long?: boolean };
  target?: RunTargetArgs;
  runner?: UnitTestRunner;
}

export async function handleStartUnitTestRun(
  context: HandlerContext,
  args: StartUnitTestRunArgs,
) {
  const { tests, target, title, scope, risk_level, duration } = args ?? {};
  if ((tests === undefined) === (target === undefined)) {
    return return_error(
      new Error(
        'exactly one of tests and target is required: tests names test classes, target an object or a package; nothing was sent',
      ),
    );
  }
  if (target !== undefined) return startTargetRun(context, args, target);
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

/** `HandlerUnitTestRun` with `target`: an asynchronous run, answered with its run id. */
async function startTargetRun(
  context: HandlerContext,
  args: StartUnitTestRunArgs,
  given: RunTargetArgs,
) {
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
  if (runner === 'sync') {
    return return_error(
      new Error(
        'runner sync takes tests only: a target run is asynchronous, started and then read by run_id (leave runner out or set async); nothing was sent',
      ),
    );
  }
  const target = runTargetOf(given);
  if (target instanceof Error) return return_error(target);
  const flags = runFlagsOf(args);
  if (flags instanceof Error) return return_error(flags);
  const { scope, riskLevel, duration } = flags;
  const generic = new AdtExecutor(
    context.connection,
    context.logger,
  ).getAbapUnitTestRunner(ourUnitTest);
  return answer(
    { tool: 'HandlerUnitTestRun', detail: 'terse' },
    () =>
      generic.run(target, {
        analyse: analyseUnitTestStart,
        title: args.title,
        context: args.context,
        scope: scopeOf(scope),
        riskLevel,
        duration,
      }),
    (runId: string) => ({ success: true, run_id: runId }),
  );
}
