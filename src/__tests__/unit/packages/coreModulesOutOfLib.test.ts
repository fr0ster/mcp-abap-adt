/**
 * The destination's env file and the stores' platform paths are core's
 *: `envFileContext`, `envResolver` and `platformPaths` live
 * in `server-runtime/src/stdio/config/`. Nothing of them comes back to lib — no module at
 * its old path, and no name in any entry of lib's `exports`, in `src` and, when
 * built, in `dist`.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { repositoryRoot } from '../../helpers/repoRoot';

const ROOT = repositoryRoot(__dirname);
// Where the running code lives: the repository under Jest, .test-build/tree
// under node:test. A source module is required from there, by its path
// without the extension (Jest resolves the .ts, node the compiled .js).
const CODE_ROOT = path.resolve(__dirname, '../../../..');
const runningModule = (source: string): string =>
  path.join(CODE_ROOT, path.relative(ROOT, source)).replace(/\.ts$/, '');

const GONE_FROM_LIB = [
  'src/lib/config/envFileContext.ts',
  'src/lib/config/envResolver.ts',
  'src/lib/stores/platformPaths.ts',
];

const CORE_NAMES = [
  'getPlatformPaths',
  'resolveEnvFilePath',
  'readEnvFileContext',
  'ENV_FILE_CONTEXT_KEYS',
];

interface ExportEntry {
  readonly require?: string;
}

/** Each `exports` entry of lib's manifest: its built module and its source. */
function libEntries(): { entry: string; dist: string; src: string }[] {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ) as { exports: Record<string, ExportEntry> };
  return Object.entries(manifest.exports).flatMap(([entry, target]) => {
    const built = target.require;
    if (built === undefined) return [];
    const dist = path.join(ROOT, built);
    // ./dist/<x>.js is built from ./src/<x>.ts
    const relative = path.relative(path.join(ROOT, 'dist'), dist);
    const src = path.join(
      ROOT,
      'src',
      `${relative.slice(0, relative.length - '.js'.length)}.ts`,
    );
    return [{ entry, dist, src }];
  });
}

describe("core's config modules stay out of lib", () => {
  for (const file of GONE_FROM_LIB) {
    it(format('%s does not exist', file), () => {
      assert.equal(fs.existsSync(path.join(ROOT, file)), false);
    });
  }

  const entries = libEntries();

  it('lib has exports entries to check', () => {
    assert.ok(entries.length > 5);
    for (const { src } of entries) assert.equal(fs.existsSync(src), true);
  });

  for (const [_entry, { src }] of entries.map((e) => [e.entry, e] as const)) {
    it(format('%s (src) exports none of core names', _entry), () => {
      const exported = Object.keys(require(runningModule(src)) as object);
      assert.deepStrictEqual(
        exported.filter((name) => CORE_NAMES.includes(name)),
        [],
      );
    });
  }

  for (const [_entry, { dist }] of entries.map((e) => [e.entry, e] as const)) {
    it(
      format('%s (dist, when built) exports none of core names', _entry),
      () => {
        if (!fs.existsSync(dist)) return;
        const exported = Object.keys(require(dist) as object);
        assert.deepStrictEqual(
          exported.filter((name) => CORE_NAMES.includes(name)),
          [],
        );
      },
    );
  }
});
