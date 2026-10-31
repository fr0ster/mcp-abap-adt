/**
 * The runner a unit-test start tool is asked for: `async` (the default, the
 * run started and asked about by run id) or `sync` (one request answered with
 * the finished result, `runSync.ts`).
 */

import { fieldOf } from './runTarget';

export const UNIT_TEST_RUNNERS = ['async', 'sync'] as const;
export type UnitTestRunner = (typeof UNIT_TEST_RUNNERS)[number];

/** The `runner` property of a full-set run tool, which waits for an asynchronous run. */
export const RUNNER_PROPERTY = {
  runner: {
    type: 'string',
    enum: ['async', 'sync'],
    default: 'async',
    description:
      'async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.',
  },
} as const;

/** The runner named by `args.runner`, `async` when none; an error for another value. */
export function runnerOf(args: unknown): UnitTestRunner | Error {
  const given =
    args !== null && typeof args === 'object'
      ? (args as { runner?: unknown }).runner
      : undefined;
  if (given === undefined) return 'async';
  if (
    typeof given === 'string' &&
    (UNIT_TEST_RUNNERS as readonly string[]).includes(given)
  ) {
    return given as UnitTestRunner;
  }
  return new Error(
    `runner must be one of ${UNIT_TEST_RUNNERS.join(', ')}; got ${JSON.stringify(given)}`,
  );
}

/** The `wait` property of a tool that starts an asynchronous run. */
export const WAIT_PROPERTY = {
  wait: {
    type: 'boolean',
    default: true,
    description:
      "true (default): the call reads the run's status by long polling until SAP answers it finished and returns the result; the call lasts as long as the run. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.",
  },
} as const;

/**
 * Whether the call waits for the run (`wait`): `true` when absent; an error,
 * sent before any request, for a value that is not a boolean. The arguments
 * come from the caller, outside the type system, so the value is checked
 * here.
 */
export function waitOf(args: unknown): boolean | Error {
  const given = givenWait(args);
  if (given === undefined) return true;
  if (typeof given === 'boolean') return given;
  return new Error(
    `wait must be true or false; got ${JSON.stringify(given)}; nothing was sent`,
  );
}

/**
 * `wait` of a tool with a runner: as `waitOf` for runner async; with runner
 * sync a given `wait` is refused before anything is sent, since that runner is
 * one request answered with the finished result.
 */
export function runnerWaitOf(
  args: unknown,
  runner: UnitTestRunner,
): boolean | Error {
  if (runner === 'sync' && givenWait(args) !== undefined) {
    return new Error(
      'wait goes with runner async: runner sync is one request that returns the finished result; nothing was sent',
    );
  }
  return waitOf(args);
}

/** The `wait` the call carries, as given; `undefined` when none. */
function givenWait(args: unknown): unknown {
  return args !== null && typeof args === 'object'
    ? fieldOf(args, 'wait')
    : undefined;
}

/** The `scope` argument, as compact `HandlerUnitTestRun` takes it. */
export interface UnitTestScopeArgs {
  own_tests?: boolean;
  foreign_tests?: boolean;
  add_foreign_tests_as_preview?: boolean;
}

/**
 * The `scope` property of a full-set run tool: the shape compact
 * `HandlerUnitTestRun` takes, sent to both runners. What is left out is
 * adt-clients' default (own tests, foreign tests as a preview).
 *
 * Measured on premise (BASIS 816, 2026-10-23), a function group whose test
 * class carries `"! @testing FUNC:<module>`, the module's run: `/testruns`
 * with the default scope answered both methods as a preview (`isForeign`,
 * nothing executed) and with `foreign_tests: true` executed them; `/runs`
 * executed them with the default scope and with `foreign_tests: true` alike.
 */
export const SCOPE_PROPERTY = {
  scope: {
    type: 'object',
    description:
      "Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.",
    properties: {
      own_tests: {
        type: 'boolean',
        description: "Include the object's own tests (default true).",
      },
      foreign_tests: {
        type: 'boolean',
        description:
          'Execute the foreign tests, those linked by an ABAP Doc @testing relation (default false).',
      },
      add_foreign_tests_as_preview: {
        type: 'boolean',
        description:
          'List the foreign tests as a preview, unexecuted (default true).',
      },
    },
  },
} as const;

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
