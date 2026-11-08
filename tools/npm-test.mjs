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
// - Every other argument is Jest's, and Jest's own parser reads it:
//   `jest-cli`'s `buildArgv` (its declared export, the function `jest` itself
//   reads its command line with: yargs with Jest's option table, its checks,
//   and its refusal of an unknown option), resolved from the installed
//   `jest`. Its positional arguments (`_`) are the named files and patterns;
//   an option's value is never one. What it refuses, nothing runs for, with
//   its words. The arguments go to Jest as they were given, each of the
//   tool's own options (`--roots`, `--concurrency`, `--repo`, `--list`)
//   replaced by a boundary that keeps the reading of what follows it; the
//   options the tool adds go before the first `--`, so none reads as a
//   positional. `--help` and `--version` are Jest's: they print and end
//   the run, `--list` or not.
// - A positional `….test.ts` on the node:test list goes to the runner; every
//   other positional (a file or a pattern) is Jest's — by path
//   (`--runTestsByPath`) when every one is an existing file, else all as
//   patterns, as Jest has always read them. Jest is handed the positionals
//   as given, the runner's among them: its configuration ignores every file
//   of the list. A runner given no named `….test.ts` while others were named
//   is skipped, and so is Jest when no positional is left for it. With
//   `--roots`, a named file outside every root runs on neither (Jest applies
//   its `--roots`, by path too; the runner's selection is intersected with
//   the roots, and an empty one skips the runner).
// - `--concurrency <N>` goes to the runner; given twice, the last wins. The
//   `test` script passes `2`, the measured setting for a developer machine
//   (docs/development/tests/TESTING_GUIDE.md, "Concurrency is a setting");
//   CI passes its own per cell after it (`npm test -- --concurrency <N>`).
//   `TEST_CONCURRENCY` reaches the runner when no option is given.
// - `--repo <dir>` goes to the build and the runner, and to Jest as its
//   configuration, `<dir>/jest.config.js`, unless `--config` is given:
//   a fixture repository in the runner's own tests is a repository of its
//   own on both runners, so no run of a fixture reaches this repository's
//   suite.
// - `--list` runs nothing: it prints one JSON object, `{ jest, nodeTest }`,
//   the files each would run (Jest's `--listTests --json`, the runner's
//   `--list`).
//
// The build (`build-node-tests.mjs`) runs after Jest and before the runner,
// so a compile error in a node:test file does not hide Jest's result; when it
// fails, the runner does not run and the run fails.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWN_REPO } from './node-test-list.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);
const JEST = requireHere.resolve('jest/bin/jest');
// Jest's command-line parser: `jest-cli` is Jest's own dependency, resolved
// from the installed `jest`; `buildArgv` is its declared export.
const { buildArgv } = createRequire(requireHere.resolve('jest/package.json'))(
  'jest-cli',
);

function refuse(words) {
  console.error(`npm-test: ${words}`);
  process.exit(1);
}

const roots = [];
const jestArgs = [];
const runnerArgs = [];
let repo;
let listOnly = false;

// The tool's own options; everything else, in order, is Jest's. After `--`
// every argument is a positional, Jest's. Each of the tool's options taken
// out leaves `BOUNDARY` in its place, so what follows reads as it did:
// without it, `--reporters default --roots src secondSuite` would hand Jest
// `--reporters default secondSuite`, and `secondSuite` would be a reporter.
// The boundary is an option Jest knows that changes nothing — the tool
// passes `--passWithNoTests` to Jest in any case — written with its value,
// so it takes no `true` / `false` after it.
const BOUNDARY = '--passWithNoTests=true';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const takesValue =
    arg === '--roots' || arg === '--concurrency' || arg === '--repo';
  if (takesValue && i + 1 >= args.length) {
    refuse(`${arg} takes a value`);
  }
  if (arg === '--roots') {
    roots.push(args[i + 1]);
    i += 1;
  } else if (arg.startsWith('--roots=')) {
    roots.push(arg.slice('--roots='.length));
  } else if (arg === '--concurrency') {
    runnerArgs.push('--concurrency', args[i + 1]);
    i += 1;
  } else if (arg === '--repo') {
    repo = args[i + 1];
    i += 1;
  } else if (arg === '--list') {
    listOnly = true;
  } else if (arg === '--') {
    jestArgs.push(...args.slice(i));
    break;
  } else {
    jestArgs.push(arg);
    continue;
  }
  jestArgs.push(BOUNDARY);
}

// Jest's reading of its arguments. A refusal of yargs' own (a failed check)
// is printed by yargs, which ends the process, as under `jest`; Jest's
// refusal of an unknown option is thrown, and refused here in its words.
let jestArgv;
try {
  jestArgv = await buildArgv(jestArgs);
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
// yargs reads a positional that looks like a number as one (`1e3` is
// `1000`), and Jest takes it so: the text is the number's.
const positionals = jestArgv._.map(String);
const named = positionals.filter((arg) => arg.endsWith('.test.ts'));
const repoArgs = repo === undefined ? [] : ['--repo', repo];
const rootArgs = roots.flatMap((root) => ['--root', root]);
const configArgs =
  repo === undefined || jestArgv.config !== undefined
    ? []
    : [`--config=${join(resolve(repo), 'jest.config.js')}`];

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
// Every positional not on the list is Jest's: a file or a pattern.
const jestPositionals = positionals.filter((arg) => !isListed(arg));

const runJest = named.length === 0 || jestPositionals.length > 0;
const runnerSelection = named.length > 0 ? namedRunner : runnerList(rootArgs);
// Jest's positionals go by path (`--runTestsByPath`) when every one is an
// existing file: Jest reads a positional argument as a regular expression
// over the path, and a path is not one — a `+` or `(` in it, or on Windows a
// separator before a `.` (as in `\.test-fixtures`), keeps the file from
// matching itself. By path, the roots and the ignores still apply. When any
// positional is not an existing file (a pattern, a `….test.ts` that is not
// there), every one is a pattern, as Jest has always read them: Jest reads
// them all one way.
const isFile = (arg) =>
  statSync(resolve(arg), { throwIfNoEntry: false })?.isFile() === true;
const byPath =
  jestPositionals.length > 0 && jestPositionals.every((arg) => isFile(arg));
// Jest's arguments as given, the tool's own added before the first `--`
// (after it every argument is a positional): each root as `--roots=<dir>`,
// after every argument given, since Jest's array options (`--roots` among
// them) take every value after them, so a positional after one would be one
// of its values. What follows an added option is an option or `--`.
const end = jestArgs.indexOf('--');
const givenBefore = end < 0 ? jestArgs : jestArgs.slice(0, end);
const givenAfter = end < 0 ? [] : jestArgs.slice(end);
function jestCommand(extra) {
  return [
    ...givenBefore,
    '--passWithNoTests',
    ...(byPath ? ['--runTestsByPath'] : []),
    ...roots.map((root) => `--roots=${root}`),
    ...configArgs,
    ...extra,
    ...givenAfter,
  ];
}

if (listOnly) {
  let jest = [];
  if (runJest) {
    const run = node(JEST, jestCommand(['--listTests', '--json']), true);
    if (run.status !== 0) process.exit(1);
    jest = JSON.parse(run.stdout);
  }
  console.log(JSON.stringify({ jest, nodeTest: runnerSelection }));
  process.exit(0);
}

let failed = false;
if (runJest) {
  failed = node(JEST, jestCommand([]), false).status !== 0;
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
