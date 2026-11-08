// The node:test runner (D27): runs `node --test` over the compiled files of
// the node:test list, on every platform the repository supports.
//
//   node tools/run-tests.mjs --concurrency <N> [--root <dir>]... [--repo <dir>]
//     [--env NAME=VALUE]... [--list] [node --test options]... [files]...
//
// - With no file, it runs the compiled file of every source on the list
//   (`tools/node-test-files.json`), under `.test-build/` (`npm run
//   test:build` makes it). `--root <dir>` keeps the sources under that
//   directory (repeatable; the sub-packages' `--roots` reach it through
//   `tools/npm-test.mjs`). A selection with no file is refused: `node --test`
//   given no file looks for files of its own, and a broken list would pass.
// - A file named is run as named and must exist: a `….test.ts` source is run
//   as its compiled file, which must exist too; a `….test.js` file as it is.
// - `--concurrency <N>` is how many files run at once; without it, the
//   variable `TEST_CONCURRENCY` gives it (the last `--concurrency` wins over
//   the variable). With neither, the run is refused: there is no default — the
//   figure is the resources' of the machine running it. `--test-concurrency`
//   given directly is refused for the same reason, and `--test-isolation`
//   because every file runs in a process of its own, node:test's default,
//   never overridden.
// - Options go to `node --test` before the files: after a file, `node --test`
//   ignores them.
// - `--env NAME=VALUE` sets a variable for the run; a shell prefix
//   (`NAME=1 npm …`) does not work on Windows. No shell runs anything here.
// - `--list` prints the source paths of the selection, one per line, and runs
//   nothing (an empty selection prints nothing and is no error).
// - `--repo <dir>` reads another repository's list and build (the runner's
//   own tests use fixture repositories); the preload is always this
//   repository's.
//
// Every file's process preloads the compiled resolve hook
// (`src/__tests__/helpers/resolvePreload.ts`), which answers this
// repository's package names with their compiled files.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  buildDir,
  compiledFile,
  OWN_REPO,
  readList,
  sourceFile,
} from './node-test-list.mjs';

const CONCURRENCY_VARIABLE = 'TEST_CONCURRENCY';

function fail(words) {
  console.error(`run-tests: ${words}`);
  process.exit(1);
}

const env = { ...process.env };
const options = [];
const named = [];
const roots = [];
let repo = OWN_REPO;
let concurrency;
let listOnly = false;

/** The value after option `args[i]`, or the run is refused. */
function optionValue(args, i) {
  if (i + 1 >= args.length) fail(`${args[i]} takes a value`);
  return args[i + 1];
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--env') {
    const pair = optionValue(args, i);
    i += 1;
    const eq = pair.indexOf('=');
    if (eq < 1) fail(`--env takes NAME=VALUE, got "${pair}"`);
    env[pair.slice(0, eq)] = pair.slice(eq + 1);
  } else if (arg === '--concurrency') {
    concurrency = optionValue(args, i);
    i += 1;
  } else if (arg === '--root') {
    roots.push(optionValue(args, i));
    i += 1;
  } else if (arg === '--repo') {
    repo = optionValue(args, i);
    i += 1;
  } else if (arg === '--list') {
    listOnly = true;
  } else if (arg.startsWith('--test-concurrency')) {
    fail(
      `${arg}: the number of files at once is --concurrency <N> or ${CONCURRENCY_VARIABLE}`,
    );
  } else if (arg.startsWith('--test-isolation')) {
    fail(`${arg}: every file runs in a process of its own`);
  } else if (arg.endsWith('.test.ts') || arg.endsWith('.test.js')) {
    named.push(arg);
  } else {
    options.push(arg);
  }
}

/** Whether `file` is `dir` or under it. */
function isUnder(dir, file) {
  const rel = relative(dir, file);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** The sources of the list under the roots asked for, or all of them. */
function selectedSources() {
  const listed = readList(repo);
  if (roots.length === 0) return listed;
  const dirs = roots.map((root) => {
    const dir = resolve(root);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      fail(`--root ${root}: no such directory`);
    }
    return dir;
  });
  return listed.filter((source) =>
    dirs.some((dir) => isUnder(dir, sourceFile(repo, source))),
  );
}

/** A named file as the compiled file to run. */
function namedFile(arg) {
  const file = resolve(arg);
  if (!existsSync(file)) fail(`${arg} does not exist`);
  if (arg.endsWith('.test.js')) return file;
  if (!isUnder(repo, file)) fail(`${arg} is not a source of ${repo}`);
  const source = relative(repo, file).split(sep).join('/');
  const compiled = compiledFile(repo, source);
  if (!existsSync(compiled)) {
    fail(`${arg} has no compiled file — run the test build first`);
  }
  return compiled;
}

if (listOnly) {
  for (const source of named.length > 0 ? named : selectedSources()) {
    console.log(source);
  }
  process.exit(0);
}

if (concurrency === undefined) concurrency = env[CONCURRENCY_VARIABLE];
if (concurrency === undefined) {
  fail(
    `no concurrency: give --concurrency <N> or set ${CONCURRENCY_VARIABLE} (the number of test files run at once)`,
  );
}
const digits = '0123456789';
if (
  concurrency === '' ||
  concurrency.startsWith('0') ||
  [...concurrency].some((character) => !digits.includes(character))
) {
  fail(`concurrency "${concurrency}" is not a positive integer`);
}

let files;
if (named.length > 0) {
  files = named.map(namedFile);
} else {
  const sources = selectedSources();
  if (sources.length === 0) {
    fail(
      roots.length === 0
        ? 'the node:test list is empty: no test file to run'
        : `no file of the node:test list under ${roots.join(', ')}: no test file to run`,
    );
  }
  if (!existsSync(buildDir(repo))) {
    fail(`${buildDir(repo)} does not exist — run the test build first`);
  }
  files = sources.map((source) => {
    const compiled = compiledFile(repo, source);
    if (!existsSync(compiled)) {
      fail(`${source} has no compiled file — run the test build first`);
    }
    return compiled;
  });
}

const preload = join(
  buildDir(OWN_REPO),
  'src',
  '__tests__',
  'helpers',
  'resolvePreload.js',
);
if (!existsSync(preload)) {
  fail(`${preload} does not exist — run the test build first`);
}

const run = spawnSync(
  process.execPath,
  [
    '--require',
    preload,
    '--test',
    `--test-concurrency=${concurrency}`,
    ...options,
    ...files,
  ],
  { stdio: 'inherit', env },
);
if (run.error !== undefined) fail(`node --test did not start: ${run.error}`);
process.exit(run.status ?? 1);
