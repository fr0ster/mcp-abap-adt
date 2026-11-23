// The test runner (D27): runs `node --test` over the compiled files of the
// test selection, on every platform the repository supports.
//
//   node tools/run-tests.mjs --concurrency <N> [--root <dir>]... [--repo <dir>]
//     [--env NAME=VALUE]... [--file-timeout <seconds>] [--list]
//     [node --test options]... [files]...
//
// - With no file, it runs the compiled file, under `.test-build/tree/` (`npm
//   run test:build` makes it), of every test the selection walks
//   (`walkSources`, `tools/node-test-list.mjs`: each `….test.ts` under a
//   `__tests__` directory of the test roots). `--root <dir>` keeps the
//   sources under that directory (repeatable; each sub-package's `test`
//   script passes its own `src`). A selection with no file is refused:
//   `node --test` given no file looks for files of its own, and a broken
//   walk would pass.
// - A file named is run as named and must exist: a `….test.ts` source is run
//   as its compiled file, which must exist too; a `….test.js` file as it is.
//   With `--root`, a named file outside every root is not run, and a
//   selection left empty is refused.
// - `--concurrency <N>` is how many files run at once; without it, the
//   variable `TEST_CONCURRENCY` gives it (the last `--concurrency` wins over
//   the variable). With neither, the run is refused: there is no default — the
//   figure is the resources' of the machine running it. `--test-concurrency`
//   given directly is refused for the same reason, and `--test-isolation`
//   because every file runs in a process of its own, node:test's default,
//   never overridden.
// - An argument starting with `-` is an option, never a file, and so is the
//   value after an option that takes one (`--test-name-pattern <x>`, …).
//   Only node's `--test-*` options reach `node --test`; any other option, and
//   any argument that is not a `….test.ts` / `….test.js` file (a directory
//   above all, which node would expand itself, past the live check), is
//   refused before anything runs: a directory is selected with `--root`.
// - Options go to `node --test` before the files: after a file, `node --test`
//   ignores them.
// - `--env NAME=VALUE` sets a variable for the run; a shell prefix
//   (`NAME=1 npm …`) does not work on Windows. No shell runs anything here.
// - `--list` prints the source paths of the selection, one per line, and runs
//   nothing (an empty selection prints nothing and is no error).
// - `--repo <dir>` walks another repository's tests and reads its build (the
//   runner's own tests use fixture repositories); the preload is always this
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
// - Every file runs in a `node --test` of its own, in a process group of its
//   own (`detached`; on Windows a console process group of its own), at most
//   `--concurrency` at once: a terminal's Ctrl-C reaches the runner alone
//   (D27, P8). On the first interrupt the runner starts no further file,
//   writes the stop file it names to every file (`MCP_ABAP_ADT_STOP_FILE`) —
//   a live suite then finishes the case it runs, that case's cleanup
//   included, and skips the rest (`liveDescribe`) —, says on stderr that it
//   waits, and waits for every running file to end by itself. On the second
//   it ends the process tree of every file still running. Either way the
//   run fails, and under a live script the teardown still runs.
//
// - `--file-timeout <seconds>` (1 to 2147483; the last one given wins)
//   bounds each file's process (`tools/file-bound.mjs`): a file still
//   running when it expires has its process tree ended as it is then
//   (`endTree`: every descendant still under it, whatever group or session
//   it is in; one reparented away before is not reached), and once its
//   close is seen it is named on stderr with the last test it started (the
//   preload `runningTestPreload.ts` writes each starting test's name to the
//   file's own `MCP_ABAP_ADT_STARTED_FILE`; no file inherits one) and fails
//   the run. A tree that cannot be ended is a failure at once, its file not
//   waited for. The other files run on, and the run's end lists every file
//   past the bound, `stopped` or `kill failed`. A file that exits first, or exits `0` while being stopped, has
//   passed. Without the option there is no bound; it is refused under a live
//   npm script and for any file under a live root by its place on disk
//   (`__tests__/integration`, `__tests__/admin`), so a live run is never
//   bounded. The
//   unit run (`npm test`) passes it: a file that hangs (a macOS `fs.watch`
//   race in CI jobs 137629013868 and 137761023526) fails with its name
//   instead of running until the job's own timeout cancels the job. Its
//   figure, 600 s, is over 3x the slowest file measured: 194.5 s
//   (`unknownSweep.test.ts`, macOS + Node 24, CI, 2026-11-23; 120 s on
//   Linux locally), and keeps a job with two hanging files inside CI's 45
//   minutes.
//
// Every file's process may mock a module (`--experimental-test-module-mocks`,
// node:test's `mock.module`; `src/__tests__/helpers/moduleMock.ts`).
//
// Every file's process preloads the compiled resolve hook
// (`src/__tests__/helpers/resolvePreload.ts`), which answers this
// repository's package names with their compiled files, and the per-file
// close (`src/__tests__/integration/helpers/closeConnectionsPreload.ts`): a
// root `after` that closes the connections the file opened through the
// helpers, after every hook of the file.
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  endTree,
  isLiveFile,
  isLiveSource as isLiveSourceIn,
  MAX_BOUND_SECONDS,
  watchFile,
  writeFlushed,
} from './file-bound.mjs';
import {
  buildDir,
  compiledFile,
  LIVE_ROOTS,
  OWN_REPO,
  separateSources,
  sourceFile,
  walkSources,
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
let fileTimeout;
let listOnly = false;

/**
 * The `node --test` options that take their value as the next argument: that
 * argument is the option's value, never a file.
 */
const VALUE_OPTIONS = [
  '--test-name-pattern',
  '--test-skip-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-global-setup',
];

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
  } else if (arg === '--file-timeout') {
    fileTimeout = optionValue(args, i);
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
  } else if (VALUE_OPTIONS.includes(arg)) {
    // `--opt value`: both are node's, the value never a file.
    options.push(arg, optionValue(args, i));
    i += 1;
  } else if (
    !arg.startsWith('-') &&
    (arg.endsWith('.test.ts') || arg.endsWith('.test.js'))
  ) {
    named.push(arg);
  } else if (arg.startsWith('--test-')) {
    options.push(arg);
  } else {
    // Only node's `--test-*` options reach `node --test`: a directory or any
    // other argument forwarded there would be expanded by node, past the
    // live check.
    fail(
      arg.startsWith('-')
        ? `${arg}: not an option of the runner, and only --test-* options reach node --test`
        : `${arg}: not a test file — name a ….test.ts or ….test.js file, or select a directory with --root <dir>`,
    );
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

/** Whether `source` (a repository source path) is a live suite's file. */
function isLiveSource(source) {
  return isLiveSourceIn(source, LIVE_ROOTS);
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
 * The walked sources under the roots asked for, or all of them but the live
 * suites' when no root is asked for; never a run of its own's.
 */
function selectedSources() {
  const dirs = rootDirs();
  const separate = separateSources(repo);
  return walkSources(repo).filter(
    (source) =>
      inRoots(dirs, sourceFile(repo, source)) &&
      (dirs.length > 0 || !isLiveSource(source)) &&
      !separate.has(source),
  );
}

/** The named files under the roots asked for: one outside every root is not run. */
function selectedNamed() {
  const dirs = rootDirs();
  return named.filter((arg) => inRoots(dirs, resolve(arg)));
}

/** A named file as the compiled file to run. */
function namedFile(arg) {
  const file = resolve(arg);
  if (!existsSync(file)) fail(`${arg} does not exist`);
  // A regular file only: node would expand a directory named ….test.ts
  // itself, past the live check.
  if (!statSync(file).isFile()) fail(`${arg} is not a file`);
  if (arg.endsWith('.test.js')) return file;
  if (!isUnder(repo, file)) fail(`${arg} is not a source of ${repo}`);
  const source = relative(repo, file).split(sep).join('/');
  const compiled = compiledFile(repo, source);
  if (!existsSync(compiled) || !statSync(compiled).isFile()) {
    fail(`${arg} has no compiled file — run the test build first`);
  }
  return compiled;
}

/** Whether `value` is a positive integer written in digits only. */
function positiveInteger(value) {
  const digits = '0123456789';
  return (
    value !== '' &&
    !value.startsWith('0') &&
    [...value].every((character) => digits.includes(character))
  );
}

if (fileTimeout !== undefined) {
  if (
    !positiveInteger(fileTimeout) ||
    fileTimeout.length > String(MAX_BOUND_SECONDS).length ||
    Number(fileTimeout) > MAX_BOUND_SECONDS
  ) {
    fail(
      `--file-timeout "${fileTimeout}" is not a positive integer of seconds up to ${MAX_BOUND_SECONDS}`,
    );
  }
  if (liveScriptRunning()) {
    fail(
      '--file-timeout is refused under a live npm script: a live run has no bound',
    );
  }
}

if (listOnly) {
  const listed = named.length > 0 ? selectedNamed() : selectedSources();
  // Flushed before the exit: a pipe's write is asynchronous on macOS and
  // Windows, and an exit right after it can cut the list.
  await new Promise((done) =>
    process.stdout.write(listed.map((source) => `${source}\n`).join(''), done),
  );
  process.exit(0);
}

if (concurrency === undefined) concurrency = env[CONCURRENCY_VARIABLE];
if (concurrency === undefined) {
  fail(
    `no concurrency: give --concurrency <N> or set ${CONCURRENCY_VARIABLE} (the number of test files run at once)`,
  );
}
if (!positiveInteger(concurrency)) {
  fail(`concurrency "${concurrency}" is not a positive integer`);
}

/**
 * A repository source path of `file`, when it is one of `repo`'s: a compiled
 * file under the build (`.test-build/tree/…test.js`) is its source
 * (`…test.ts`), so the live refusal reads a compiled live suite as one.
 */
function repoSource(file) {
  const absolute = resolve(file);
  if (isUnder(buildDir(repo), absolute) && absolute.endsWith('.test.js')) {
    const compiled = relative(buildDir(repo), absolute).split(sep).join('/');
    return `${compiled.slice(0, -'.js'.length)}.ts`;
  }
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
        ? 'no test file found: no test file to run'
        : `no test file under ${roots.join(', ')}: no test file to run`,
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

if (fileTimeout !== undefined) {
  // By where each file is on disk, whatever `--repo` says: a live or
  // integration file is never bounded.
  // Called with the file alone: `filter`'s index would be read as the
  // platform, and Windows would compare case.
  const liveFiles = files.filter((file) => isLiveFile(file));
  if (liveFiles.length > 0) {
    fail(
      `--file-timeout is refused for a live or integration file: ${liveFiles.join(', ')}`,
    );
  }
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
// The running case, for a live helper's skip (`runningTestPreload.ts`).
const runningPreload = ownCompiled(
  'src',
  '__tests__',
  'integration',
  'helpers',
  'runningTestPreload.js',
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

// The stop file the runner owns: written on the first interrupt.
const stopDir = mkdtempSync(join(tmpdir(), 'run-tests-stop-'));
const STOP_FILE = join(stopDir, 'stop');
env.MCP_ABAP_ADT_STOP_FILE = STOP_FILE;

/** The files' processes still running, by pid. */
const running = new Map();
let interrupts = 0;

/** Ends the process tree of `child` (`endTree`, `file-bound.mjs`). */
function endChildTree(child) {
  const ended = endTree(child.pid);
  if (!ended.ok) {
    console.error(
      `run-tests: a file's process tree could not be ended: ${ended.reason}`,
    );
  }
  return ended;
}

process.on('SIGINT', () => {
  interrupts += 1;
  if (interrupts === 1) {
    writeFileSync(STOP_FILE, 'interrupted');
    console.error(
      'run-tests: interrupted — no further file starts; the running files finish their current case and its cleanup. Interrupt again to stop them now.',
    );
    return;
  }
  console.error(
    'run-tests: interrupted again — the running files are stopped.',
  );
  for (const child of running.values()) endChildTree(child);
});

/**
 * The files that ran past the bound: their source path, and `stopped` or
 * `kill failed` (their tree could not be ended whole).
 */
const pastBound = [];
let startedFiles = 0;

/** The variable naming where a file's process writes each test it starts. */
const STARTED_VARIABLE = 'MCP_ABAP_ADT_STARTED_FILE';

/**
 * One file in a `node --test` of its own, in a process group of its own;
 * with a bound, its process tree is ended when the bound expires first
 * (`watchFile`). `source` names the file in what the runner says.
 */
async function runFile(file, source) {
  // No file inherits a marker: only a bounded run names one, per file.
  const fileEnv = { ...env };
  delete fileEnv[STARTED_VARIABLE];
  let startedFile;
  if (fileTimeout !== undefined) {
    startedFiles += 1;
    startedFile = join(stopDir, `started-${startedFiles}`);
    fileEnv[STARTED_VARIABLE] = startedFile;
  }
  const child = spawn(
    process.execPath,
    [
      // node:test's `mock.module` (helpers/moduleMock.ts): a file may
      // replace a module whose exports map closes its internal files.
      '--experimental-test-module-mocks',
      '--require',
      preload,
      '--require',
      closePreload,
      '--require',
      runningPreload,
      '--test',
      '--test-concurrency=1',
      ...options,
      file,
    ],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: fileEnv,
      detached: true,
      windowsHide: true,
    },
  );
  if (child.pid !== undefined) running.set(child.pid, child);
  const result = await watchFile(
    child,
    fileTimeout === undefined ? undefined : Number(fileTimeout),
    (target) => endTree(target.pid),
  );
  running.delete(child.pid);
  if (result.outcome === 'ended') return result.code;
  if (result.outcome === 'error') {
    console.error(`run-tests: node --test did not start: ${result.error}`);
    return 1;
  }
  if (result.outcome === 'unkillable') {
    pastBound.push({ source, how: 'kill failed' });
    console.error(
      `run-tests: ${source} ran past the bound of ${fileTimeout} s and could not be stopped: ${result.reason}`,
    );
    return 1;
  }
  let last = 'none';
  try {
    last = readFileSync(startedFile, 'utf8');
  } catch {
    // No test started.
  }
  pastBound.push({ source, how: 'stopped' });
  console.error(
    `run-tests: ${source} ran past the bound of ${fileTimeout} s and was stopped; the last test started: ${last}`,
  );
  return 1;
}

/** Every file, at most `concurrency` at once; none started after an interrupt. */
async function runAll() {
  const queue = files.map((file, index) => [file, sourcesRun[index]]);
  let status = 0;
  const lane = async () => {
    while (queue.length > 0 && interrupts === 0) {
      const [file, source] = queue.shift();
      if ((await runFile(file, source)) !== 0) status = 1;
    }
  };
  await Promise.all(Array.from({ length: Number(concurrency) }, () => lane()));
  if (pastBound.length > 0) {
    const count =
      pastBound.length === 1 ? '1 file ran' : `${pastBound.length} files ran`;
    // Flushed before the exit: a pipe's write is asynchronous on macOS and
    // Windows, and an exit right after it can cut the summary.
    await writeFlushed(
      process.stderr,
      `run-tests: ${count} past the bound of ${fileTimeout} s:\n${pastBound
        .map(({ source, how }) => `  ${how}: ${source}`)
        .join('\n')}\n`,
    );
  }
  return interrupts > 0 ? 1 : status;
}

let status = await runAll();
rmSync(stopDir, { recursive: true, force: true });
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
