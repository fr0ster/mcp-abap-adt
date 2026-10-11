/**
 * The dependency rule (D38, spec §3.2, §14.1), separating the development
 * install from the published runtime graph.
 *
 * The repository is not an npm workspace: CI installs with the root `npm ci`,
 * so core's, http's and sse's imports resolve from the root `node_modules` in
 * development, and the root manifest holds the broker and the stores as
 * devDependencies. That install says nothing about what a user gets. What
 * this reads instead is each package's published manifest and the import
 * graph of its `src` and of its built `dist`, walked from each `exports`
 * entry and each bin — type-only imports included, since a published `.d.ts`
 * carries them — following a sibling package of this repository through its
 * own `exports`:
 *
 * - lib, http and sse declare and reach no auth-broker, auth-stores or
 *   interfaces-auth-broker; core declares them and reaches them;
 * - http reaches no sse and sse no http; neither reaches core;
 * - every package a file of a package imports is declared in that package's
 *   own published dependencies, so a packed install resolves it — and, for
 *   core, http and sse, present in the root manifest, so the root install
 *   that development and CI use resolves it too;
 * - no source of core, http or sse (tests included) reaches into another
 *   transport's directory by a relative path.
 *
 * The packages come from one table, which A7 extends with compact-http and
 * compact-sse.
 */

import * as fs from 'node:fs';
import { builtinModules } from 'node:module';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

const CHAIN_STATE = [
  '@mcp-abap-adt/auth-broker',
  '@mcp-abap-adt/auth-stores',
  '@mcp-abap-adt/interfaces-auth-broker',
];

interface Row {
  name: string;
  /** Relative to the repository root. */
  dir: string;
  /** Neither declared in its published fields nor reached by its graph. */
  forbidden: string[];
  /** Declared in its published `dependencies` and reached by its graph. */
  required?: string[];
}

/** The packages the rule covers; A7 adds compact-http and compact-sse. */
const PACKAGES: Row[] = [
  {
    name: '@mcp-abap-adt/lib',
    dir: '.',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/core'],
  },
  {
    name: '@mcp-abap-adt/http',
    dir: 'http',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/sse', '@mcp-abap-adt/core'],
  },
  {
    name: '@mcp-abap-adt/sse',
    dir: 'sse',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/http', '@mcp-abap-adt/core'],
  },
  {
    name: '@mcp-abap-adt/core',
    dir: 'server',
    forbidden: ['@mcp-abap-adt/http', '@mcp-abap-adt/sse'],
    required: ['@mcp-abap-adt/auth-broker', '@mcp-abap-adt/auth-stores'],
  },
];

/** Every package of this repository, by name: how a sibling import is followed. */
const SIBLING_DIRS = [
  '.',
  'server',
  'http',
  'sse',
  'compact',
  'compact-readonly',
  'compact-modify',
];

