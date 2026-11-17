/**
 * Preloaded by the node:test runner in every file's process (D27): a root
 * `beforeEach` that hands the starting case to `runningTest.ts`, and an
 * `afterEach` that clears it, so a live helper can mark the case it runs in
 * skipped (`skipRunningTest`).
 */
import { afterEach, beforeEach } from 'node:test';
import { useRunningTest } from './runningTest';

// `node --test` loads the preloads in its own process too, which runs no
// test file: only a file's process (`NODE_TEST_CONTEXT` set) registers them.
if (process.env.NODE_TEST_CONTEXT !== undefined) {
  beforeEach((t) => {
    if ('skip' in t && 'fullName' in t && 'plan' in t) useRunningTest(t);
  });
  afterEach(() => {
    useRunningTest(undefined);
  });
}
