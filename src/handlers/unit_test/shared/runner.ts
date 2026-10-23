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