interface Manifest {
  name: string;
  exports?: Record<string, { types?: string; require?: string }>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const manifestOf = (dir: string): Manifest =>
  JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'));

const SIBLINGS = new Map(
  SIBLING_DIRS.filter((dir) =>
    fs.existsSync(path.join(ROOT, dir, 'package.json')),
  ).map((dir) => [manifestOf(dir).name, dir] as const),
);

const PUBLISHED_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const published = (manifest: Manifest): Record<string, string> =>
  Object.assign({}, ...PUBLISHED_FIELDS.map((field) => manifest[field] ?? {}));

const BUILTINS = new Set(builtinModules);
const isBuiltin = (name: string) =>
  name.startsWith('node:') || BUILTINS.has(name);

/** `@scope/name` or `name` of a bare specifier. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

type Mode = 'src' | 'dist';

/** The package directory a file belongs to: the longest sibling directory containing it. */
function ownerOf(file: string): string {
  let owner = '.';
  for (const dir of SIBLING_DIRS) {
    if (dir === '.') continue;
    if (file.startsWith(path.join(ROOT, dir) + path.sep)) owner = dir;
  }
  return owner;
}

/** In `src` mode, a path into a package's `dist/` is read from its `src/`. */
function inMode(file: string, mode: Mode): string {
  if (mode === 'dist') return file;
  const owner = path.join(ROOT, ownerOf(file));
  const dist = path.join(owner, 'dist') + path.sep;
  if (!file.startsWith(dist)) return file;
  const rel = file.slice(dist.length);
  const stem = rel.endsWith('.d.ts')
    ? rel.slice(0, -'.d.ts'.length)
    : rel.endsWith('.js')
      ? rel.slice(0, -'.js'.length)
      : rel;
  return path.join(owner, 'src', `${stem}.ts`);
}

/**
 * The files a relative specifier names, trying what TypeScript and node
 * would: in `dist`, both the `.js` node loads and the `.d.ts` a consumer's
 * compiler reads; in `src`, the `.ts`.
 */
function filesFor(candidate: string, mode: Mode): string[] {
  const stem = candidate.endsWith('.js')
    ? candidate.slice(0, -'.js'.length)
    : candidate;
  const isFile = (option: string) =>
    fs.existsSync(option) && fs.statSync(option).isFile();
  if (isFile(candidate)) return [candidate];
  const options =
    mode === 'dist'
      ? [
          [`${stem}.js`, `${stem}.d.ts`],
          [
            path.join(candidate, 'index.js'),
            path.join(candidate, 'index.d.ts'),
          ],
        ]
      : [[`${stem}.ts`], [path.join(candidate, 'index.ts')]];
  for (const group of options) {
    const found = group.filter(isFile);
    if (found.length) return found;
  }
  return [];
}

/** The entry files of a sibling's `exports` key, in `mode`. */
function entriesOf(dir: string, key: string, mode: Mode): string[] {
  const entry = manifestOf(dir).exports?.[key];
  if (!entry) return [];
  const targets =
    mode === 'dist'
      ? [entry.require, entry.types]
      : [entry.require ?? entry.types];
  return targets
    .filter((t): t is string => typeof t === 'string')
    .map((t) => inMode(path.join(ROOT, dir, t), mode));
}

interface Graph {
  files: Set<string>;
  /** Every package name the graph imports, siblings included. */
  reached: Set<string>;
  /** Package name → the files of the package's own directory importing it. */
  ownImports: Map<string, Set<string>>;
}

function walk(row: Row, mode: Mode): Graph {
  const manifest = manifestOf(row.dir);
  const graph: Graph = {
    files: new Set(),
    reached: new Set(),
    ownImports: new Map(),
  };
  const queue: string[] = [];
  for (const key of Object.keys(manifest.exports ?? {})) {
    queue.push(...entriesOf(row.dir, key, mode));
  }
  for (const bin of Object.values(manifest.bin ?? {})) {
    queue.push(path.join(ROOT, row.dir, bin));
  }
  while (queue.length) {
    const file = queue.pop() as string;
    if (graph.files.has(file)) continue;
    if (!fs.existsSync(file)) {
      throw new Error(`the graph of ${row.name} names a missing file: ${file}`);
    }
    graph.files.add(file);
    const own = ownerOf(file) === row.dir;
    const { importedFiles } = ts.preProcessFile(
      fs.readFileSync(file, 'utf8'),
      true,
      true,
    );
    for (const { fileName: specifier } of importedFiles) {
      if (specifier.startsWith('.')) {
        const targets = filesFor(
          inMode(path.resolve(path.dirname(file), specifier), mode),
          mode,
        );
        if (targets.length === 0) {
          throw new Error(`${file}: cannot resolve ${specifier}`);
        }
        queue.push(...targets);
        continue;
      }
      if (isBuiltin(specifier)) continue;
      const name = packageName(specifier);
      graph.reached.add(name);
      if (own) {
        const importers = graph.ownImports.get(name) ?? new Set<string>();
        importers.add(path.relative(ROOT, file));
        graph.ownImports.set(name, importers);
      }
      const sibling = SIBLINGS.get(name);
      if (sibling !== undefined) {
        const sub = specifier.slice(name.length);
        queue.push(...entriesOf(sibling, sub ? `.${sub}` : '.', mode));
      }
    }
  }
  return graph;
}

const built = PACKAGES.every((row) =>
  fs.existsSync(path.join(ROOT, row.dir, 'dist', 'index.js')),
);
const MODES: Mode[] = built ? ['src', 'dist'] : ['src'];

describe.each(PACKAGES)('$name: published manifest', (row) => {
  const manifest = manifestOf(row.dir);

  it('its published dependency fields name nothing forbidden', () => {
    const declared = Object.keys(published(manifest));
    expect(declared.filter((name) => row.forbidden.includes(name))).toEqual([]);
  });

  if (row.required) {
    it('its published dependencies declare what it must reach', () => {
      for (const name of row.required ?? []) {
        expect(manifest.dependencies?.[name]).toBeDefined();
      }
    });
  }
});

describe.each(
  MODES.flatMap((mode) => PACKAGES.map((row) => ({ ...row, mode }))),
)('$name: the import graph of $mode', (row) => {
  const graph = walk(row, row.mode);
  const manifest = manifestOf(row.dir);

  it('walks its entries', () => {
    expect(graph.files.size).toBeGreaterThan(0);
  });

  it('reaches nothing forbidden', () => {
    expect([...graph.reached].filter((n) => row.forbidden.includes(n))).toEqual(
      [],
    );
  });

  if (row.required) {
    it('reaches what it must', () => {
      for (const name of row.required ?? []) {
        expect(graph.reached).toContain(name);
      }
    });
  }

  it('declares in its published dependencies every package its own files import', () => {
    const declared = published(manifest);
    const missing = [...graph.ownImports.entries()]
      .filter(([name]) => name !== row.name && declared[name] === undefined)
      .map(([name, files]) => `${name} (${[...files][0]})`);
    expect(missing).toEqual([]);
  });

  if (row.dir !== '.') {
    it('finds each of them in the root manifest, the install development and CI use', () => {
      const root = manifestOf('.');
      const own = manifest.dependencies ?? {};
      const absent: string[] = [];
      for (const name of graph.ownImports.keys()) {
        if (SIBLINGS.has(name)) continue;
        const inRoot =
          root.dependencies?.[name] ??
          root.optionalDependencies?.[name] ??
          root.devDependencies?.[name];
        if (inRoot === undefined) absent.push(name);
        else if (
          root.dependencies?.[name] === undefined &&
          root.devDependencies?.[name] !== own[name]
        ) {
          absent.push(`${name} at ${own[name]} (root: ${inRoot})`);
        }
      }
      expect(absent).toEqual([]);
    });
  }
});

describe('the root manifest: development install, not lib’s runtime', () => {
  const root = manifestOf('.');
  const core = manifestOf('server');

  it('holds the broker and the stores only as devDependencies, at exactly core’s ranges', () => {
    for (const name of CHAIN_STATE) {
      expect(published(root)[name]).toBeUndefined();
      expect(root.devDependencies?.[name]).toBe(core.dependencies?.[name]);
    }
  });
});

describe('no transport reaches another by a relative path, tests included', () => {
  const sources = (dir: string): string[] =>
    fs
      .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((rel) => rel.endsWith('.ts'))
      .map((rel) => path.join(ROOT, dir, rel));

  it.each([
    ['server/src', ['http', 'sse']],
    ['http/src', ['server', 'sse']],
    ['sse/src', ['server', 'http']],
  ])('%s', (dir, others) => {
    const crossings: string[] = [];
    for (const file of sources(dir)) {
      const { importedFiles } = ts.preProcessFile(
        fs.readFileSync(file, 'utf8'),
        true,
        true,
      );
      for (const { fileName } of importedFiles) {
        if (!fileName.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), fileName);
        for (const other of others) {
          if (target.startsWith(path.join(ROOT, other) + path.sep)) {
            crossings.push(`${path.relative(ROOT, file)} → ${fileName}`);
          }
        }
      }
    }
    expect(crossings).toEqual([]);
  });
});
