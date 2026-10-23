/**
 * The runner a unit-test start tool is asked for: `async` (the default, the
 * run started and asked about by run id) or `sync` (one request answered with
 * the finished result, `runSync.ts`).
 */

export const UNIT_TEST_RUNNERS = ['async', 'sync'] as const;
export type UnitTestRunner = (typeof UNIT_TEST_RUNNERS)[number];

/** The `runner` property of a full-set run tool, which waits for an asynchronous run. */
export const RUNNER_PROPERTY = {
  runner: {
    type: 'string',
    enum: ['async', 'sync'],
    default: 'async',
    description:
      'async (default): starts the run, waits for it within a bound and returns the result, or the run_id of a run that outlasts the bound, whose status and result are read by run_id; suited to long suites. sync: one request that returns the finished result.',
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
 */
export const SCOPE_PROPERTY = {
  scope: {
    type: 'object',
    description:
      "Which tests the run covers, with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so): they execute only with foreign_tests true; with foreign_tests false and add_foreign_tests_as_preview true (the defaults) SAP lists them as a preview, unexecuted.",
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
