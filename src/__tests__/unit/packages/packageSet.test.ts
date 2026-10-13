/**
 * The package set (C23): sixteen packages, twelve of them a binary each.
 *
 * Every package of this repository builds (its `dist` entry is there after
 * `npm run build`), each binary package declares exactly its bin and ships
 * the file, and every dependency range is a registry range — a sibling of
 * this repository by its version range, never a `file:`, `link:`,
 * `workspace:`, git or URL specifier. The lockfile installs nothing by
 * link. The four kinds of binary, each on stdio, Streamable HTTP and SSE,
 * are the owner's names.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

/** Each package's directory, its name and its bin (none for a library). */
const PACKAGES: ReadonlyArray<readonly [string, string, string | null]> = [
  ['.', '@mcp-abap-adt/lib', null],
  ['background-runs-memory', '@mcp-abap-adt/background-runs-memory', null],
  ['compact-readonly-entries', '@mcp-abap-adt/compact-readonly-entries', null],
  ['compact-modify', '@mcp-abap-adt/compact-modify', null],
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
  it('is sixteen packages, every manifest kept by .gitignore’s exceptions', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(PACKAGES).toHaveLength(16);
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
  // CI an unbuilt package is refused; locally it is skipped, saying so.
  const unbuilt = PACKAGES.filter(
    ([dir]) => !fs.existsSync(path.join(ROOT, dir, 'dist', 'index.js')),
  ).map(([dir]) => dir);
  const onCi = (process.env.CI ?? '') !== '' && process.env.CI !== 'false';
  if (unbuilt.length > 0 && !onCi) {
    console.log(
      `[packageSet] build check skipped: not built: ${unbuilt.join(', ')} — run npm run build first`,
    );
  }

  it('every package builds: its dist entry is there after npm run build', () => {
    if (unbuilt.length > 0 && !onCi) return;
    expect(unbuilt).toEqual([]);
  });
});
