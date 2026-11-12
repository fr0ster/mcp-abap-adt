/**
 * The partition guard (D27, plan step 4): every `*.test.ts` of Jest's roots
 * belongs to exactly one runner — on the node:test list
 * (`tools/node-test-files.json`) or found by Jest's discovery, never both,
 * never neither — and every listed path names a file.
 *
 * Jest's discovery is read by running Jest's own `--listTests --json` in a
 * child process (never by importing Jest), over the repository's own
 * configuration: since the live suites moved to node:test (D27 step 11) it
 * has no live ignores, and this guard names no directory and no pattern.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { JEST, REPO, runNode } from './toolRuns';

const LIST = path.join(REPO, 'tools', 'node-test-files.json');

/** Strings, or the read of data from outside the type system throws. */
function strings(value: unknown, what: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error(`${what}: not a list of strings`);
  }
  return value;
}

function jest(args: readonly string[]): string {
  const run = runNode(JEST, args);
  if (run.status !== 0) {
    throw new Error(
      `jest ${args.join(' ')} exited ${run.status}: ${run.stderr}`,
    );
  }
  return run.stdout;
}

/** Jest's roots, as its configuration states them. */
function jestRoots(): string[] {
  const shown: unknown = JSON.parse(jest(['--showConfig']));
  if (
    typeof shown !== 'object' ||
    shown === null ||
    !('configs' in shown) ||
    !Array.isArray(shown.configs) ||
    shown.configs.length !== 1
  ) {
    throw new Error('jest --showConfig: not one project configuration');
  }
  const [config]: unknown[] = shown.configs;
  if (typeof config !== 'object' || config === null || !('roots' in config)) {
    throw new Error('jest --showConfig: no roots');
  }
  return strings(config.roots, 'jest --showConfig roots');
}

/** What Jest discovers over the repository's configuration. */
function jestDiscovery(): string[] {
  return strings(
    JSON.parse(jest(['--listTests', '--json'])),
    'jest --listTests --json',
  );
}

/** Every `*.test.ts` under `dir`, as absolute paths. */
function testSources(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

interface Partition {
  both: string[];
  neither: string[];
  missing: string[];
}

/**
 * The guard's verdict over repository-relative paths written with `/`:
 * `sources` every test file, `listed` the node:test list, `jest` Jest's
 * discovery.
 */
function partition(
  sources: readonly string[],
  listed: readonly string[],
  jest: readonly string[],
): Partition {
  const onList = new Set(listed);
  const onJest = new Set(jest);
  const exists = new Set(sources);
  return {
    both: sources.filter((file) => onList.has(file) && onJest.has(file)),
    neither: sources.filter((file) => !onList.has(file) && !onJest.has(file)),
    missing: listed.filter((file) => !exists.has(file)),
  };
}

const fromRepo = (file: string): string =>
  path.relative(REPO, file).split(path.sep).join('/');

describe('the partition guard', () => {
  it('a file belongs to exactly one runner', () => {
    const roots = jestRoots();
    assert.ok(roots.length > 0);
    const sources = roots.flatMap(testSources).map(fromRepo);
    const listed = strings(
      JSON.parse(fs.readFileSync(LIST, 'utf8')),
      'tools/node-test-files.json',
    );
    assert.ok(listed.length > 0, 'the node:test list is empty');
    const found = jestDiscovery().map(fromRepo);
    assert.deepEqual(partition(sources, listed, found), {
      both: [],
      neither: [],
      missing: [],
    });
  });

  it('the guard refuses each of its fixtures', () => {
    const sources = ['a.test.ts', 'b.test.ts', 'c.test.ts'];
    assert.deepEqual(
      partition(sources, ['a.test.ts'], ['b.test.ts', 'c.test.ts']),
      { both: [], neither: [], missing: [] },
      'clean',
    );
    assert.deepEqual(
      partition(
        sources,
        ['a.test.ts'],
        ['a.test.ts', 'b.test.ts', 'c.test.ts'],
      ),
      { both: ['a.test.ts'], neither: [], missing: [] },
      'a file on both',
    );
    assert.deepEqual(
      partition(sources, ['a.test.ts'], ['b.test.ts']),
      { both: [], neither: ['c.test.ts'], missing: [] },
      'a file on neither',
    );
    assert.deepEqual(
      partition(
        sources,
        ['a.test.ts', 'gone.test.ts'],
        ['b.test.ts', 'c.test.ts'],
      ),
      { both: [], neither: [], missing: ['gone.test.ts'] },
      'a listed path naming no file',
    );
  });
});
