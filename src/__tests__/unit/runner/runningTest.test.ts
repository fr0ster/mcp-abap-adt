/**
 * A live case that skips is reported skipped (D27): the runner preloads
 * `runningTestPreload.ts` in every file's process, and a case that calls
 * `skipRunningTest(reason)` — this repository's own compiled module, as a
 * live helper calls it — is reported `# SKIP` with its reason and counted
 * skipped, not passed; a call outside a running case (a hook) throws. The
 * coverage ledger reads a skipped case as skipped (`runReport.test.ts`).
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  environment,
  fixtureRepo,
  REPO,
  recorded,
  runTool,
  temporaryDir,
} from './toolRuns';

const scratch = temporaryDir('running-test-');
after(() => scratch.remove());

const OWN_RUNNING_TEST = path.join(
  REPO,
  '.test-build',
  'tree',
  'src',
  '__tests__',
  'integration',
  'helpers',
  'runningTest.js',
);

describe('a skip through skipRunningTest', () => {
  it('marks the running case skipped with its reason; in a hook it throws', () => {
    const file = 'src/__tests__/skips.test.ts';
    const repo = fixtureRepo(path.join(scratch.dir, 'skips'), [file], {
      [file]: [
        "import { appendFileSync } from 'node:fs';",
        "import { before, describe, it } from 'node:test';",
        "const record = (word: string) => appendFileSync(process.env.RECORD ?? '', `${word}\\n`);",
        'const helpers: unknown = require(process.env.RUNNING_TEST ?? "");',
        "const skip = typeof helpers === 'object' && helpers !== null ? Reflect.get(helpers, 'skipRunningTest') : undefined;",
        "if (typeof skip !== 'function') throw new Error('no skipRunningTest');",
        "describe('a suite', () => {",
        "  before(() => { try { Reflect.apply(skip, undefined, ['in a hook']); } catch { record('threw in a hook'); } });",
        "  it('skips itself', () => { Reflect.apply(skip, undefined, ['not on this system']); record('skipped'); });",
        "  it('runs', () => { record('ran'); });",
        '});',
        '',
      ].join('\n'),
    });
    const built = runTool('build-node-tests.mjs', ['--repo', repo]);
    assert.equal(built.status, 0, built.stderr);
    const record = path.join(scratch.dir, 'skips.record');
    const run = runTool(
      'run-tests.mjs',
      [
        '--repo',
        repo,
        '--concurrency',
        '1',
        '--test-reporter=tap',
        path.join(repo, file),
      ],
      environment({ RECORD: record, RUNNING_TEST: OWN_RUNNING_TEST }, [
        'npm_lifecycle_event',
      ]),
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['threw in a hook', 'skipped', 'ran']);
    assert.ok(
      run.stdout.includes('ok 1 - skips itself # SKIP not on this system'),
      run.stdout,
    );
    assert.ok(run.stdout.includes('ok 2 - runs\n'), run.stdout);
    assert.ok(run.stdout.includes('# skipped 1'), run.stdout);
    assert.ok(run.stdout.includes('# pass 1'), run.stdout);
  });
});
