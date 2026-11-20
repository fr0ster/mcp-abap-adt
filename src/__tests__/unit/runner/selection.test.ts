/**
 * The selection guard (D27, spec §5): the runner selects its tests by a walk
 * (`walkSources`, `tools/node-test-list.mjs`), and git is what says which
 * test files exist. Every tracked `….test.ts` is selected — by the unit run,
 * by a live run, or by a run of its own (`tools/separate-runs.json`) — and
 * nothing the runner selects is untracked; every tracked test lies under a
 * test root's `__tests__`.
 *
 * The runner's selection is read as the runner reports it
 * (`run-tests.mjs --list`, a child process), never by a walk of this file's
 * own; git's as `git ls-files` reports it. Paths are compared written with
 * `/` on every platform. The guard is proved on fixture repositories of its
 * own (each a `git init` under `.test-fixtures/`).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { fixtureRepo, REPO, runTool, temporaryDir, writeAt } from './toolRuns';

const scratch = temporaryDir('selection-');
after(() => scratch.remove());

/**
 * A list of strings `tools/node-test-list.mjs` exports, read from its module:
 * data from outside the type system.
 */
function exportedList(module: unknown, name: string): string[] {
  const list: unknown =
    typeof module === 'object' && module !== null
      ? Reflect.get(module, name)
      : undefined;
  assert.ok(
    Array.isArray(list) &&
      list.every((item): item is string => typeof item === 'string'),
    `tools/node-test-list.mjs exports no ${name}`,
  );
  return list;
}

/** The runner's test roots and live roots, as the runner states them. */
let testRoots: readonly string[] = [];
let liveRoots: readonly string[] = [];
before(async () => {
  const module: unknown = await import(
    pathToFileURL(path.join(REPO, 'tools', 'node-test-list.mjs')).href
  );
  testRoots = exportedList(module, 'TEST_ROOTS');
  liveRoots = exportedList(module, 'LIVE_ROOTS');
});

/** The lines of a child's output, the empty ones dropped. */
const lines = (text: string): string[] =>
  text.split('\n').filter((line) => line !== '');

/** What the runner selects in `repo` with `args` (`--list`). */
function runnerList(repo: string, args: readonly string[]): string[] {
  const run = runTool('run-tests.mjs', ['--repo', repo, '--list', ...args]);
  assert.equal(run.status, 0, run.stderr);
  return lines(run.stdout);
}

/** Every file the runner selects in `repo`: the unit run, the live runs, the runs of their own. */
function everySelected(repo: string): string[] {
  const live = liveRoots
    .map((root) => path.join(repo, ...root.split('/')))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => ['--root', dir]);
  const separateFile = path.join(repo, 'tools', 'separate-runs.json');
  const separate: string[] = [];
  if (fs.existsSync(separateFile)) {
    const runs: unknown = JSON.parse(fs.readFileSync(separateFile, 'utf8'));
    assert.ok(typeof runs === 'object' && runs !== null);
    for (const files of Object.values(runs)) {
      assert.ok(Array.isArray(files));
      for (const file of files) separate.push(String(file));
    }
  }
  return [
    ...runnerList(repo, []),
    ...(live.length > 0 ? runnerList(repo, live) : []),
    ...separate,
  ];
}

