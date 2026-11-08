// `npm test` (D27): Jest over its files, then the node:test build and the
// runner over the listed files — both runners even when the first fails; the
// run fails when either does, so one run shows every failing file.
//
//   node tools/npm-test.mjs [--concurrency <N>] [--roots <dir>]... [--repo <dir>]
//     [--list] [named ….test.ts files]... [Jest options]...
//
// - `--roots <dir>` (the form every sub-package's `test` script forwards,
//   `npm --prefix .. test -- --roots <package>/src`) goes to Jest as
//   `--roots` and to the runner as `--root`. A root with no file of the
//   node:test list (every sub-package until its first file moves) runs Jest
//   alone, and a line says the runner was skipped.
// - A named `….test.ts` file on the node:test list goes to the runner, any
//   other to Jest (by path when every such file exists, else as patterns); a runner given no named file while others were named is
//   skipped, and so is Jest. With `--roots`, a named file outside every root
//   runs on neither (Jest applies its `--roots`; the runner's selection is
//   intersected with the roots, and an empty one skips the runner).
// - `--concurrency <N>` goes to the runner. The `test` script passes `1`:
//   today's in-band behaviour, until the concurrency is measured (plan
//   step 8). `TEST_CONCURRENCY` reaches the runner when no option is given.
// - `--repo <dir>` goes to the build and the runner (fixture repositories in
//   the runner's own tests).
// - `--list` runs nothing: it prints one JSON object, `{ jest, nodeTest }`,
//   the files each would run (Jest's `--listTests --json`, the runner's
//   `--list`).
// - Everything else is Jest's (`-t`, `--testNamePattern`, `--config`, …).
//
// The build (`build-node-tests.mjs`) runs after Jest and before the runner,
// so a compile error in a node:test file does not hide Jest's result; when it
// fails, the runner does not run and the run fails.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWN_REPO } from './node-test-list.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const JEST = createRequire(import.meta.url).resolve('jest/bin/jest');

const roots = [];
const named = [];
const jestArgs = [];
const runnerArgs = [];
let repo;
let listOnly = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const takesValue =
    arg === '--roots' || arg === '--concurrency' || arg === '--repo';
  if (takesValue && i + 1 >= args.length) {
    console.error(`npm-test: ${arg} takes a value`);
    process.exit(1);
  }
  if (arg === '--roots') {
    roots.push(args[i + 1]);
    i += 1;
  } else if (arg === '--concurrency') {
    runnerArgs.push('--concurrency', args[i + 1]);
    i += 1;
  } else if (arg === '--repo') {
    repo = args[i + 1];
    i += 1;
  } else if (arg === '--list') {
    listOnly = true;
  } else if (arg.endsWith('.test.ts')) {
    named.push(arg);
  } else {
    jestArgs.push(arg);
  }
}
const repoArgs = repo === undefined ? [] : ['--repo', repo];
const rootArgs = roots.flatMap((root) => ['--root', root]);

function node(script, scriptArgs, capture) {
  const run = spawnSync(process.execPath, [script, ...scriptArgs], {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error !== undefined) {
    console.error(`npm-test: ${script} did not start: ${run.error}`);
  }
  return run;
}

/** The runner's `--list`: the source paths it would run. */
function runnerList(listArgs) {
  const run = node(
    join(TOOLS, 'run-tests.mjs'),
    [...repoArgs, ...listArgs, '--list'],
    true,
  );
  if (run.status !== 0) process.exit(1);
  return run.stdout.split('\n').filter((line) => line !== '');
}

// Named files: those on the node:test list are the runner's.
const listed = new Set(runnerList([]));
const ownRepo = repo === undefined ? OWN_REPO : resolve(repo);
const isListed = (file) =>
  listed.has(relative(ownRepo, resolve(file)).split(sep).join('/'));
// With `--roots`, a named file outside every root runs on neither runner:
// Jest applies its `--roots` to it, and the runner's list mode does the same.
// No named file on the list is an empty selection, never the whole list.
const namedListed = named.filter(isListed);
const namedRunner =
  namedListed.length > 0 && roots.length > 0
    ? runnerList([...rootArgs, ...namedListed])
    : namedListed;
const namedJest = named.filter((file) => !isListed(file));

const runJest = named.length === 0 || namedJest.length > 0;
const runnerSelection = named.length > 0 ? namedRunner : runnerList(rootArgs);
// Named files that all exist go to Jest with `--runTestsByPath`: Jest reads
// a positional argument as a regular expression over the path, and a path is
// not one — a `+` or `(` in it, or on Windows a separator before a `.` (as
// in `\.test-fixtures`), keeps the file from matching itself. By path, the
// roots and the ignores still apply. A named `….test.ts` that is not an
// existing file is a pattern, as Jest has always read it, and then every
// positional argument is a pattern (Jest reads them all one way).
const byPath =
  namedJest.length > 0 && namedJest.every((file) => existsSync(resolve(file)));
// The named files come first and each root as `--roots=<dir>`: Jest's
// `--roots` takes every value after it, so `--roots <dir> <file>` would make
// the file a root.
const jestRun = [
  '--passWithNoTests',
  ...(byPath ? ['--runTestsByPath'] : []),
  ...namedJest,
  ...roots.map((root) => `--roots=${root}`),
  ...jestArgs,
];

if (listOnly) {
  let jest = [];
  if (runJest) {
    const run = node(JEST, [...jestRun, '--listTests', '--json'], true);
    if (run.status !== 0) process.exit(1);
    jest = JSON.parse(run.stdout);
  }
  console.log(JSON.stringify({ jest, nodeTest: runnerSelection }));
  process.exit(0);
}

let failed = false;
if (runJest) {
  failed = node(JEST, jestRun, false).status !== 0;
} else {
  console.log('npm-test: every named file is a node:test file; Jest skipped');
}

if (runnerSelection.length === 0) {
  console.log(
    named.length === 0
      ? `npm-test: no node:test file under ${roots.join(', ') || 'the node:test list'}; the runner skipped`
      : roots.length === 0
        ? 'npm-test: no named file is a node:test file; the runner skipped'
        : `npm-test: no named node:test file under ${roots.join(', ')}; the runner skipped`,
  );
} else if (
  node(join(TOOLS, 'build-node-tests.mjs'), repoArgs, false).status !== 0
) {
  console.error('npm-test: the node:test build failed; the runner not run');
  failed = true;
} else {
  const run = node(
    join(TOOLS, 'run-tests.mjs'),
    [...repoArgs, ...runnerArgs, ...rootArgs, ...namedRunner],
    false,
  );
  failed = run.status !== 0 || failed;
}
process.exit(failed ? 1 : 0);
