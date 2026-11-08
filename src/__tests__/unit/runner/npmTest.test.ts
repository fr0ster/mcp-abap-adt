/**
 * `npm test`, `tools/npm-test.mjs` (D27, plan step 4): Jest, then the
 * node:test build and the runner, both even when the first fails. A root
 * filter (`--roots`, the form every sub-package's `test` script forwards)
 * selects that root on both runners; a root with no node:test file runs Jest
 * alone; a filtered run passes only when both runners pass. Each case runs
 * the tool in a child process, over the repository or a fixture; a fixture's
 * run starts in the fixture's directory, and its Jest run takes the
 * fixture's own configuration, so none reaches this repository's suite.
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
  writeAt,
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

/**
 * The tool's `--list` from `cwd`: what each runner would run. Data from a
 * child process.
 */
function listed(
  args: readonly string[],
  cwd: string = REPO,
): {
  jest: string[];
  nodeTest: string[];
} {
  const run = runTool('npm-test.mjs', [...args, '--list'], environment(), cwd);
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
        repo,
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
        listed(['--repo', repo, '--roots', root, outside], repo).nodeTest,
        [],
      );
      const record = path.join(scratch.dir, 'named-tool-out.record');
      const run = runTool(
        'npm-test.mjs',
        ['--concurrency', '1', '--repo', repo, '--roots', root, outside],
        environment({ RECORD: record }),
        repo,
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
        repo,
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record), ['inside']);
    });
  });

  it('a named Jest file with --roots runs no node:test file', () => {
    // Both runners' files under one root; only the Jest file is named. The
    // `+` in the path is what a regular expression reads as a quantifier:
    // a named file is a path, not a Jest pattern (on Windows, a `\.` of a
    // `\.test-fixtures` segment is the same), so it must run all the same.
    const repo = fixtureRepo(
      path.join(scratch.dir, 'named+jest'),
      ['fix/src/__tests__/nodeOnly.test.ts'],
      {
        'fix/src/__tests__/nodeOnly.test.ts': nodeTestSource(
          'node',
          'FAIL_NODE',
        ),
        'fix/src/__tests__/jestOnly.test.ts': jestSource('jest', 'FAIL_JEST'),
      },
    );
    const root = path.join(repo, 'fix', 'src');
    const jestFile = path.join(root, '__tests__', 'jestOnly.test.ts');
    assert.deepEqual(
      listed(['--repo', repo, '--roots', root, jestFile], repo).nodeTest,
      [],
    );
    const record = path.join(scratch.dir, 'named-jest.record');
    const run = runTool(
      'npm-test.mjs',
      ['--concurrency', '1', '--repo', repo, '--roots', root, jestFile],
      environment({ RECORD: record }),
      repo,
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.ok(
      run.stdout.includes(
        `npm-test: no named node:test file under ${root}; the runner skipped`,
      ),
      run.stdout,
    );
    assert.deepEqual(recorded(record), ['jest']);
  });

  describe('every Jest positional decides the by-path mode', () => {
    const sources = {
      'fix/src/__tests__/first.test.ts': jestSource('alpha', 'FAIL_ALPHA'),
      'fix/src/__tests__/secondSuite.test.ts': jestSource('beta', 'FAIL_BETA'),
      'fix/src/__tests__/falseCase.test.ts': jestSource('gamma', 'FAIL_GAMMA'),
    };
    // No character of this directory means anything to a pattern.
    const plain = fixtureRepo(
      path.join(scratch.dir, 'positionals'),
      [],
      sources,
    );
    const plainRoot = path.join(plain, 'fix', 'src');
    // The `+` is what a regular expression reads as a quantifier: a file of
    // this directory that runs ran by path, not as a pattern.
    const quantified = fixtureRepo(
      path.join(scratch.dir, 'positionals+'),
      [],
      sources,
    );
    const root = path.join(quantified, 'fix', 'src');
    const first = path.join(root, '__tests__', 'first.test.ts');

    it('a named existing Jest file beside a pattern: both are patterns', () => {
      // By path, Jest would read `secondSuite` as a file and run nothing of
      // it. The named file is written relative to the fixture, where the run
      // starts, and with `/`: a pattern that matches it on every platform.
      const named = 'fix/src/__tests__/first.test.ts';
      const record = path.join(scratch.dir, 'positionals-pattern.record');
      const run = runTool(
        'npm-test.mjs',
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          '--roots',
          plainRoot,
          named,
          'secondSuite',
        ],
        environment({ RECORD: record }),
        plain,
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record).sort(), ['alpha', 'beta']);
    });

    it('a pattern beside --roots is a pattern, not a root', () => {
      // Jest's `--roots=<dir>` takes every value after it: a pattern handed
      // to Jest after it would be one more root, and every file would run.
      const record = path.join(scratch.dir, 'positionals-root.record');
      const run = runTool(
        'npm-test.mjs',
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          '--roots',
          plainRoot,
          'secondSuite',
        ],
        environment({ RECORD: record }),
        plain,
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record), ['beta']);
    });

    const options = [
      ['-t', 'alpha'],
      ['--testNamePattern', 'alpha'],
      ['--testNamePattern=alpha'],
      ['--test-name-pattern', 'alpha'],
      // Jest's yargs reads a short group with a value as `-i` and
      // `-t=alpha`.
      ['-it=alpha'],
    ];
    for (const [index, option] of options.entries()) {
      it(`${option.join(' ')} beside a named file: by path, the value no positional`, () => {
        // Were the value a positional, it would name no file, the mode would
        // be patterns, and the path with its `+` would match nothing.
        const record = path.join(
          scratch.dir,
          `positionals-option-${index}.record`,
        );
        const run = runTool(
          'npm-test.mjs',
          [
            '--concurrency',
            '1',
            '--repo',
            quantified,
            '--roots',
            root,
            ...option,
            first,
          ],
          environment({ RECORD: record }),
          quantified,
        );
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.deepEqual(recorded(record), ['alpha']);
      });
    }

    it('a boolean option followed by false: false is a positional, as Jest reads it', () => {
      // Jest's yargs reads `--no-cache false` as `cache: false` and a
      // positional `false`, not a file: every positional is a pattern, and
      // `false` matches `falseCase`. Were `false` the option's value, the
      // named file alone would run, by path.
      const record = path.join(scratch.dir, 'positionals-false.record');
      const run = runTool(
        'npm-test.mjs',
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          '--roots',
          plainRoot,
          '--no-cache',
          'false',
          'fix/src/__tests__/first.test.ts',
        ],
        environment({ RECORD: record }),
        plain,
      );
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(recorded(record).sort(), ['alpha', 'gamma']);
    });

    // The tool's own options taken out of the arguments keep the boundary
    // they were: an array option before one of them ends there. Each case
    // runs the plain fixture from its directory; the record is what ran.
    const boundaries: Array<[string, string[], string[]]> = [
      [
        'an array option, then --roots, then a pattern: the pattern stays a pattern',
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          'fix/src/__tests__/first.test.ts',
          '--reporters',
          'default',
          '--roots',
          plainRoot,
          'secondSuite',
        ],
        ['alpha', 'beta'],
      ],
      [
        'an array option, then --concurrency, then a pattern; --repo and --roots last',
        [
          '--reporters',
          'default',
          '--concurrency',
          '1',
          'secondSuite',
          '--repo',
          plain,
          '--roots',
          plainRoot,
        ],
        ['beta'],
      ],
      [
        "an array option ended by the person's own --",
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          '--roots',
          plainRoot,
          '--reporters',
          'default',
          '--',
          'secondSuite',
        ],
        ['beta'],
      ],
      [
        'an array option at the very end',
        [
          '--concurrency',
          '1',
          '--repo',
          plain,
          '--roots',
          plainRoot,
          'secondSuite',
          '--reporters',
          'default',
        ],
        ['beta'],
      ],
    ];
    for (const [index, [title, args, ran]] of boundaries.entries()) {
      it(title, () => {
        const record = path.join(
          scratch.dir,
          `positionals-boundary-${index}.record`,
        );
        const run = runTool(
          'npm-test.mjs',
          args,
          environment({ RECORD: record }),
          plain,
        );
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.deepEqual(recorded(record).sort(), ran);
      });
    }

    it('an unknown option is refused, nothing run', () => {
      const record = path.join(scratch.dir, 'positionals-unknown.record');
      const run = runTool(
        'npm-test.mjs',
        [
          '--concurrency',
          '1',
          '--repo',
          quantified,
          '--roots',
          root,
          '--noSuchOption',
          first,
        ],
        environment({ RECORD: record }),
        quantified,
      );
      assert.equal(run.status, 1, run.stdout + run.stderr);
      // Jest's own refusal, in its words.
      assert.ok(run.stderr.includes('npm-test: '), run.stderr);
      assert.ok(
        run.stderr.includes('Unrecognized option "noSuchOption"'),
        run.stderr,
      );
      assert.deepEqual(recorded(record), []);
    });
  });

  describe("a file named by path obeys Jest's roots and ignores", () => {
    // Jest runs over a configuration built by the repository's own
    // `jestConfig` from a fixture list: the live suites' directories ignored
    // as in `jest.config.js`, and the fixture list's files ignored as the
    // repository's are; its roots are the fixture's directory alone, so it
    // reaches nothing of this repository, and its ts-jest takes this
    // repository's `tsconfig.test.json` by its full path. The tool's own list (the fixture
    // repository's) is empty, so every named file reaches Jest, by path.
    const repo = fixtureRepo(path.join(scratch.dir, 'by-path+'), [], {
      'in/src/__tests__/kept.test.ts': jestSource('kept', 'FAIL_KEPT'),
      'in/src/__tests__/integration/live.test.ts': jestSource(
        'live',
        'FAIL_LIVE',
      ),
      'in/src/__tests__/listed.test.ts': jestSource('listed', 'FAIL_LISTED'),
      'out/src/__tests__/outside.test.ts': jestSource(
        'outside',
        'FAIL_OUTSIDE',
      ),
    });
    const root = path.join(repo, 'in', 'src');
    const kept = path.join(root, '__tests__', 'kept.test.ts');
    const listedFile = path.join(root, '__tests__', 'listed.test.ts');
    const jestList = writeAt(
      repo,
      'jest-list.json',
      JSON.stringify([
        path.relative(REPO, listedFile).split(path.sep).join('/'),
      ]),
    );
    const config = writeAt(
      repo,
      'jest.config.js',
      [
        `const base = require(${JSON.stringify(path.join(REPO, 'jest.config.js'))}).jestConfig(${JSON.stringify(jestList)});`,
        // ts-jest reads a relative `tsconfig` from the directory Jest
        // started in, the fixture's: this repository's, by its full path.
        `base.transform = { '^.+\\\\.ts$': ['ts-jest', { tsconfig: ${JSON.stringify(path.join(REPO, 'tsconfig.test.json'))} }] };`,
        `base.roots = [${JSON.stringify(repo)}];`,
        'module.exports = base;',
        '',
      ].join('\n'),
    );
    const cases: Array<[string, string]> = [
      [
        'outside every root',
        path.join(repo, 'out', 'src', '__tests__', 'outside.test.ts'),
      ],
      [
        'under an ignored live directory',
        path.join(root, '__tests__', 'integration', 'live.test.ts'),
      ],
      ['on the node:test list', listedFile],
    ];
    for (const [index, [where, file]] of cases.entries()) {
      it(`a named file ${where} runs nothing`, () => {
        const record = path.join(scratch.dir, `by-path-${index}.record`);
        const run = runTool(
          'npm-test.mjs',
          [
            '--concurrency',
            '1',
            '--repo',
            repo,
            '--roots',
            root,
            kept,
            file,
            '--config',
            config,
          ],
          environment({ RECORD: record }),
          repo,
        );
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.deepEqual(recorded(record), ['kept']);
      });
    }
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
    // Jest runs over the fixture's configuration, which ignores the
    // fixture's node:test file.
    const args = [
      '--concurrency',
      '1',
      '--repo',
      repo,
      '--roots',
      path.join(repo, 'fix', 'src'),
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
          repo,
        );
        assert.equal(run.status, status, run.stdout + run.stderr);
        assert.deepEqual(recorded(record).sort(), ran);
      });
    }
  });
  describe("a fixture repository's Jest run reaches nothing of this repository", () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'contained'), [], {
      'fix/src/__tests__/only.test.ts': jestSource('only', 'FAIL_ONLY'),
    });
    const relativeTo = (dir: string, files: readonly string[]) =>
      files.map((file) => path.relative(dir, file).split(path.sep).join('/'));

    it("with no --roots, started in this repository: only the fixture's files", () => {
      // Without its own configuration, Jest started here reads this
      // repository's: its whole suite.
      const { jest } = listed(['--repo', repo]);
      assert.deepEqual(relativeTo(repo, jest), [
        'fix/src/__tests__/only.test.ts',
      ]);
    });

    it("with no --roots, started in the fixture: only the fixture's files", () => {
      const { jest } = listed(['--repo', repo], repo);
      assert.deepEqual(relativeTo(repo, jest), [
        'fix/src/__tests__/only.test.ts',
      ]);
    });

    it('a fixture without a Jest configuration of its own fails, listing nothing', () => {
      const bare = fixtureRepo(path.join(scratch.dir, 'bare'), [], {
        'fix/src/__tests__/only.test.ts': jestSource('only', 'FAIL_ONLY'),
      });
      fs.rmSync(path.join(bare, 'jest.config.js'));
      const run = runTool(
        'npm-test.mjs',
        ['--repo', bare, '--list'],
        environment(),
        bare,
      );
      assert.equal(run.status, 1, run.stdout + run.stderr);
      assert.equal(run.stdout, '');
    });
  });
});
