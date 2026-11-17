/**
 * What the runner's tests share (D27): the repository's tools run in a child
 * process, and fixture repositories — a temporary directory holding its own
 * node:test list (`tools/node-test-files.json`), its own
 * `tsconfig.node-test.json` (the repository's, by `extends`, built into the
 * fixture's own `.test-build/tree/`) and its sources. Uses no test runner.
 */
import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { repositoryRoot } from '../../helpers/repoRoot';

export const REPO = repositoryRoot(__dirname);
export const JEST = require.resolve('jest/bin/jest');

export interface ToolRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function finished(run: SpawnSyncReturns<string>): ToolRun {
  if (run.error !== undefined) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * `node <script> …args` from `cwd`, the repository root by default (a
 * fixture repository's tool runs pass the fixture). `env` replaces the
 * environment; without it the child gets this process's.
 */
export function runNode(
  script: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = environment(),
  cwd: string = REPO,
): ToolRun {
  return finished(
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      env,
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

/** `node tools/<name> …args` from `cwd`, the repository root by default. */
export function runTool(
  name: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = environment(),
  cwd: string = REPO,
): ToolRun {
  return runNode(path.join(REPO, 'tools', name), args, env, cwd);
}

/**
 * This process's environment without `without`, then with `set`. Never
 * `NODE_TEST_CONTEXT`: node:test sets it in the process of a test file, and a
 * `node --test` started with it reports to that file's runner instead of
 * running its files.
 */
export function environment(
  set: Readonly<Record<string, string>> = {},
  without: readonly string[] = [],
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [...without, 'NODE_TEST_CONTEXT']) delete env[name];
  return { ...env, ...set };
}

/**
 * Where the fixtures live: `.test-fixtures/` at the repository root
 * (gitignored, under none of Jest's roots), not the system's temporary
 * directory. A Jest run over a fixture root in the Windows runner's
 * temporary directory (`C:\Users\RUNNER~1\…`, another drive than the
 * checkout) found no test, while the same run passed on Linux and macOS
 * (CI, measured; which part of that path Jest refused is not established).
 * Under the checkout, the fixtures are on its drive and under its spelling,
 * as every root Jest finds tests in is.
 */
export const FIXTURES = path.join(REPO, '.test-fixtures');

/** A temporary directory under `FIXTURES`, removed by `remove()`. */
export function temporaryDir(prefix: string): {
  dir: string;
  remove(): void;
} {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const dir = fs.mkdtempSync(path.join(FIXTURES, prefix));
  return {
    dir,
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Writes `text` at `relativePath` (written with `/`) under `dir`. */
export function writeAt(
  dir: string,
  relativePath: string,
  text: string,
): string {
  const file = path.join(dir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** The lines of a record file fixtures append to; none when it is absent. */
export function recorded(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
}

/** Every file under `dir`, as paths relative to it written with `/`. */
export function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile()) {
      found.push(
        path
          .relative(dir, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join('/'),
      );
    }
  }
  return found.sort();
}

/** The characters a regular expression gives a meaning to. */
const SPECIAL = '\\^$.*+?()[]{}|';

/** `text` as a pattern matching exactly itself, as `jest.config.js` writes one. */
function literal(text: string): string {
  let pattern = '';
  for (const character of text) {
    pattern += SPECIAL.includes(character) ? `\\${character}` : character;
  }
  return `^${pattern}$`;
}

/**
 * A fixture repository's own Jest configuration: its directory is the root
 * directory and the one root, so no run over it reaches this repository's
 * suite, with or without `--roots`; Jest's files are found as in
 * `jest.config.js` (`testMatch` of `__tests__` `.test.ts` files, ts-jest with this
 * repository's `tsconfig.test.json`), and every file of the fixture's
 * node:test list is ignored by its exact path, as the repository's are.
 */
function fixtureJestConfig(dir: string, listed: readonly string[]): string {
  const root = dir.split(path.sep).join('/');
  const config = {
    rootDir: dir,
    roots: ['<rootDir>'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
      '^.+\\.ts$': [
        require.resolve('ts-jest'),
        { tsconfig: path.join(REPO, 'tsconfig.test.json') },
      ],
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    testPathIgnorePatterns: [
      '/node_modules/',
      ...listed.map((source) => literal(`${root}/${source}`)),
    ],
  };
  return `module.exports = ${JSON.stringify(config, null, 2)};\n`;
}

/**
 * A fixture repository: `sources` (path → text, written with `/`), a
 * node:test list of `listed` and an empty placement list
 * (`tools/node-test-placed.json`). Its `tsconfig.node-test.json` extends the
 * repository's and builds into its own `.test-build/tree/`; it names one stub
 * file, as the repository's names its preload. Its `jest.config.js` is its
 * own (`fixtureJestConfig`); `npm-test.mjs --repo` hands it to Jest.
 */
export function fixtureRepo(
  dir: string,
  listed: readonly string[],
  sources: Readonly<Record<string, string>>,
): string {
  writeAt(dir, 'tools/node-test-files.json', JSON.stringify(listed));
  writeAt(dir, 'tools/node-test-placed.json', '[]\n');
  writeAt(dir, 'jest.config.js', fixtureJestConfig(dir, listed));
  writeAt(dir, 'stub.ts', 'export {};\n');
  writeAt(
    dir,
    'tsconfig.node-test.json',
    JSON.stringify({
      extends: path.join(REPO, 'tsconfig.node-test.json'),
      compilerOptions: { rootDir: '.', outDir: './.test-build/tree' },
      files: ['stub.ts'],
      include: [],
    }),
  );
  for (const [file, text] of Object.entries(sources)) writeAt(dir, file, text);
  return dir;
}

/** A node:test source that appends `word` to `$RECORD` and fails on `$failOn`. */
export function nodeTestSource(word: string, failOn: string): string {
  return [
    "import { appendFileSync } from 'node:fs';",
    "import { test } from 'node:test';",
    `test('${word}', () => {`,
    `  appendFileSync(process.env.RECORD ?? '', '${word}\\n');`,
    `  if (process.env.${failOn} === '1') throw new Error('asked to fail');`,
    '});',
    '',
  ].join('\n');
}

/** A Jest source that appends `word` to `$RECORD` and fails on `$failOn`. */
export function jestSource(word: string, failOn: string): string {
  return [
    "import { appendFileSync } from 'node:fs';",
    `test('${word}', () => {`,
    `  appendFileSync(process.env.RECORD ?? '', '${word}\\n');`,
    `  expect(process.env.${failOn}).not.toBe('1');`,
    '});',
    '',
  ].join('\n');
}
