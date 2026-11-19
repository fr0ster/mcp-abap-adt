// The test selection (D27), read the same way by the build
// (`build-node-tests.mjs`) and the runner (`run-tests.mjs`).
//
// Every `….test.ts` under a `__tests__` directory of the repository's test
// roots (`TEST_ROOTS`) is a test file, found by a directory walk in plain
// string code — no glob, no pattern — that skips `node_modules`, `dist`,
// `.test-build` and `__fixtures__` wherever they occur. A source path is
// written with `/`, relative to the repository; its compiled file is the
// same path under `.test-build/tree/`, `.js` for `.ts`. The guard
// (`src/__tests__/unit/runner/selection.test.ts`) holds the walk to the files
// git tracks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository these tools belong to. */
export const OWN_REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The directories whose `__tests__` hold the tests: the library's `src` and
 * each package's, written with `/`. A repository holding only some of them
 * (a fixture repository of the runner's tests) is walked in those it holds.
 */
export const TEST_ROOTS = [
  'src',
  'background-runs-memory/src',
  'responsible-rules/src',
  'server-runtime/src',
  'server/src',
  'http/src',
  'sse/src',
  'compact-readonly-entries/src',
  'compact-modify/src',
  'compact/src',
  'compact-http/src',
  'compact-sse/src',
  'core-ro/src',
  'http-ro/src',
  'sse-ro/src',
  'compact-ro/src',
  'compact-http-ro/src',
  'compact-sse-ro/src',
];

/** The directories the walk never enters, by name. */
export const SKIPPED_DIRECTORIES = [
  'node_modules',
  'dist',
  '.test-build',
  '__fixtures__',
];

/** The directory every test file lies under, by name. */
const TESTS_DIRECTORY = '__tests__';

// The build root, `.test-build/`, removed whole before each build; the
// compiled tree is one level inside it (`.test-build/tree/`), so the root
// holds no package-shaped directory — `.test-build/` itself has no
// `package.json`, even when the build places the root manifest.
export function buildRoot(repo) {
  return join(repo, '.test-build');
}
export function buildDir(repo) {
  return join(buildRoot(repo), 'tree');
}

/** A source path, as a path of the platform under `repo`. */
export function sourceFile(repo, source) {
  return join(repo, ...source.split('/'));
}

/** The compiled file of a source path. */
export function compiledFile(repo, source) {
  const parts = source.split('/');
  const last = parts.pop();
  return join(buildDir(repo), ...parts, `${last.slice(0, -'.ts'.length)}.js`);
}

/**
 * Every test file of `repo`: each `….test.ts` under a `__tests__` directory
 * of a test root, as source paths written with `/`, sorted. Each directory's
 * entries are read in name order, so the walk answers alike on every
 * platform.
 */
export function walkSources(repo) {
  const found = [];
  const walk = (dir, at, inTests) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const path = `${at}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.includes(entry.name)) continue;
        walk(
          join(dir, entry.name),
          path,
          inTests || entry.name === TESTS_DIRECTORY,
        );
      } else if (entry.isFile() && inTests && entry.name.endsWith('.test.ts')) {
        found.push(path);
      }
    }
  };
  for (const root of TEST_ROOTS) {
    const dir = sourceFile(repo, root);
    if (existsSync(dir)) walk(dir, root, false);
  }
  return found.sort();
}

/**
 * The runs of their own (spec §4): `tools/separate-runs.json`, each npm
 * script's name with the test files it alone runs — the suites that
 * reach a service outside the repository (`test:install`: the npm
 * registry and installs; `test:retrieval`: Ollama). The runner leaves them
 * out of every selection that does not name them, so the unit run never
 * reaches one; the guard (`unit/runner/separateRuns.test.ts`) holds the
 * unit selection to it. A repository without the file has none.
 */
export function readSeparateRuns(repo) {
  const file = join(repo, 'tools', 'separate-runs.json');
  if (!existsSync(file)) return {};
  const runs = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof runs !== 'object' || runs === null || Array.isArray(runs)) {
    throw new Error(`${file}: not an object of npm scripts`);
  }
  const tests = new Set(walkSources(repo));
  for (const [script, sources] of Object.entries(runs)) {
    if (!Array.isArray(sources)) {
      throw new Error(`${file}: ${script} names no list of files`);
    }
    for (const source of sources) {
      if (typeof source !== 'string' || !tests.has(source)) {
        throw new Error(
          `${file}: ${script} names no test file of the repository: ${source}`,
        );
      }
    }
  }
  return runs;
}

/** Every file of a run of its own (`readSeparateRuns`). */
export function separateSources(repo) {
  return new Set(Object.values(readSeparateRuns(repo)).flat());
}

/**
 * The placement list (spec §2, "Files production code reads beside itself"):
 * `tools/node-test-placed.json`, the repository paths (files or directories,
 * written with `/`) that production code reads by its own location. The
 * build places each at the same path under `.test-build/tree/`, beside the
 * compiled code that reads it; the guard (`unit/runner/placedFiles.test.ts`)
 * holds the list to the reads.
 */
export function placedFile(repo) {
  return join(repo, 'tools', 'node-test-placed.json');
}

/** The placement list's paths, each one of the repository, or the read throws. */
export function readPlaced(repo) {
  const file = placedFile(repo);
  const listed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(listed)) {
    throw new Error(`${file}: not a list`);
  }
  for (const entry of listed) {
    if (
      typeof entry !== 'string' ||
      entry.includes('\\') ||
      entry.startsWith('/') ||
      entry.includes(':') ||
      entry
        .split('/')
        .some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new Error(`${file}: not a repository path: ${entry}`);
    }
    if (!existsSync(join(repo, ...entry.split('/')))) {
      throw new Error(`${file}: ${entry}: no such repository path`);
    }
  }
  return listed;
}
