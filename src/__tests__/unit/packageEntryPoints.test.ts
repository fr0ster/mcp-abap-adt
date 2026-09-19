import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * `exports` and `typesVersions` must describe the same package.
 *
 * They are two maps of the same thing for two audiences, and only one of them
 * is exercised by the code in this repository. `exports` is what Node reads at
 * runtime; `typesVersions` is what TypeScript reads when a consumer is on the
 * classic `moduleResolution: "node"`, which a great deal of CAP and Node
 * tooling still is.
 *
 * 10.0.0 shipped with them out of step. The split renamed `./server` to
 * `./embeddable` and added four subpaths, `exports` was updated and
 * `typesVersions` was not — so it still pointed `server` at a `dist/server`
 * that no longer existed and named none of the new entries. The package
 * installed, ran, and type-resolved for `handlers` and `utils` only. The
 * consumer that found it had to add a `paths` override to see the types of the
 * entry point the whole release was about.
 *
 * Nothing in this repository would have caught that, because everything here
 * imports by relative path. Hence this.
 */

const root = path.join(__dirname, '..', '..', '..');

interface Manifest {
  name: string;
  exports?: Record<string, { types: string; import: string; require: string }>;
  typesVersions?: Record<string, Record<string, string[]>>;
  main?: string;
  types?: string;
  bin?: Record<string, string>;
}

function manifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
}

const packages: Array<[label: string, dir: string]> = [
  ['@mcp-abap-adt/lib', root],
  ['@mcp-abap-adt/core', path.join(root, 'server')],
];

describe.each(packages)('%s entry points', (_label, dir) => {
  const pkg = manifest(dir);
  const subpaths = Object.keys(pkg.exports ?? {}).filter((s) => s !== '.');

  it('declares exports at all', () => {
    expect(
      subpaths.length + Object.keys(pkg.exports ?? {}).length,
    ).toBeGreaterThan(0);
  });

  it('names every exported subpath in typesVersions', () => {
    const declared = Object.keys(pkg.typesVersions?.['*'] ?? {}).sort();
    const expected = subpaths.map((s) => s.replace(/^\.\//, '')).sort();
    expect(declared).toEqual(expected);
  });

  it('points typesVersions at the same file exports does', () => {
    for (const sub of subpaths) {
      const viaExports = pkg.exports?.[sub]?.types.replace(/^\.\//, '');
      const viaTypes = pkg.typesVersions?.['*'][sub.replace(/^\.\//, '')]?.[0];
      expect(viaTypes).toBe(viaExports);
    }
  });
});

/**
 * Separate from the map comparison above: a map may agree with itself and
 * still name a file the build does not produce, which is exactly what the stale
 * `dist/server` entry was.
 */
describe('every declared entry point exists on disk after a build', () => {
  const built = fs.existsSync(path.join(root, 'dist', 'index.js'));
  const t = built ? it : it.skip;

  t.each(packages)('%s', (_label, dir) => {
    const pkg = manifest(dir);
    const targets = [
      ...Object.values(pkg.exports ?? {}).flatMap((m) => [
        m.types,
        m.import,
        m.require,
      ]),
      ...Object.values(pkg.typesVersions?.['*'] ?? {}).flat(),
      pkg.main,
      pkg.types,
      ...Object.values(pkg.bin ?? {}),
    ].filter((p): p is string => typeof p === 'string');

    const missing = targets.filter(
      (rel) => !fs.existsSync(path.join(dir, rel)),
    );
    expect(missing).toEqual([]);
  });
});
