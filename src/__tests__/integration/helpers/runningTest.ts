/**
 * The case node:test is running in this file's process, and the one way a
 * live helper skips it (D27): `skipRunningTest(reason)` marks the case
 * skipped with its reason — node:test reports it `# SKIP` and counts it
 * skipped, and the coverage ledger reads it as not run — and writes the
 * reason to the test log. A helper that only logged a skip and returned left
 * the case reported as passed (measured on the legacy system, SAP_BASIS 7.40: 175 skipped
 * cases counted as passes).
 *
 * The running case is set by `runningTestPreload.ts`, a root `beforeEach` the
 * runner preloads in every file's process; files run their cases one at a
 * time, so one variable holds it. After the call the helper returns: a
 * skipped case's body runs on until it does.
 */
import type { TestContext } from 'node:test';
import { createTestLogger } from './loggerHelpers';

let running: TestContext | undefined;

/** The case starting (`undefined`: none). Set by the preload's hooks. */
export function useRunningTest(t: TestContext | undefined): void {
  running = t;
}

const logger = createTestLogger('skip');

/**
 * Marks the running case skipped with `reason` and logs it. Outside a
 * running case (a hook, a describe body) it throws: a skip there has no case
 * to mark.
 */
export function skipRunningTest(reason: string): void {
  if (running === undefined) {
    throw new Error(`a skip outside a running case: ${reason}`);
  }
  running.skip(reason);
  logger?.info(`⏭️  Skipping test: ${reason}`);
}
