// The node:test list (D27), read the same way by the build
// (`build-node-tests.mjs`) and the runner (`run-tests.mjs`).
//
// `tools/node-test-files.json` is the one list of the test files that run on
// node:test: repository source paths (`src/__tests__/….test.ts`, written with
// `/`). Each one's compiled file is the same path under `.test-build/tree/`, `.js`
// for `.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository these tools belong to. */
export const OWN_REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/** The list file and the build directory of a repository. */
export function listFile(repo) {
  return join(repo, 'tools', 'node-test-files.json');
}
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

/** A source path of the list, as a path of the platform under `repo`. */
export function sourceFile(repo, source) {
  return join(repo, ...source.split('/'));
}

/** The compiled file of a source path of the list. */
export function compiledFile(repo, source) {
  const parts = source.split('/');
  const last = parts.pop();
  return join(buildDir(repo), ...parts, `${last.slice(0, -'.ts'.length)}.js`);
}

/**
 * The list's source paths. The file is data: a list of `….test.ts` paths
 * written with `/`, relative to the repository, or the read throws.
 */
export function readList(repo) {
  const file = listFile(repo);
  const listed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(listed)) {
    throw new Error(`${file}: not a list`);
  }
  for (const source of listed) {
    if (
      typeof source !== 'string' ||
      !source.endsWith('.test.ts') ||
      source.includes('\\') ||
      source.startsWith('/') ||
      source.includes(':') ||
      source.split('/').some((part) => part === '' || part === '..')
    ) {
      throw new Error(`${file}: not a repository test source path: ${source}`);
    }
  }
  return listed;
}

/**
 * The runs of their own (spec §4): `tools/separate-runs.json`, each npm
 * script's name with the files of the list it alone runs — the suites that
 * reach a service outside the repository (`test:install`: the npm
 * registry and installs; `test:retrieval`: Ollama). The runner leaves them
 * out of every selection that does not name them, so the unit run never
 * reaches one; the guard (`unit/runner/separateRuns.test.ts`) holds both
 * runners' unit sets to it. A repository without the file has none.
 */
export function readSeparateRuns(repo) {
  const file = join(repo, 'tools', 'separate-runs.json');
  if (!existsSync(file)) return {};
  const runs = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof runs !== 'object' || runs === null || Array.isArray(runs)) {
    throw new Error(`${file}: not an object of npm scripts`);
  }
  const listed = new Set(readList(repo));
  for (const [script, sources] of Object.entries(runs)) {
    if (!Array.isArray(sources)) {
      throw new Error(`${file}: ${script} names no list of files`);
    }
    for (const source of sources) {
      if (typeof source !== 'string' || !listed.has(source)) {
        throw new Error(
          `${file}: ${script} names a file the node:test list does not hold: ${source}`,
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
