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
// - Jest's options are read as Jest reads them, from its own option table
//   (`jest-cli`'s `yargsOptions`): a value an option takes is the option's,
//   never a positional argument — an array option (`--reporters`,
//   `--testPathIgnorePatterns`, …) takes every argument after it up to the
//   next option, as in Jest. An option not in the table is refused (Jest
//   refuses it too), and so is a group of short options it cannot read.
// - A positional `….test.ts` on the node:test list goes to the runner; every
//   other positional (a file or a pattern) goes to Jest — by path
//   (`--runTestsByPath`) when every one is an existing file, else all as
//   patterns, as Jest has always read them. A runner given no named
//   `….test.ts` while others were named is skipped, and so is Jest when no
//   positional is left for it. With `--roots`, a named file outside every
//   root runs on neither (Jest applies its `--roots`, by path too; the
//   runner's selection is intersected with the roots, and an empty one skips
//   the runner).
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
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWN_REPO } from './node-test-list.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);
const JEST = requireHere.resolve('jest/bin/jest');
// Jest's option table, as data: the options its command line parses (yargs),
// each with its `type` and `alias`. `jest-cli` is Jest's own dependency,
// resolved from the installed `jest`; `yargsOptions` is its declared export.
const { yargsOptions } = createRequire(
  requireHere.resolve('jest/package.json'),
)('jest-cli');

/**
 * What a Jest option takes: `boolean` (nothing, or a following `true` /
 * `false`), `array` (every following argument up to the next option) or
 * `value` (one following argument), by name and alias. `help`, `h` and
 * `version` are yargs' own.
 */
const JEST_OPTIONS = new Map([
  ['help', 'boolean'],
  ['h', 'boolean'],
  ['version', 'boolean'],
]);
for (const [name, option] of Object.entries(yargsOptions)) {
  const kind =
    option.type === 'boolean'
      ? 'boolean'
      : option.type === 'array'
        ? 'array'
        : 'value';
  JEST_OPTIONS.set(name, kind);
  for (const alias of [option.alias ?? []].flat())
    JEST_OPTIONS.set(alias, kind);
}

/** `test-name-pattern` as `testNamePattern`: yargs reads both spellings. */
function camelCase(name) {
  const [head, ...rest] = name.split('-');
  return (
    head +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  );
}

function optionKind(name) {
  return JEST_OPTIONS.get(name) ?? JEST_OPTIONS.get(camelCase(name));
}

/** `-5`, `-0.5`: yargs reads a negative number as a value, not an option. */
function isNegativeNumber(arg) {
  const digits = arg.slice(1);
  let dots = 0;
  for (const character of digits) {
    if (character === '.') dots += 1;
    else if (character < '0' || character > '9') return false;
  }
  return digits.length > 0 && dots <= 1 && digits !== '.';
}

function isOption(arg) {
  return arg.startsWith('-') && arg !== '-' && !isNegativeNumber(arg);
}

function refuse(words) {
  console.error(`npm-test: ${words}`);
  process.exit(1);
}

/**
 * The kind of the option `arg` names, and whether `arg` carries its value
 * (`--name=value`, `-n=value`). A short group (`-it`) is read only when every
 * option but the last is boolean; the last decides what follows.
 */
function readOption(arg) {
  const long = arg.startsWith('--');
  const body = arg.slice(long ? 2 : 1);
  const equals = body.indexOf('=');
  const name = equals < 0 ? body : body.slice(0, equals);
  const inline = equals >= 0;
  if (long || name.length === 1 || inline) {
    const kind =
      optionKind(name) ??
      (long &&
      !inline &&
      name.startsWith('no-') &&
      optionKind(name.slice(3)) === 'boolean'
        ? 'boolean'
        : undefined);
    if (kind === undefined) refuse(`${arg} is not a Jest option`);
    return { kind, inline };
  }
  const letters = [...name];
  for (const [index, letter] of letters.entries()) {
    const kind = optionKind(letter);
    if (kind === undefined) refuse(`${arg}: -${letter} is not a Jest option`);
    if (index === letters.length - 1) return { kind, inline: false };
    if (kind !== 'boolean') {
      refuse(`${arg}: -${letter} takes a value; write it as its own option`);
    }
  }
}

const roots = [];
const positionals = [];
const jestOptions = [];
const runnerArgs = [];
let repo;
let listOnly = false;

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
    positionals.push(...args.slice(i + 1));
    break;
  } else if (!isOption(arg)) {
    positionals.push(arg);
  } else {
    // A Jest option and the values it takes, kept together and in order.
    const { kind, inline } = readOption(arg);
    jestOptions.push(arg);
    const next = () => args[i + 1];
    if (kind === 'boolean') {
      if (!inline && (next() === 'true' || next() === 'false')) {
        jestOptions.push(next());
        i += 1;
      }
    } else if (kind === 'array') {
      while (next() !== undefined && !isOption(next())) {
        jestOptions.push(next());
        i += 1;
      }
    } else if (!inline && next() !== undefined && !isOption(next())) {
      jestOptions.push(next());
      i += 1;
    }
  }
}
const named = positionals.filter((arg) => arg.endsWith('.test.ts'));
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
// Each root as `--roots=<dir>`, the options next, the positionals last after
// `--`: Jest's array options (`--roots` among them) take every value after
// them, so a positional after one would be one of its values.
function jestCommand(extra) {
  return [
    '--passWithNoTests',
    ...(byPath ? ['--runTestsByPath'] : []),
    ...roots.map((root) => `--roots=${root}`),
    ...jestOptions,
    ...extra,
    ...(jestPositionals.length > 0 ? ['--', ...jestPositionals] : []),
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
