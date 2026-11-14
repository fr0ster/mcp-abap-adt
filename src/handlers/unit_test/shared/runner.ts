/**
 * The runner a unit-test start tool is asked for: `async` (the default, the
 * run started and asked about by run id) or `sync` (one request answered with
 * the finished result, `runSync.ts`).
 */

import * as z from 'zod';
import { child } from '../../../lib/outsideValue';
import { fieldOf } from './runTarget';

export const UNIT_TEST_RUNNERS = ['async', 'sync'] as const;
export type UnitTestRunner = (typeof UNIT_TEST_RUNNERS)[number];

/** The `runner` property of a full-set run tool, which waits for an asynchronous run. */
const RUNNER_WORDS =
  'async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.';

/** The `runner` field of a full-set run tool's zod input schema. */
export const RUNNER_FIELD = z
  .enum(['async', 'sync'])
  .default('async')
  .optional()
  .describe(RUNNER_WORDS);

/** What a run tool's arguments say of the runner. */
export interface RunnerArgs {
  readonly runner?: UnitTestRunner | undefined;
}

/** The runner `args.runner` names, `async` when none. */
export function runnerOf(args: RunnerArgs): UnitTestRunner {
  return args.runner ?? 'async';
}

/**
 * The `wait` property of a tool that starts an asynchronous run. It declares
 * no `default`: the MCP SDK hands a handler the arguments parsed by the zod
 * shape built from this schema, which fills a declared default in, and a sync
 * run refuses a `wait` that is present. Absent, `waitOf` answers `true`.
 */
const WAIT_WORDS =
  "true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted (its answer for an unknown run_id) returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.";

/** The `wait` field of a run tool's zod input schema. */
export const WAIT_FIELD = z.boolean().optional().describe(WAIT_WORDS);

/** What a run tool's arguments say of the wait. */
export interface WaitArgs {
  readonly wait?: boolean | undefined;
}

/** Whether the call waits for the run (`wait`): `true` when absent. */
export function waitOf(args: WaitArgs): boolean {
  return args.wait ?? true;
}

/**
 * `wait` of a tool with a runner: as `waitOf` for runner async; with runner
 * sync a given `wait` is refused before anything is sent, since that runner is
 * one request answered with the finished result.
 */
export function runnerWaitOf(
  args: WaitArgs,
  runner: UnitTestRunner,
): boolean | Error {
  if (runner === 'sync' && args.wait !== undefined) {
    return new Error(
      'wait goes with runner async: runner sync is one request that returns the finished result; nothing was sent',
    );
  }
  return waitOf(args);
}

/** The `scope` argument, as compact `HandlerUnitTestRun` takes it. */
export interface UnitTestScopeArgs {
  own_tests?: boolean | undefined;
  foreign_tests?: boolean | undefined;
  add_foreign_tests_as_preview?: boolean | undefined;
}

/** The `scope` field of a run tool's zod input schema. */
export const SCOPE_FIELD = z
  .object({
    own_tests: z
      .boolean()
      .optional()
      .describe("Include the object's own tests (default true)."),
    foreign_tests: z
      .boolean()
      .optional()
      .describe(
        'Execute the foreign tests, those linked by an ABAP Doc @testing relation (default false).',
      ),
    add_foreign_tests_as_preview: z
      .boolean()
      .optional()
      .describe(
        'List the foreign tests as a preview, unexecuted (default true).',
      ),
  })
  .optional()
  .describe(
    "Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.",
  );

/** `scope` as adt-clients' run options take it; `undefined` when none is given. */
export function scopeOf(scope: UnitTestScopeArgs | undefined) {
  if (scope === undefined || scope === null || typeof scope !== 'object') {
    return undefined;
  }
  return {
    ownTests: scope.own_tests,
    foreignTests: scope.foreign_tests,
    addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
  };
}
