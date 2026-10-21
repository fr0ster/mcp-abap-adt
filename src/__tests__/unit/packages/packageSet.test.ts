/**
 * The package set: eighteen packages, twelve of them a binary each.
 *
 * Every package of this repository builds (every file its `exports` map —
 * or, without one, its `main` — names in `dist` is there after
 * `npm run build`), each binary package declares exactly its bin and ships
 * the file, and every dependency range is a registry range — a sibling of
 * this repository by its version range, never a `file:`, `link:`,
 * `workspace:`, git or URL specifier. The lockfile installs nothing by
 * link. The four kinds of binary, each on stdio, Streamable HTTP and SSE,
 * are the owner's names.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RELEASE_DIRS } from '../../helpers/installedRelease';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

/** Each package's directory, its name and its bin (none for a library). */
const PACKAGES: ReadonlyArray<readonly [string, string, string | null]> = [
  ['.', '@mcp-abap-adt/lib', null],
  ['background-runs-memory', '@mcp-abap-adt/background-runs-memory', null],
  ['responsible-rules', '@mcp-abap-adt/responsible-rules', null],
  ['compact-readonly-entries', '@mcp-abap-adt/compact-readonly-entries', null],
  ['compact-modify', '@mcp-abap-adt/compact-modify', null],
  ['server-runtime', '@mcp-abap-adt/server-runtime', null],
  ['server', '@mcp-abap-adt/core', 'mcp-abap-adt'],
  ['http', '@mcp-abap-adt/http', 'mcp-abap-adt-http'],
  ['sse', '@mcp-abap-adt/sse', 'mcp-abap-adt-sse'],
  ['compact', '@mcp-abap-adt/compact', 'mcp-abap-adt-compact'],
  ['compact-http', '@mcp-abap-adt/compact-http', 'mcp-abap-adt-compact-http'],
  ['compact-sse', '@mcp-abap-adt/compact-sse', 'mcp-abap-adt-compact-sse'],
  ['core-ro', '@mcp-abap-adt/core-ro', 'mcp-abap-adt-ro'],
  ['http-ro', '@mcp-abap-adt/http-ro', 'mcp-abap-adt-http-ro'],
  ['sse-ro', '@mcp-abap-adt/sse-ro', 'mcp-abap-adt-sse-ro'],
  ['compact-ro', '@mcp-abap-adt/compact-ro', 'mcp-abap-adt-compact-ro'],
  [
    'compact-http-ro',
    '@mcp-abap-adt/compact-http-ro',
    'mcp-abap-adt-compact-http-ro',
  ],
  [
    'compact-sse-ro',
    '@mcp-abap-adt/compact-sse-ro',
    'mcp-abap-adt-compact-sse-ro',
  ],
];

interface Manifest {
  name: string;
  version: string;
  main?: string;
  exports?: Record<string, string | Record<string, string>>;
  bin?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: unknown;
}

const manifestOf = (dir: string): Manifest =>
  JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'));

/**
 * Every file a package's manifest points an importer at: each condition's
 * target of its `exports` map, or its `main` when it has none.
 */
function declaredTargets(manifest: Manifest): string[] {
  if (manifest.exports === undefined) {
    return manifest.main === undefined ? [] : [manifest.main];
  }
  const targets = new Set<string>();
  for (const entry of Object.values(manifest.exports)) {
    const values = typeof entry === 'string' ? [entry] : Object.values(entry);
    for (const target of values) targets.add(target);
  }
  return [...targets];
}

/** A range npm resolves on the registry: `*`, or `^` / `~` / nothing before a version. Plain code. */
function isRegistryRange(range: string): boolean {
  if (range === '*') return true;
  for (const refused of [
    'file:',
    'link:',
    'workspace:',
    'git',
    'http:',
    'https:',
    '/',
    'npm:',
  ]) {
    if (range.includes(refused)) return false;
  }
  const first = range[0];
  const body = first === '^' || first === '~' ? range.slice(1) : range;
  // The version core, before a pre-release (`-alpha.6`) or build (`+x`) tag.
  let end = body.length;
  for (const mark of ['-', '+']) {
    const at = body.indexOf(mark);
    if (at !== -1 && at < end) end = at;
  }
  const parts = body.slice(0, end).split('.');
  if (parts.length !== 3) return false;
  return parts.every((part) => {
    if (part.length === 0) return false;
    for (const c of part) if (c < '0' || c > '9') return false;
    return true;
  });
}

/** `a.b.c` (a pre-release or build tag cut off) as three numbers. Plain code. */
function versionOf(text: string): [number, number, number] {
  let end = text.length;
  for (const mark of ['-', '+']) {
    const at = text.indexOf(mark);
    if (at !== -1 && at < end) end = at;
  }
  const [a, b, c] = text.slice(0, end).split('.').map(Number);
  return [a ?? Number.NaN, b ?? Number.NaN, c ?? Number.NaN];
}