/** `git ls-files '*.test.ts'` in `repo`: the tracked test files, written with `/`. */
function trackedTests(repo: string): string[] {
  const run = spawnSync('git', ['ls-files', '-z', '--', '*.test.ts'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error !== undefined) throw run.error;
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\0').filter((file) => file !== '');
}

/** Whether `file` lies under the `__tests__` directory of a test root. */
function underARootsTests(file: string, roots: readonly string[]): boolean {
  return roots.some(
    (root) =>
      file.startsWith(`${root}/`) &&
      file
        .slice(root.length + 1)
        .split('/')
        .slice(0, -1)
        .includes('__tests__'),
  );
}

interface Verdict {
  /** Tracked, and selected by no run. */
  notSelected: string[];
  /** Selected by a run, and not tracked. */
  notTracked: string[];
  /** Tracked, and under no test root's `__tests__`. */
  outside: string[];
}

/** The guard over `repo`: its tracked tests against every run's selection. */
function guard(repo: string): Verdict {
  const selected = new Set(everySelected(repo));
  const tracked = trackedTests(repo);
  const trackedSet = new Set(tracked);
  return {
    notSelected: tracked.filter((file) => !selected.has(file)),
    notTracked: [...selected].filter((file) => !trackedSet.has(file)).sort(),
    outside: tracked.filter((file) => !underARootsTests(file, testRoots)),
  };
}

const CLEAN: Verdict = { notSelected: [], notTracked: [], outside: [] };

/** A fixture repository holding `sources`, its files added to git's index. */
function trackedFixture(
  name: string,
  sources: Readonly<Record<string, string>>,
): string {
  const repo = fixtureRepo(path.join(scratch.dir, name), sources);
  const git = (args: readonly string[]) => {
    const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (run.error !== undefined) throw run.error;
    assert.equal(run.status, 0, run.stderr);
  };
  git(['init', '-q']);
  git(['add', '-A']);
  return repo;
}

const TEST = 'export {};\n';

describe('the selection guard', () => {
  it('selection plus live files plus separate runs equals git ls-files *.test.ts', () => {
    const verdict = guard(REPO);
    assert.ok(trackedTests(REPO).length > 0, 'git tracks no test file');
    assert.deepEqual(
      { notSelected: verdict.notSelected, notTracked: verdict.notTracked },
      { notSelected: [], notTracked: [] },
    );
  });

  it("no test file lies outside a root's __tests__", () => {
    assert.ok(testRoots.length > 0);
    assert.deepEqual(guard(REPO).outside, []);
  });
});

describe('the guard over fixture repositories', () => {
  it('a test under dist, .test-build or node_modules is not selected', () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'skipped'), {
      'src/__tests__/kept.test.ts': TEST,
      'src/__tests__/dist/a.test.ts': TEST,
      'src/dist/__tests__/b.test.ts': TEST,
      'src/__tests__/.test-build/c.test.ts': TEST,
      'src/__tests__/node_modules/pkg/d.test.ts': TEST,
    });
    assert.deepEqual(runnerList(repo, []), ['src/__tests__/kept.test.ts']);
  });

  it('a test under __fixtures__ is not selected', () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'fixtures'), {
      'src/__tests__/kept.test.ts': TEST,
      'src/__tests__/__fixtures__/a.test.ts': TEST,
      'src/__tests__/unit/__fixtures__/deeper/b.test.ts': TEST,
    });
    assert.deepEqual(runnerList(repo, []), ['src/__tests__/kept.test.ts']);
  });

  it('an untracked test file fails the guard', () => {
    const repo = trackedFixture('untracked', {
      'src/__tests__/kept.test.ts': TEST,
    });
    assert.deepEqual(guard(repo), CLEAN);
    writeAt(repo, 'src/__tests__/untracked.test.ts', TEST);
    assert.deepEqual(guard(repo), {
      ...CLEAN,
      notTracked: ['src/__tests__/untracked.test.ts'],
    });
  });

  it("a test outside every root's __tests__ fails the guard", () => {
    const repo = trackedFixture('outside', {
      'src/__tests__/kept.test.ts': TEST,
      'src/helpers/beside.test.ts': TEST,
      'other/__tests__/elsewhere.test.ts': TEST,
    });
    assert.deepEqual(guard(repo), {
      notSelected: [
        'other/__tests__/elsewhere.test.ts',
        'src/helpers/beside.test.ts',
      ],
      notTracked: [],
      outside: [
        'other/__tests__/elsewhere.test.ts',
        'src/helpers/beside.test.ts',
      ],
    });
  });

  it('paths are compared with / on every platform', () => {
    const repo = trackedFixture('separators', {
      'src/__tests__/unit/deep/nested.test.ts': TEST,
      'src/__tests__/integration/live.test.ts': TEST,
      'compact/src/__tests__/pkg.test.ts': TEST,
    });
    const selected = everySelected(repo);
    const tracked = trackedTests(repo);
    for (const file of [...selected, ...tracked]) {
      assert.equal(file.includes('\\'), false, file);
    }
    assert.deepEqual([...selected].sort(), [...tracked].sort());
    assert.deepEqual(guard(repo), CLEAN);
  });
});
