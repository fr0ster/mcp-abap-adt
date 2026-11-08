/**
 * `npm test`, `tools/npm-test.mjs` (D27, plan step 4): Jest, then the
 * node:test build and the runner, both even when the first fails. A root
 * filter (`--roots`, the form every sub-package's `test` script forwards)
 * selects that root on both runners; a root with no node:test file runs Jest
 * alone; a filtered run passes only when both runners pass. Each case runs
 * the tool in a child process, over the repository or a fixture.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  environment,
  fixtureRepo,
  jestSource,
  nodeTestSource,
  REPO,
  recorded,
  runTool,
  temporaryDir,
} from './toolRuns';

const scratch = temporaryDir('npm-test-');
after(() => scratch.remove());

/** The `test` script every sub-package forwards to the root's. */
const FORWARD = 'npm --prefix .. test -- ';

/** The sub-packages' `test` scripts: the directory and the forwarded arguments. */
function subPackageScripts(): Array<{ dir: string; args: string[] }> {
  const scripts: Array<{ dir: string; args: string[] }> = [];
  for (const entry of fs.readdirSync(REPO, { withFileTypes: true })) {
    const manifest = path.join(REPO, entry.name, 'package.json');
    if (!entry.isDirectory() || !fs.existsSync(manifest)) continue;
    const read: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (
      typeof read !== 'object' ||
      read === null ||
      !('scripts' in read) ||
      typeof read.scripts !== 'object' ||
      read.scripts === null ||
      !('test' in read.scripts)
    ) {
      continue;
    }
    const script = read.scripts.test;
    assert.ok(
      typeof script === 'string',
      `${entry.name}: test is not a string`,
    );
    assert.ok(script.startsWith(FORWARD), `${entry.name}: ${script}`);
    scripts.push({
      dir: entry.name,
      args: script.slice(FORWARD.length).split(' '),
    });
  }
  return scripts;
}

/** The tool's `--list`: what each runner would run. Data from a child process. */
function listed(args: readonly string[]): {
  jest: string[];
  nodeTest: string[];
} {
  const run = runTool('npm-test.mjs', [...args, '--list']);
  assert.equal(run.status, 0, run.stderr);
  const shown: unknown = JSON.parse(run.stdout);
  const isStrings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (
    typeof shown !== 'object' ||
    shown === null ||
    !('jest' in shown) ||
    !('nodeTest' in shown) ||
    !isStrings(shown.jest) ||
    !isStrings(shown.nodeTest)
  ) {
    throw new Error(`npm-test --list: not { jest, nodeTest }: ${run.stdout}`);
  }
  return { jest: shown.jest, nodeTest: shown.nodeTest };
}

function isUnder(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return (
    rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  );
}