/** `a` compared with `b`: negative, zero or positive. */
function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Whether `range` (`^x.y.z`, `~x.y.z` or `x.y.z`) accepts `version`, as npm
 * reads it for the ranges this repository writes. Plain code.
 */
function accepts(range: string, version: string): boolean {
  const have = versionOf(version);
  const first = range[0];
  const floor = versionOf(
    first === '^' || first === '~' ? range.slice(1) : range,
  );
  if (first !== '^' && first !== '~') return compare(have, floor) === 0;
  if (compare(have, floor) < 0) return false;
  if (first === '~') return have[0] === floor[0] && have[1] === floor[1];
  // `^`: the first non-zero part stays.
  if (floor[0] !== 0) return have[0] === floor[0];
  if (floor[1] !== 0) return have[0] === 0 && have[1] === floor[1];
  return compare(have, floor) === 0;
}

describe('the package set', () => {
  it('the install tests (RELEASE_DIRS), publish-all.sh and this list name the same eighteen packages', () => {
    const script = fs
      .readFileSync(path.join(ROOT, 'scripts', 'publish-all.sh'), 'utf8')
      .split(/\r?\n/);
    const start = script.findIndex((line) => line.trim() === 'PACKAGES=(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = script.findIndex(
      (line, index) => index > start && line.trim() === ')',
    );
    expect(end).toBeGreaterThan(start);
    const published = script
      .slice(start + 1, end)
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter((line) => line !== '')
      .map((dir) => (dir === '.' ? '.' : dir.replace(/^\.\//, '')));
    const listed = PACKAGES.map(([dir]) => dir);
    const sorted = (dirs: readonly string[]) => [...dirs].sort();
    for (const dirs of [published, RELEASE_DIRS, listed]) {
      expect(dirs).toHaveLength(18);
      expect(new Set(dirs).size).toBe(18);
    }
    // The order is publish-all's own concern (dependency order).
    expect(sorted(published)).toEqual(sorted(listed));
    expect(sorted(RELEASE_DIRS)).toEqual(sorted(listed));
  });

  it('is eighteen packages, every manifest kept by .gitignore’s exceptions', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(PACKAGES).toHaveLength(18);
    for (const [dir, name] of PACKAGES) {
      expect(manifestOf(dir).name).toBe(name);
      expect(manifestOf(dir).workspaces).toBeUndefined();
      const exception =
        dir === '.' ? '!/package.json' : `!/${dir}/package.json`;
      expect({ dir, kept: ignore.split('\n').includes(exception) }).toEqual({
        dir,
        kept: true,
      });
    }
  });

  it.each(PACKAGES)('%s: its bin, declared and shipped', (dir, _name, bin) => {
    const manifest = manifestOf(dir);
    if (bin === null) {
      expect(manifest.bin).toBeUndefined();
      return;
    }
    expect(manifest.bin).toEqual({ [bin]: `./bin/${bin}.js` });
    expect(manifest.files).toEqual(expect.arrayContaining(['dist/', 'bin/']));
    const file = path.join(ROOT, dir, 'bin', `${bin}.js`);
    expect(
      fs.readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node\n'),
    ).toBe(true);
  });

  it.each(PACKAGES)('%s: every dependency range is a registry range', (dir) => {
    const manifest = manifestOf(dir);
    const refused: string[] = [];
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (!isRegistryRange(range)) refused.push(`${field} ${dep} ${range}`);
      }
    }
    expect(refused).toEqual([]);
  });

  // A sibling's range must accept the version the sibling's manifest
  // carries: a range ahead of it builds here (the mappers read the sources)
  // and fails the packed install, where npm asks the registry for it.
  it.each(PACKAGES)(
    '%s: every sibling range accepts the sibling’s own version',
    (dir) => {
      const versions = new Map(
        PACKAGES.map(([d, name]) => [name, manifestOf(d).version] as const),
      );
      const manifest = manifestOf(dir);
      const refused: string[] = [];
      for (const field of [
        'dependencies',
        'optionalDependencies',
        'peerDependencies',
      ] as const) {
        for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
          const version = versions.get(dep);
          if (version !== undefined && !accepts(range, version)) {
            refused.push(`${dep} ${range} refuses ${version}`);
          }
        }
      }
      expect(refused).toEqual([]);
    },
  );

  it('the range reading is npm’s for the ranges written here', () => {
    const cases: Array<[string, string, boolean]> = [
      ['^18.1.0', '18.1.0', true],
      ['^18.1.0', '18.4.2', true],
      ['^18.1.0', '18.0.9', false],
      ['^18.1.0', '19.0.0', false],
      ['^18.1.0', '17.1.0', false],
      ['^17.1.0', '18.1.0', false],
      ['~1.2.3', '1.2.9', true],
      ['~1.2.3', '1.3.0', false],
      ['^0.4.1', '0.4.9', true],
      ['^0.4.1', '0.5.0', false],
      ['18.1.0', '18.1.0', true],
      ['18.1.0', '18.1.1', false],
    ];
    for (const [range, version, ok] of cases) {
      expect({ range, version, ok: accepts(range, version) }).toEqual({
        range,
        version,
        ok,
      });
    }
  });

  it('the range check refuses a local link in any form', () => {
    for (const range of [
      'file:../server',
      'link:../http',
      'workspace:*',
      'workspace:^18.1.0',
      'git+https://github.com/x/y.git',
      'https://example.invalid/x.tgz',
      '../server',
      'npm:@x/y@1.0.0',
    ]) {
      expect({ range, ok: isRegistryRange(range) }).toEqual({
        range,
        ok: false,
      });
    }
    for (const range of ['^18.1.0', '~1.2.3', '1.0.0-alpha.6', '*']) {
      expect({ range, ok: isRegistryRange(range) }).toEqual({
        range,
        ok: true,
      });
    }
  });

  // Spec §2a: one `dependencies` entry for lib per install tree — the
  // binary package's. Everything below the binaries takes lib (and the
  // runtime its two state packages) as a peer, so npm resolves it to the
  // binary's one copy in every layout.
  const BINARIES = PACKAGES.filter(([, , bin]) => bin !== null);
  const BINARY_NAMES = BINARIES.map(([, name]) => name);
  const STATE = [
    '@mcp-abap-adt/background-runs-memory',
    '@mcp-abap-adt/responsible-rules',
  ];
  const BELOW: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['server-runtime', ['@mcp-abap-adt/lib', ...STATE]],
    ['compact-readonly-entries', ['@mcp-abap-adt/lib']],
    ['compact-modify', ['@mcp-abap-adt/lib']],
    ['background-runs-memory', ['@mcp-abap-adt/lib']],
    ['responsible-rules', ['@mcp-abap-adt/lib']],
  ];

  it('twelve binary packages, none depending on another', () => {
    expect(BINARIES).toHaveLength(12);
    for (const [dir, name] of BINARIES) {
      const manifest = manifestOf(dir);
      const edges = (
        ['dependencies', 'optionalDependencies', 'peerDependencies'] as const
      ).flatMap((field) =>
        Object.keys(manifest[field] ?? {})
          .filter((dep) => dep !== name && BINARY_NAMES.includes(dep))
          .map((dep) => `${field} ${dep}`),
      );
      expect({ dir, edges }).toEqual({ dir, edges: [] });
    }
  });

  it.each(BINARIES)(
    '%s: lists the runtime, lib and the two state packages in dependencies',
    (dir) => {
      const dependencies = manifestOf(dir).dependencies ?? {};
      const missing = [
        '@mcp-abap-adt/server-runtime',
        '@mcp-abap-adt/lib',
        ...STATE,
      ].filter((dep) => dependencies[dep] === undefined);
      expect(missing).toEqual([]);
    },
  );

  it.each(BELOW)(
    '%s: takes %j as peerDependencies (and devDependencies), not dependencies',
    (dir, peers) => {
      const manifest = manifestOf(dir);
      for (const name of peers) {
        expect({
          dir,
          name,
          peer: manifest.peerDependencies?.[name],
          dev: manifest.devDependencies?.[name],
          dependency: manifest.dependencies?.[name],
        }).toEqual({
          dir,
          name,
          // The ranges themselves are releaseMetadata's: each against the release.
          peer: expect.any(String),
          dev: expect.any(String),
          dependency: undefined,
        });
      }
    },
  );

  it('server-runtime has no bin', () => {
    expect(manifestOf('server-runtime').bin).toBeUndefined();
  });

  it('the lockfile installs nothing by link', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'),
    ) as { packages: Record<string, { link?: boolean; resolved?: string }> };
    const links = Object.entries(lock.packages)
      .filter(([, entry]) => entry.link === true)
      .map(([at]) => at);
    expect(links).toEqual([]);
  });

  // Built by `npm run build`, as the dependency rule's dist graph is: under
  // CI an unbuilt package is refused; locally it is skipped, saying so. What
  // is checked is what an importer reaches: every target of the package's
  // `exports` map (or its `main` without one) — a package with subpath
  // exports only (server-runtime) has no `dist/index.js` to look for.
  const unbuilt = PACKAGES.flatMap(([dir]) =>
    declaredTargets(manifestOf(dir))
      .filter((target) => !fs.existsSync(path.join(ROOT, dir, target)))
      .map((target) => `${dir}: ${target}`),
  );
  const onCi = (process.env.CI ?? '') !== '' && process.env.CI !== 'false';
  if (unbuilt.length > 0 && !onCi) {
    console.log(
      `[packageSet] build check skipped: not built: ${unbuilt.join(', ')} — run npm run build first`,
    );
  }

  it('every package declares what it exports', () => {
    for (const [dir] of PACKAGES) {
      expect({
        dir,
        targets: declaredTargets(manifestOf(dir)).length > 0,
      }).toEqual({ dir, targets: true });
    }
  });

  it('every package builds: each exported file is there after npm run build', () => {
    if (unbuilt.length > 0 && !onCi) return;
    expect(unbuilt).toEqual([]);
  });
});
