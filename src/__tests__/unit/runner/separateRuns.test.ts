/**
 * The unit run reaches no outside service (D27, step 15; spec §4): the
 * suites that do — `test:install` (packs and installs the release) — are a
 * run of their own, named in `tools/separate-runs.json`. Neither runner's
 * unit set holds one of their files: Jest's discovery (`--listTests`, a
 * child process) and the runner's default selection, both as
 * `tools/npm-test.mjs --list` reads them. Each run's npm script names
 * exactly its files.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { environment, REPO, runTool } from './toolRuns';

/** The table: each npm script and the files it alone runs. */
function separateRuns(): Map<string, string[]> {
  const read: unknown = JSON.parse(
    fs.readFileSync(path.join(REPO, 'tools', 'separate-runs.json'), 'utf8'),
  );
  assert.ok(typeof read === 'object' && read !== null && !Array.isArray(read));
  const runs = new Map<string, string[]>();
  for (const [script, files] of Object.entries(read)) {
    assert.ok(Array.isArray(files), script);
    runs.set(
      script,
      files.filter((file): file is string => typeof file === 'string'),
    );
  }
  return runs;
}

/** The unit run's two sets, as repository paths: `npm test -- --list`. */
function unitSets(): { jest: string[]; nodeTest: string[] } {
  const run = runTool('npm-test.mjs', ['--list'], environment());
  assert.equal(run.status, 0, run.stderr);
  const listed: unknown = JSON.parse(run.stdout);
  assert.ok(typeof listed === 'object' && listed !== null);
  const jest: unknown = Reflect.get(listed, 'jest');
  const nodeTest: unknown = Reflect.get(listed, 'nodeTest');
  assert.ok(Array.isArray(jest) && Array.isArray(nodeTest));
  const relativeOf = (file: unknown) =>
    path
      .relative(REPO, path.resolve(REPO, String(file)))
      .split(path.sep)
      .join('/');
  return { jest: jest.map(relativeOf), nodeTest: nodeTest.map(relativeOf) };
}

describe('the runs of their own', () => {
  it('the unit run reaches no outside service', () => {
    const { jest, nodeTest } = unitSets();
    // Both sets were read: an empty one would hold nothing by default.
    assert.ok(jest.length > 0 && nodeTest.length > 0);
    for (const [script, files] of separateRuns()) {
      assert.ok(files.length > 0, script);
      for (const file of files) {
        assert.equal(
          jest.includes(file),
          false,
          `${script}: Jest runs ${file}`,
        );
        assert.equal(
          nodeTest.includes(file),
          false,
          `${script}: the runner's unit set holds ${file}`,
        );
      }
    }
  });

  it('each run of its own names exactly its files in its npm script', () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    assert.ok(typeof manifest === 'object' && manifest !== null);
    const scripts: unknown = Reflect.get(manifest, 'scripts');
    assert.ok(typeof scripts === 'object' && scripts !== null);
    for (const [script, files] of separateRuns()) {
      const command: unknown = Reflect.get(scripts, script);
      assert.equal(typeof command, 'string', script);
      const named = String(command)
        .split(' ')
        .filter((word) => word.endsWith('.test.ts'));
      assert.deepEqual([...named].sort(), [...files].sort(), script);
    }
  });
});