describe('npm test', () => {
  it('a root filter selects that root on both runners', () => {
    const scripts = subPackageScripts();
    assert.ok(scripts.length > 0);
    // The list holds files outside every sub-package root, so a filter that
    // did not reach the runner would show them.
    const everyListed = listed([]).nodeTest;
    for (const { dir, args } of scripts) {
      assert.deepEqual(args, ['--roots', `${dir}/src`], dir);
      const root = path.join(REPO, dir, 'src');
      const { jest, nodeTest } = listed(args);
      assert.ok(jest.length > 0, `${dir}: Jest found nothing`);
      assert.deepEqual(
        jest.filter((file) => !isUnder(root, file)),
        [],
        `${dir}: Jest outside its root`,
      );
      assert.deepEqual(
        nodeTest.filter((source) => !isUnder(root, path.join(REPO, source))),
        [],
        `${dir}: the runner outside its root`,
      );
      assert.ok(
        everyListed.some((source) => !isUnder(root, path.join(REPO, source))),
      );
    }
  });

  describe('a root with no node:test file', () => {
    // A fixture repository whose one listed file is outside the root: the
    // repository's own list is never run from here, since it holds this file.
    const repo = fixtureRepo(
      path.join(scratch.dir, 'jest-only'),
      ['elsewhere/src/__tests__/nodeOnly.test.ts'],
      {
        'elsewhere/src/__tests__/nodeOnly.test.ts': nodeTestSource(
          'node',
          'FAIL_NODE',
        ),
        'fix/src/__tests__/jestOnly.test.ts': jestSource('jest', 'FAIL_JEST'),
      },
    );
    const root = path.join(repo, 'fix', 'src');

    it('a root with no node:test file yet runs Jest alone', () => {
      const record = path.join(scratch.dir, 'jest-only.record');
      const run = runTool(
        'npm-test.mjs',
        ['--concurrency', '1', '--repo', repo, '--roots', root],
        environment({ RECORD: record }),
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.ok(
        run.stdout.includes(
          `npm-test: no node:test file under ${root}; the runner skipped`,
        ),
        run.stdout,
      );
      assert.deepEqual(recorded(record), ['jest']);
    });

    it('a direct runner run with an empty selection fails', () => {
      const run = runTool('run-tests.mjs', [
        '--concurrency',
        '1',
        '--repo',
        repo,
        '--root',
        root,
      ]);
      assert.equal(run.status, 1);
      assert.ok(
        run.stderr.includes(`no file of the node:test list under ${root}`),
        run.stderr,
      );
    });
  });

  describe('a named file obeys the root filter on both runners', () => {
    const repo = fixtureRepo(
      path.join(scratch.dir, 'named'),
      ['in/src/__tests__/inside.test.ts', 'out/src/__tests__/outside.test.ts'],
      {
        'in/src/__tests__/inside.test.ts': nodeTestSource(
          'inside',
          'FAIL_INSIDE',
        ),
        'out/src/__tests__/outside.test.ts': nodeTestSource(
          'outside',
          'FAIL_OUTSIDE',
        ),
      },
    );
    const root = path.join(repo, 'in', 'src');
    const inside = path.join(root, '__tests__', 'inside.test.ts');
    const outside = path.join(
      repo,
      'out',
      'src',
      '__tests__',
      'outside.test.ts',
    );

    it('the runner refuses a named file outside every root', () => {
      const built = runTool('build-node-tests.mjs', ['--repo', repo]);
      assert.equal(built.status, 0, built.stderr);
      const record = path.join(scratch.dir, 'named-runner-out.record');
      const run = runTool(
        'run-tests.mjs',
        ['--repo', repo, '--concurrency', '1', '--root', root, outside],
        environment({ RECORD: record }),
      );
      assert.equal(run.status, 1);
      assert.ok(
        run.stderr.includes(`no named file under ${root}: no test file to run`),
        run.stderr,
      );
      assert.deepEqual(recorded(record), []);
    });

    it('the runner runs a named file inside a root', () => {
      const built = runTool('build-node-tests.mjs', ['--repo', repo]);
      assert.equal(built.status, 0, built.stderr);
      const record = path.join(scratch.dir, 'named-runner-in.record');
      const run = runTool(
        'run-tests.mjs',
        ['--repo', repo, '--concurrency', '1', '--root', root, inside, outside],
        environment({ RECORD: record }),
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record), ['inside']);
    });

    it('the tool skips the runner for a named file outside every root', () => {
      assert.deepEqual(
        listed(['--repo', repo, '--roots', root, outside]).nodeTest,
        [],
      );
      const record = path.join(scratch.dir, 'named-tool-out.record');
      const run = runTool(
        'npm-test.mjs',
        ['--concurrency', '1', '--repo', repo, '--roots', root, outside],
        environment({ RECORD: record }),
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.ok(
        run.stdout.includes(
          `npm-test: no named node:test file under ${root}; the runner skipped`,
        ),
        run.stdout,
      );
      assert.deepEqual(recorded(record), []);
    });

    it('the tool runs a named file inside a root', () => {
      const record = path.join(scratch.dir, 'named-tool-in.record');
      const run = runTool(
        'npm-test.mjs',
        [
          '--concurrency',
          '1',
          '--repo',
          repo,
          '--roots',
          root,
          inside,
          outside,
        ],
        environment({ RECORD: record }),
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record), ['inside']);
    });
  });

  describe('a filtered run succeeds on both runners', () => {
    const repo = fixtureRepo(
      path.join(scratch.dir, 'both'),
      ['fix/src/__tests__/nodeOnly.test.ts'],
      {
        'fix/src/__tests__/nodeOnly.test.ts': nodeTestSource(
          'node',
          'FAIL_NODE',
        ),
        'fix/src/__tests__/jestOnly.test.ts': jestSource('jest', 'FAIL_JEST'),
      },
    );
    // Jest runs over the repository's configuration, whose list is not the
    // fixture's: it is told to leave the fixture's node:test file alone.
    const args = [
      '--concurrency',
      '1',
      '--repo',
      repo,
      '--roots',
      path.join(repo, 'fix', 'src'),
      '--testPathIgnorePatterns=nodeOnly',
    ];
    const cases: Array<[string, Record<string, string>, number, string[]]> = [
      ['both pass', {}, 0, ['jest', 'node']],
      [
        'Jest fails, the runner still runs',
        { FAIL_JEST: '1' },
        1,
        ['jest', 'node'],
      ],
      ['the runner fails', { FAIL_NODE: '1' }, 1, ['jest', 'node']],
    ];
    for (const [index, [title, failing, status, ran]] of cases.entries()) {
      it(title, () => {
        const record = path.join(scratch.dir, `both-${index}.record`);
        const run = runTool(
          'npm-test.mjs',
          args,
          environment({ RECORD: record, ...failing }, [
            'FAIL_JEST',
            'FAIL_NODE',
          ]),
        );
        assert.equal(run.status, status, run.stdout + run.stderr);
        assert.deepEqual(recorded(record).sort(), ran);
      });
    }
  });
});
