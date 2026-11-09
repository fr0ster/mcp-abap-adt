// The node:test runner (D27): runs `node --test` over the compiled files of
// the node:test list, on every platform the repository supports.
//
//   node tools/run-tests.mjs --concurrency <N> [--root <dir>]... [--repo <dir>]
//     [--env NAME=VALUE]... [--list] [node --test options]... [files]...
//
// - With no file, it runs the compiled file of every source on the list
//   (`tools/node-test-files.json`), under `.test-build/tree/` (`npm run
//   test:build` makes it). `--root <dir>` keeps the sources under that
//   directory (repeatable; the sub-packages' `--roots` reach it through
//   `tools/npm-test.mjs`). A selection with no file is refused: `node --test`
//   given no file looks for files of its own, and a broken list would pass.
// - A file named is run as named and must exist: a `….test.ts` source is run
//   as its compiled file, which must exist too; a `….test.js` file as it is.
//   With `--root`, a named file outside every root is not run (as Jest's
//   `--roots` does), and a selection left empty is refused.
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
// - The live suites (`src/__tests__/integration/`, `src/__tests__/admin/`)
//   run only under a live npm script (`npm_lifecycle_event` in
//   `LIVE_SCRIPTS`, `src/__tests__/integration/helpers/liveScripts.ts`): a
//   run with no root and no named file leaves them out, and a root or a
//   named file reaching them outside a live script is refused, so `npm test`
//   never reaches a system.
// - Under a live script the runner calls the live run's setup in its own
//   process before `node --test` starts (`setUpLiveRun`, with the files
//   named), and its teardown after it ends, whatever its outcome
//   (`tearDownLiveRun`); the run fails when either the run or the teardown
//   fails.
//
// Every file's process preloads the compiled resolve hook
// (`src/__tests__/helpers/resolvePreload.ts`), which answers this
// repository's package names with their compiled files, and the per-file
// close (`src/__tests__/integration/helpers/closeConnectionsPreload.ts`): a
// root `after` that closes the connections the file opened through the
// helpers, after every hook of the file.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
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

/** The directories of `--root`, each required to exist. */
function rootDirs() {
  return roots.map((root) => {
    const dir = resolve(root);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      fail(`--root ${root}: no such directory`);
    }
    return dir;
  });
}

/** Whether `file` is under a root asked for; with no root, every file is. */
function inRoots(dirs, file) {
  return dirs.length === 0 || dirs.some((dir) => isUnder(dir, file));
}

/** The directories of the live suites, by their repository paths. */
const LIVE_ROOTS = ['src/__tests__/integration/', 'src/__tests__/admin/'];

/** Whether `source` (a repository source path) is a live suite's file. */
function isLiveSource(source) {
  return LIVE_ROOTS.some((root) => source.startsWith(root));
}

/** The compiled module `parts` of this repository's build, required. */
function ownCompiled(...parts) {
  const file = join(buildDir(OWN_REPO), ...parts);
  if (!existsSync(file)) {
    fail(`${file} does not exist — run the test build first`);
  }
  return file;
}

const ownRequire = createRequire(import.meta.url);

/** Whether the running npm script is a live one (`LIVE_SCRIPTS`). */
function liveScriptRunning() {
  const { isLiveScript } = ownRequire(
    ownCompiled('src', '__tests__', 'integration', 'helpers', 'liveScripts.js'),
  );
  return isLiveScript(env.npm_lifecycle_event);
}

/**
 * The sources of the list under the roots asked for, or all of them but the
 * live suites' when no root is asked for.
 */
function selectedSources() {
  const dirs = rootDirs();
  return readList(repo).filter(
    (source) =>
      inRoots(dirs, sourceFile(repo, source)) &&
      (dirs.length > 0 || !isLiveSource(source)),
  );
}

/**
 * The named files under the roots asked for: a named file outside every
 * root is not run, as Jest does with its `--roots`.
 */
function selectedNamed() {
  const dirs = rootDirs();
  return named.filter((arg) => inRoots(dirs, resolve(arg)));
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
  for (const source of named.length > 0 ? selectedNamed() : selectedSources()) {
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

/** A repository source path of `file`, when it is one of `repo`'s. */
function repoSource(file) {
  const absolute = resolve(file);
  return isUnder(repo, absolute)
    ? relative(repo, absolute).split(sep).join('/')
    : undefined;
}

let files;
let sourcesRun;
if (named.length > 0) {
  const chosen = selectedNamed();
  if (chosen.length === 0) {
    fail(`no named file under ${roots.join(', ')}: no test file to run`);
  }
  files = chosen.map(namedFile);
  sourcesRun = chosen.map((arg) => repoSource(arg) ?? arg);
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
  sourcesRun = sources;
}

const live = sourcesRun.some(isLiveSource);
const liveScript = liveScriptRunning();
if (live && !liveScript) {
  fail(
    `a live suite runs only under a live npm script (${LIVE_ROOTS.join(', ')}): ${sourcesRun
      .filter(isLiveSource)
      .join(', ')}`,
  );
}

const preload = ownCompiled('src', '__tests__', 'helpers', 'resolvePreload.js');
const closePreload = ownCompiled(
  'src',
  '__tests__',
  'integration',
  'helpers',
  'closeConnectionsPreload.js',
);

/** The live run's setup or teardown module, compiled, its siblings resolved. */
function liveRunModule(name) {
  // The setup's sibling packages resolve as in every file's process.
  ownRequire(preload);
  return ownRequire(
    ownCompiled('src', '__tests__', 'integration', `${name}.js`),
  );
}

if (liveScript) {
  // The setup and the teardown run in this process and read its
  // environment: the run's own (`--env` included) is set here first, and
  // what the setup sets (the run's directory above all) reaches the files.
  Object.assign(process.env, env);
  const { setUpLiveRun } = liveRunModule('globalSetup');
  try {
    await setUpLiveRun({ rootDir: OWN_REPO, named });
  } catch (error) {
    fail(
      `the live setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  Object.assign(env, process.env);
}

const run = spawnSync(
  process.execPath,
  [
    '--require',
    preload,
    '--require',
    closePreload,
    '--test',
    `--test-concurrency=${concurrency}`,
    ...options,
    ...files,
  ],
  { stdio: 'inherit', env },
);
let status = run.status ?? 1;
if (run.error !== undefined) {
  console.error(`run-tests: node --test did not start: ${run.error}`);
  status = 1;
}
if (liveScript) {
  const { tearDownLiveRun } = liveRunModule('globalTeardown');
  try {
    await tearDownLiveRun({ rootDir: OWN_REPO });
  } catch (error) {
    console.error(
      `run-tests: the live teardown failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    status = 1;
  }
}
process.exit(status);
