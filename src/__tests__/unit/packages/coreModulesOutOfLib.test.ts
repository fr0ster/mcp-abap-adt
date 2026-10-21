/**
 * The destination's env file and the stores' platform paths are core's
 *: `envFileContext`, `envResolver` and `platformPaths` live
 * in `server/src/config/`. Nothing of them comes back to lib — no module at
 * its old path, and no name in any entry of lib's `exports`, in `src` and, when
 * built, in `dist`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

const GONE_FROM_LIB = [
  'src/lib/config/envFileContext.ts',
  'src/lib/config/envResolver.ts',
  'src/lib/stores/platformPaths.ts',
];

const CORE_NAMES = [
  'getPlatformPaths',
  'resolveEnvFilePath',
  'hydrateSystemContextFromEnvFile',
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
  it.each(GONE_FROM_LIB)('%s does not exist', (file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(false);
  });

  const entries = libEntries();

  it('lib has exports entries to check', () => {
    expect(entries.length).toBeGreaterThan(5);
    for (const { src } of entries) expect(fs.existsSync(src)).toBe(true);
  });

  it.each(entries.map((e) => [e.entry, e] as const))(
    '%s (src) exports none of core names',
    (_entry, { src }) => {
      const exported = Object.keys(require(src) as object);
      expect(exported.filter((name) => CORE_NAMES.includes(name))).toEqual([]);
    },
  );

  it.each(entries.map((e) => [e.entry, e] as const))(
    '%s (dist, when built) exports none of core names',
    (_entry, { dist }) => {
      if (!fs.existsSync(dist)) return;
      const exported = Object.keys(require(dist) as object);
      expect(exported.filter((name) => CORE_NAMES.includes(name))).toEqual([]);
    },
  );
});
