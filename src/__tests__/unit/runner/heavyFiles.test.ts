/**
 * The runner's heavy files (`tools/run-tests.mjs`, `HEAVY_FILES`): each is
 * a test file of the repository, given 4 GB of heap with its measured peak
 * beside it; every other file keeps Node's default.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
const RUNNER = readFileSync(path.join(REPO, 'tools', 'run-tests.mjs'), 'utf8');

/** The `HEAVY_FILES` entries as the runner states them: path and peak. */
function heavyEntries(): Array<[string, string]> {
  const start = RUNNER.indexOf('const HEAVY_FILES = new Map([');
  const end = RUNNER.indexOf(']);', start);
  assert.ok(start >= 0 && end > start, 'HEAVY_FILES is in the runner');
  return RUNNER.slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("['src/"))
    .map((line): [string, string] => {
      const [file = '', peak = ''] = line
        .slice(1, line.endsWith('],') ? -2 : -1)
        .split(', ')
        .map((part) => part.slice(1, -1));
      return [file, peak];
    });
}

describe('the heavy test files', () => {
  it('lists files, each a test file of the repository with its measured peak', () => {
    const entries = heavyEntries();
    assert.ok(entries.length > 0);
    for (const [file, peak] of entries) {
      assert.ok(existsSync(path.join(REPO, file)), file);
      assert.ok(file.endsWith('.test.ts'), file);
      assert.ok(peak.endsWith(' GB'), `${file}: ${peak}`);
    }
  });

  it('gives a heavy file 4 GB and every other file the default', () => {
    assert.ok(RUNNER.includes("? ['--max-old-space-size=4096']\n    : [];"));
    assert.ok(RUNNER.includes('...heapOf(source),'));
    // No file process is given a heap outside heapOf.
    assert.equal(RUNNER.split("'--max-old-space-size=4096'").length, 2);
  });
});
