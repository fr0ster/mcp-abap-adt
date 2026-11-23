/**
 * Preloaded by the node:test runner in every file's process (D27): a root
 * `beforeEach` that hands the starting case to `runningTest.ts`, and an
 * `afterEach` that clears it, so a live helper can mark the case it runs in
 * skipped (`skipRunningTest`).
 *
 * Under the runner's per-file bound (`--file-timeout`), the runner names a
 * file in `MCP_ABAP_ADT_STARTED_FILE`, and the `beforeEach` writes the
 * starting case's full name there, so a file stopped by the bound is
 * reported with the last test it started. `writeFileSync` is taken at load,
 * before a test can replace `fs`'s export with a mock.
 */
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach } from 'node:test';
import { useRunningTest } from './runningTest';

const startedFile = process.env.MCP_ABAP_ADT_STARTED_FILE;
const writeStarted = writeFileSync;

// `node --test` loads the preloads in its own process too, which runs no
// test file: only a file's process (`NODE_TEST_CONTEXT` set) registers them.
if (process.env.NODE_TEST_CONTEXT !== undefined) {
  beforeEach((t) => {
    if (startedFile !== undefined && 'fullName' in t) {
      writeStarted(startedFile, t.fullName);
    }
    if ('skip' in t && 'fullName' in t && 'plan' in t) useRunningTest(t);
  });
  afterEach(() => {
    useRunningTest(undefined);
  });
}
