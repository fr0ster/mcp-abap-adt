/**
 * The node:test runner, `tools/run-tests.mjs` (D27, plan step 4): a run with
 * no file is refused, a named file must exist, options reach `node --test`
 * before the files, `--env` sets a variable without a shell, there is no
 * default concurrency, and every file runs in a process of its own. Each case
 * runs the runner in a child process over fixture files written for it.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  environment,
  fixtureRepo,
  recorded,
  runTool,
  temporaryDir,
  writeAt,
} from './toolRuns';

const scratch = temporaryDir('run-tests-');
after(() => scratch.remove());

/** A compiled node:test fixture: one test per name, each appending it to `$RECORD`. */
function recordingFixture(name: string, tests: readonly string[]): string {
  return writeAt(
    scratch.dir,
    `${name}.test.js`,
    [
      "const { appendFileSync } = require('node:fs');",
      "const { test } = require('node:test');",
      ...tests.map(
        (word) =>
          `test('${word}', () => { appendFileSync(process.env.RECORD, '${word}\\n'); });`,
      ),
      '',
    ].join('\n'),
  );
}

describe('the node:test runner', () => {
  it('the runner refuses an empty run', () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'empty'), [], {});
    fs.mkdirSync(path.join(repo, '.test-build', 'tree'), { recursive: true });
    const run = runTool('run-tests.mjs', [
      '--repo',
      repo,
      '--concurrency',
      '1',
    ]);
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes('the node:test list is empty: no test file to run'),
      run.stderr,
    );
  });

  it('a named file must exist', () => {
    const missing = path.join(scratch.dir, 'missing.test.js');
    const run = runTool('run-tests.mjs', ['--concurrency', '1', missing]);
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes(`${missing} does not exist`), run.stderr);

    // A source is run as its compiled file, which must exist too.
    const repo = fixtureRepo(path.join(scratch.dir, 'uncompiled'), [], {
      'src/__tests__/a.test.ts': 'export {};\n',
    });
    const source = path.join(repo, 'src', '__tests__', 'a.test.ts');
    const uncompiled = runTool('run-tests.mjs', [
      '--repo',
      repo,
      '--concurrency',
      '1',
      source,
    ]);
    assert.equal(uncompiled.status, 1);
    assert.ok(
      uncompiled.stderr.includes(
        'has no compiled file — run the test build first',
      ),
      uncompiled.stderr,
    );
  });

  it('options go before files', () => {
    const file = recordingFixture('names', ['keep', 'drop']);
    const record = path.join(scratch.dir, 'names.record');
    const run = runTool('run-tests.mjs', [
      '--concurrency',
      '1',
      '--env',
      `RECORD=${record}`,
      file,
      '--test-name-pattern=keep',
    ]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['keep']);
  });

  it('--env sets a variable without a shell', () => {
    const file = writeAt(
      scratch.dir,
      'env.test.js',
      [
        "const { writeFileSync } = require('node:fs');",
        "const { test } = require('node:test');",
        "test('env', () => { writeFileSync(process.env.RECORD, process.env.PROBE ?? 'absent'); });",
        '',
      ].join('\n'),
    );
    const record = path.join(scratch.dir, 'env.record');
    // A value a shell would split, expand or end.
    const value = 'a b;echo $HOME|"x"&y';
    const run = runTool(
      'run-tests.mjs',
      [
        '--concurrency',
        '1',
        '--env',
        `RECORD=${record}`,
        '--env',
        `PROBE=${value}`,
        file,
      ],
      environment({}, ['PROBE']),
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(fs.readFileSync(record, 'utf8'), value);
  });

  it('the runner takes no default concurrency', () => {
    const file = recordingFixture('concurrency', ['ran']);
    const record = path.join(scratch.dir, 'concurrency.record');
    const without = environment({ RECORD: record }, ['TEST_CONCURRENCY']);
    const refused = runTool('run-tests.mjs', [file], without);
    assert.equal(refused.status, 1);
    assert.ok(
      refused.stderr.includes(
        'no concurrency: give --concurrency <N> or set TEST_CONCURRENCY',
      ),
      refused.stderr,
    );
    assert.deepEqual(recorded(record), []);

    // node:test's own option is not a way around the setting.
    const direct = runTool(
      'run-tests.mjs',
      ['--test-concurrency=2', file],
      without,
    );
    assert.equal(direct.status, 1);
    assert.ok(direct.stderr.includes('--concurrency <N> or TEST_CONCURRENCY'));
    assert.deepEqual(recorded(record), []);

    // The variable is the setting when no option is given.
    const byVariable = runTool(
      'run-tests.mjs',
      [file],
      environment({ RECORD: record, TEST_CONCURRENCY: '1' }),
    );
    assert.equal(byVariable.status, 0, byVariable.stdout + byVariable.stderr);
    assert.deepEqual(recorded(record), ['ran']);
  });

  describe('every file runs in its own process', () => {
    const records: string[] = [];
    const files: string[] = [];
    before(() => {
      for (const name of ['first', 'second']) {
        const record = path.join(scratch.dir, `${name}.process`);
        records.push(record);
        files.push(
          writeAt(
            scratch.dir,
            `process-${name}.test.js`,
            [
              "const { writeFileSync } = require('node:fs');",
              "const { test } = require('node:test');",
              `test('${name}', () => {`,
              '  const seen = globalThis.RUNNER_FIXTURE_MARK ?? null;',
              `  globalThis.RUNNER_FIXTURE_MARK = '${name}';`,
              `  writeFileSync(${JSON.stringify(record)}, JSON.stringify({ pid: process.pid, seen }));`,
              '});',
              '',
            ].join('\n'),
          ),
        );
      }
    });

    it('every file runs in its own process', () => {
      const run = runTool('run-tests.mjs', ['--concurrency', '1', ...files]);
      assert.equal(run.status, 0, run.stdout + run.stderr);
      const seen = records.map((record): unknown =>
        JSON.parse(fs.readFileSync(record, 'utf8')),
      );
      const [first, second] = seen;
      assert.ok(
        typeof first === 'object' &&
          first !== null &&
          'pid' in first &&
          typeof second === 'object' &&
          second !== null &&
          'pid' in second,
      );
      assert.notEqual(first.pid, second.pid);
      assert.notEqual(first.pid, process.pid);
      assert.deepEqual(
        seen.map((one) =>
          typeof one === 'object' && one !== null && 'seen' in one
            ? one.seen
            : 'unread',
        ),
        [null, null],
      );
    });

    it('a run that would share a process is refused', () => {
      const run = runTool('run-tests.mjs', [
        '--concurrency',
        '1',
        '--test-isolation=none',
        ...files,
      ]);
      assert.equal(run.status, 1);
      assert.ok(
        run.stderr.includes('every file runs in a process of its own'),
        run.stderr,
      );
    });
  });
});
