/**
 * Jest's configuration — until the last Jest suite moves to node:test (D27).
 *
 * Moved as it was from `package.json` `jest`, with two settings now read
 * instead of copied:
 *
 * - `moduleNameMapper` is built from the package-name table,
 *   `tsconfig.paths.json` (`compilerOptions.paths`: each name and its source
 *   entry, `./…` from the root), each name anchored, plus Jest's own rule for
 *   a relative `./x.js` import, which lives only here;
 * - `testPathIgnorePatterns` is the two directories of the live suites plus
 *   every path of the node:test list, `tools/node-test-files.json` (the
 *   repository source paths of the files that run on node:test), each an
 *   exact path, so no file runs on both runners.
 *
 * `rootDir` is stated, since `jestConfig` may be called from a configuration
 * elsewhere (`unit/runner/listAndTable.test.ts` builds one with a temporary
 * list): it is this file's directory, as Jest took it for `package.json`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const NAME_TABLE = path.join(ROOT, 'tsconfig.paths.json');
const NODE_TEST_LIST = path.join(ROOT, 'tools', 'node-test-files.json');

/** The characters a regular expression gives a meaning to. */
const SPECIAL = '\\^$.*+?()[]{}|';

/** `text` as a pattern matching exactly itself (character by character). */
function literal(text) {
  let pattern = '';
  for (const character of text) {
    pattern += SPECIAL.includes(character) ? `\\${character}` : character;
  }
  return `^${pattern}$`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Each name of the table, anchored, to its source under `<rootDir>`. */
function nameMapper() {
  const table = readJson(NAME_TABLE).compilerOptions.paths;
  const mapper = {};
  for (const [name, targets] of Object.entries(table)) {
    if (
      !Array.isArray(targets) ||
      targets.length !== 1 ||
      typeof targets[0] !== 'string' ||
      !targets[0].startsWith('./')
    ) {
      throw new Error(`${NAME_TABLE}: ${name} does not name one ./ target`);
    }
    mapper[literal(name)] = `<rootDir>/${targets[0].slice('./'.length)}`;
  }
  mapper['^(\\.{1,2}/.*)\\.js$'] = '$1';
  return mapper;
}

/**
 * Every listed path as an exact pattern over the absolute path, written with
 * `/` (Jest turns `/` into the platform's separator in these patterns).
 */
function listedIgnores(listFile) {
  const listed = readJson(listFile);
  if (!Array.isArray(listed)) {
    throw new Error(`${listFile}: not a list`);
  }
  const root = ROOT.split(path.sep).join('/');
  return listed.map((source) => {
    if (typeof source !== 'string' || !source.endsWith('.test.ts')) {
      throw new Error(`${listFile}: not a test source path: ${source}`);
    }
    return literal(`${root}/${source}`);
  });
}

/** The configuration, its node:test files read from `listFile`. */
function jestConfig(listFile) {
  return {
    rootDir: ROOT,
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: [
      '<rootDir>/src',
      '<rootDir>/background-runs-memory/src',
      '<rootDir>/responsible-rules/src',
      '<rootDir>/server-runtime/src',
      '<rootDir>/server/src',
      '<rootDir>/http/src',
      '<rootDir>/sse/src',
      '<rootDir>/compact-readonly-entries/src',
      '<rootDir>/compact-modify/src',
      '<rootDir>/compact/src',
      '<rootDir>/compact-http/src',
      '<rootDir>/compact-sse/src',
      '<rootDir>/core-ro/src',
      '<rootDir>/http-ro/src',
      '<rootDir>/sse-ro/src',
      '<rootDir>/compact-ro/src',
      '<rootDir>/compact-http-ro/src',
      '<rootDir>/compact-sse-ro/src',
    ],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
      '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: nameMapper(),
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/**/__tests__/**',
      '!src/**/index.ts',
    ],
    testPathIgnorePatterns: [
      '__tests__/admin/',
      '__tests__/integration/',
      ...listedIgnores(listFile),
    ],
    maxWorkers: 1,
    testTimeout: 600000,
    globalSetup: '<rootDir>/src/__tests__/integration/globalSetup.ts',
    globalTeardown: '<rootDir>/src/__tests__/integration/globalTeardown.ts',
    setupFilesAfterEnv: [
      '<rootDir>/src/__tests__/integration/helpers/closeConnectionsAfterAll.ts',
    ],
  };
}

module.exports = jestConfig(NODE_TEST_LIST);
// Not enumerable: Jest validates the keys of what this file exports, and a
// reader that spreads the configuration (`unit/coverage/live.test.ts`,
// `runReport.test.ts`) copies the settings alone.
Object.defineProperty(module.exports, 'jestConfig', { value: jestConfig });
