/**
 * The dependency rule, separating the development
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
 * - lib, the http packages (http, compact-http, http-ro, compact-http-ro),
 *   sse and compact-sse declare and reach no auth-broker, auth-stores or
 *   interfaces-auth-broker; server-runtime declares them and reaches them;
 *   core, compact, core-ro and compact-ro reach them only through
 *   server-runtime, declaring none;
 * - server-runtime reaches no binary package and neither half; it takes lib,
 *   background-runs-memory and responsible-rules as peers;
 * - http reaches no sse and sse no http; neither reaches core;
 * - compact-sse reaches no core (nor compact), and reaches exactly its own
 *   transport package;
 * - the stdio packages (core, compact, core-ro, compact-ro) and the http
 *   packages reach server-runtime's path of their transport, no other
 *   transport's path of it and no file of another transport's directory of
 *   it, and no other binary package;
 * - the six read-only packages reach lib, their own transport's
 *   package (or runtime path) and — a compact one — the half that changes
 *   nothing, and never the modifying half or another transport;
 * - every package a file of a package imports is declared in that package's
 *   own published dependencies, so a packed install resolves it — and, for
 *   core, http and sse, present in the root manifest, so the root install
 *   that development and CI use resolves it too;
 * - no source of a transport (tests included) reaches into another
 *   transport's directory by a relative path — server-runtime's stdio and
 *   http directories counted as stdio's and http's.
 *
 * The packages come from one table.
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
  /** Not declared in its published fields — reached only through a sibling. */
  undeclared?: string[];
  /** Declared in its published `dependencies` and reached by its graph. */
  required?: string[];
  /** Declared in its `peerDependencies` (and `devDependencies`) and reached by its graph. */
  peers?: string[];
  /** Reached by its graph (through a sibling), whether declared or not. */
  reaches?: string[];
  /** The runtime path of its transport (`@mcp-abap-adt/server-runtime/stdio`): reached; no other transport's. */
  runtimePath?: string;
}

const RUNTIME = '@mcp-abap-adt/server-runtime';
/** server-runtime's import paths, per transport; `/auth` is the destination layer, stdio's. */
const RUNTIME_PATHS: Record<string, readonly string[]> = {
  stdio: [`${RUNTIME}/stdio`, `${RUNTIME}/stdio/server`, `${RUNTIME}/auth`],
  http: [`${RUNTIME}/http`, `${RUNTIME}/http/server`],
  sse: [`${RUNTIME}/sse`, `${RUNTIME}/sse/server`],
};
/** The runtime's directory of each transport, under its `src` and its `dist`. */
const RUNTIME_DIRS: Record<string, string> = {
  stdio: 'stdio',
  http: 'http',
  sse: 'sse',
};
/** The files of server-runtime in another transport's directory than `runtimePath`'s. */
const inOtherRuntimeDir = (runtimePath: string, file: string): boolean =>
  Object.entries(RUNTIME_PATHS)
    .filter(([, paths]) => !paths.includes(runtimePath))
    .some(([transport]) =>
      ['src', 'dist'].some((tree) =>
        file.startsWith(
          path.join(ROOT, 'server-runtime', tree, RUNTIME_DIRS[transport]) +
            path.sep,
        ),
      ),
    );
/** The runtime paths of every transport but the one `runtimePath` names. */
const otherRuntimePaths = (runtimePath: string): string[] =>
  Object.values(RUNTIME_PATHS)
    .filter((paths) => !paths.includes(runtimePath))
    .flat();

const TRANSPORTS = [
  '@mcp-abap-adt/core',
  '@mcp-abap-adt/http',
  '@mcp-abap-adt/sse',
  '@mcp-abap-adt/compact',
  '@mcp-abap-adt/compact-http',
  '@mcp-abap-adt/compact-sse',
  '@mcp-abap-adt/core-ro',
  '@mcp-abap-adt/http-ro',
  '@mcp-abap-adt/sse-ro',
  '@mcp-abap-adt/compact-ro',
  '@mcp-abap-adt/compact-http-ro',
  '@mcp-abap-adt/compact-sse-ro',
];
const HALVES = [
  '@mcp-abap-adt/compact-readonly-entries',
  '@mcp-abap-adt/compact-modify',
];

/**
 * A compact package: lib, the two halves and `transport`, and no other
 * transport. A stdio one's transport is server-runtime, through its
 * `runtimePath`.
 */
const compactOver = (
  name: string,
  dir: string,
  transport: string,
  chainState: 'forbidden' | 'through the runtime',
  runtimePath?: string,
): Row => ({
  name,
  dir,
  forbidden: [
    ...(chainState === 'forbidden' ? CHAIN_STATE : []),
    ...TRANSPORTS.filter((t) => t !== transport && t !== name),
  ],
  ...(chainState === 'through the runtime' && { undeclared: CHAIN_STATE }),
  required: ['@mcp-abap-adt/lib', transport, ...HALVES],
  ...(runtimePath !== undefined && { runtimePath }),
});

/**
 * A read-only package: lib and `transport` only — and, for a compact
 * one, the half that changes nothing, never the modifying half — and no
 * other transport.
 */
const readOnlyOver = (
  name: string,
  dir: string,
  transport: string,
  chainState: 'forbidden' | 'through the runtime',
  compact: boolean,
  runtimePath?: string,
): Row => ({
  name,
  dir,
  forbidden: [
    ...(chainState === 'forbidden' ? CHAIN_STATE : []),
    ...TRANSPORTS.filter((t) => t !== transport && t !== name),
    '@mcp-abap-adt/compact-modify',
    ...(compact ? [] : ['@mcp-abap-adt/compact-readonly-entries']),
  ],
  ...(chainState === 'through the runtime' && { undeclared: CHAIN_STATE }),
  required: [
    '@mcp-abap-adt/lib',
    transport,
    ...(compact ? ['@mcp-abap-adt/compact-readonly-entries'] : []),
  ],
  ...(runtimePath !== undefined && { runtimePath }),
});

/** The packages the rule covers. */
const PACKAGES: Row[] = [
  {
    name: '@mcp-abap-adt/lib',
    dir: '.',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/core', RUNTIME],
  },
  // The in-memory background-run store: lib's contract, nothing else of ours.
  {
    name: '@mcp-abap-adt/background-runs-memory',
    dir: 'background-runs-memory',
    forbidden: [...CHAIN_STATE, ...TRANSPORTS, ...HALVES, RUNTIME],
    required: ['@mcp-abap-adt/lib'],
  },
  // The responsible rules: lib's hook, nothing else of ours.
  {
    name: '@mcp-abap-adt/responsible-rules',
    dir: 'responsible-rules',
    forbidden: [...CHAIN_STATE, ...TRANSPORTS, ...HALVES, RUNTIME],
    required: ['@mcp-abap-adt/lib'],
  },
  // http: the runtime's http paths, and no broker or store through them.
  {
    name: '@mcp-abap-adt/http',
    dir: 'http',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/sse', '@mcp-abap-adt/core'],
    required: [RUNTIME, '@mcp-abap-adt/lib'],
    runtimePath: `${RUNTIME}/http`,
  },
  {
    name: '@mcp-abap-adt/sse',
    dir: 'sse',
    forbidden: [...CHAIN_STATE, '@mcp-abap-adt/http', '@mcp-abap-adt/core'],
  },
  // The servers' launch code: the broker and the stores, lib and its two
  // state packages as peers (the binary package owns them), no binary package.
  {
    name: RUNTIME,
    dir: 'server-runtime',
    forbidden: [...TRANSPORTS, ...HALVES],
    required: ['@mcp-abap-adt/auth-broker', '@mcp-abap-adt/auth-stores'],
    peers: [
      '@mcp-abap-adt/lib',
      '@mcp-abap-adt/background-runs-memory',
      '@mcp-abap-adt/responsible-rules',
    ],
  },
  // core: the runtime's stdio paths, and the broker and the stores through them.
  {
    name: '@mcp-abap-adt/core',
    dir: 'server',
    forbidden: ['@mcp-abap-adt/http', '@mcp-abap-adt/sse'],
    undeclared: CHAIN_STATE,
    required: [RUNTIME, '@mcp-abap-adt/lib'],
    reaches: ['@mcp-abap-adt/auth-broker', '@mcp-abap-adt/auth-stores'],
    runtimePath: `${RUNTIME}/stdio`,
  },
  // stdio: the broker and the stores only through the runtime.
  compactOver(
    '@mcp-abap-adt/compact',
    'compact',
    RUNTIME,
    'through the runtime',
    `${RUNTIME}/stdio`,
  ),
  // http: no broker or store, through the runtime or otherwise.
  compactOver(
    '@mcp-abap-adt/compact-http',
    'compact-http',
    RUNTIME,
    'forbidden',
    `${RUNTIME}/http`,
  ),
  compactOver(
    '@mcp-abap-adt/compact-sse',
    'compact-sse',
    '@mcp-abap-adt/sse',
    'forbidden',
  ),
  // The six read-only packages: each over its transport's launcher.
  readOnlyOver(
    '@mcp-abap-adt/core-ro',
    'core-ro',
    RUNTIME,
    'through the runtime',
    false,
    `${RUNTIME}/stdio`,
  ),
  readOnlyOver(
    '@mcp-abap-adt/http-ro',
    'http-ro',
    RUNTIME,
    'forbidden',
    false,
    `${RUNTIME}/http`,
  ),
  readOnlyOver(
    '@mcp-abap-adt/sse-ro',
    'sse-ro',
    '@mcp-abap-adt/sse',
    'forbidden',
    false,
  ),
  readOnlyOver(
    '@mcp-abap-adt/compact-ro',
    'compact-ro',
    RUNTIME,
    'through the runtime',
    true,
    `${RUNTIME}/stdio`,
  ),
  readOnlyOver(
    '@mcp-abap-adt/compact-http-ro',
    'compact-http-ro',
    RUNTIME,
    'forbidden',
    true,
    `${RUNTIME}/http`,
  ),
  readOnlyOver(
    '@mcp-abap-adt/compact-sse-ro',
    'compact-sse-ro',
    '@mcp-abap-adt/sse',
    'forbidden',
    true,
  ),
];

/** Every package of this repository, by name: how a sibling import is followed. */
const SIBLING_DIRS = [
  '.',
  'background-runs-memory',
  'responsible-rules',
  'server-runtime',
  'server',
  'http',
  'sse',
  'compact',
  'compact-http',
  'compact-sse',
  'compact-readonly-entries',
  'compact-modify',
  'core-ro',
  'http-ro',
  'sse-ro',
  'compact-ro',
  'compact-http-ro',
  'compact-sse-ro',
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
  /** Every specifier of a sibling package the graph imports (`@mcp-abap-adt/server-runtime/stdio`). */
  reachedPaths: Set<string>;
  /** Package name → the files of the package's own directory importing it. */
  ownImports: Map<string, Set<string>>;
}

function walk(row: Row, mode: Mode): Graph {
  const manifest = manifestOf(row.dir);
  const graph: Graph = {
    files: new Set(),
    reached: new Set(),
    reachedPaths: new Set(),
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
        graph.reachedPaths.add(specifier);
        const sub = specifier.slice(name.length);
        queue.push(...entriesOf(sibling, sub ? `.${sub}` : '.', mode));
      }
    }
  }
  return graph;
}

/**
 * Which graphs are walked. Every package built: `src` and `dist`. A package
 * not built: under CI the `dist` check is refused, never dropped (a reordered
 * workflow must turn red); locally it is skipped with the reason printed.
 */
function distDecision(
  unbuilt: readonly string[],
  ci: boolean,
): { modes: Mode[]; refusal?: string; skip?: string } {
  if (unbuilt.length === 0) return { modes: ['src', 'dist'] };
  const words = `not built: ${unbuilt.join(', ')} — run npm run build first`;
  return ci
    ? { modes: ['src'], refusal: `the dist graph cannot be checked: ${words}` }
    : { modes: ['src'], skip: `[dependencyRule] dist graph skipped: ${words}` };
}

// Built: every `exports` target there in `dist` — a package with subpath
// exports only (server-runtime) has no `dist/index.js`.
const unbuilt = PACKAGES.filter((row) => {
  const keys = Object.keys(manifestOf(row.dir).exports ?? {});
  const targets = keys.flatMap((key) => entriesOf(row.dir, key, 'dist'));
  return targets.length === 0 || !targets.every((t) => fs.existsSync(t));
}).map((row) => row.name);
const ON_CI = (process.env.CI ?? '') !== '' && process.env.CI !== 'false';
const decision = distDecision(unbuilt, ON_CI);
if (decision.skip !== undefined) console.log(decision.skip);
const MODES: Mode[] = decision.modes;

describe('the dist graph is checked when it can be', () => {
  it('under CI, every package is built (an unbuilt one is refused, not skipped)', () => {
    if (decision.refusal !== undefined) throw new Error(decision.refusal);
  });

  it('every package built: src and dist', () => {
    expect(distDecision([], true)).toEqual({ modes: ['src', 'dist'] });
    expect(distDecision([], false)).toEqual({ modes: ['src', 'dist'] });
  });

  it('a package not built under CI: refused, naming it', () => {
    expect(distDecision(['@mcp-abap-adt/http'], true)).toEqual({
      modes: ['src'],
      refusal:
        'the dist graph cannot be checked: not built: @mcp-abap-adt/http — run npm run build first',
    });
  });

  it('a package not built locally: skipped, with the reason printed', () => {
    expect(distDecision(['@mcp-abap-adt/http'], false)).toEqual({
      modes: ['src'],
      skip: '[dependencyRule] dist graph skipped: not built: @mcp-abap-adt/http — run npm run build first',
    });
  });
});

describe.each(PACKAGES)('$name: published manifest', (row) => {
  const manifest = manifestOf(row.dir);

  it('its published dependency fields name nothing forbidden', () => {
    const declared = Object.keys(published(manifest));
    const refused = [...row.forbidden, ...(row.undeclared ?? [])];
    expect(declared.filter((name) => refused.includes(name))).toEqual([]);
  });

  if (row.required) {
    it('its published dependencies declare what it must reach', () => {
      for (const name of row.required ?? []) {
        expect(manifest.dependencies?.[name]).toBeDefined();
      }
    });
  }

  if (row.peers) {
    it('takes its peers as peerDependencies (and devDependencies), not dependencies', () => {
      for (const name of row.peers ?? []) {
        expect({
          name,
          peer: manifest.peerDependencies?.[name] !== undefined,
          dev: manifest.devDependencies?.[name] !== undefined,
          dependency: manifest.dependencies?.[name] !== undefined,
        }).toEqual({ name, peer: true, dev: true, dependency: false });
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

  if (row.required || row.peers || row.reaches) {
    it('reaches what it must', () => {
      for (const name of [
        ...(row.required ?? []),
        ...(row.peers ?? []),
        ...(row.reaches ?? []),
      ]) {
        expect(graph.reached).toContain(name);
      }
    });
  }

  if (row.runtimePath !== undefined) {
    const runtimePath = row.runtimePath;
    it(`reaches ${runtimePath}, and no other transport's runtime path or directory`, () => {
      expect(graph.reachedPaths).toContain(runtimePath);
      expect(
        [...graph.reachedPaths].filter((p) =>
          otherRuntimePaths(runtimePath).includes(p),
        ),
      ).toEqual([]);
      expect(
        [...graph.files]
          .filter((file) => inOtherRuntimeDir(runtimePath, file))
          .map((file) => path.relative(ROOT, file)),
      ).toEqual([]);
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
  const runtime = manifestOf('server-runtime');

  it('holds the broker and the stores only as devDependencies, at exactly server-runtime’s ranges', () => {
    for (const name of CHAIN_STATE) {
      expect(published(root)[name]).toBeUndefined();
      expect(root.devDependencies?.[name]).toBe(runtime.dependencies?.[name]);
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
    ['server/src', ['http', 'server-runtime/src/http', 'sse']],
    ['server-runtime/src/stdio', ['http', 'server-runtime/src/http', 'sse']],
    ['http/src', ['server', 'server-runtime/src/stdio', 'sse']],
    ['server-runtime/src/http', ['server', 'server-runtime/src/stdio', 'sse']],
    [
      'sse/src',
      ['server', 'server-runtime/src/stdio', 'http', 'server-runtime/src/http'],
    ],
    [
      'compact/src',
      ['http', 'server-runtime/src/http', 'sse', 'compact-http', 'compact-sse'],
    ],
    [
      'compact-http/src',
      ['server', 'server-runtime/src/stdio', 'sse', 'compact', 'compact-sse'],
    ],
    [
      'compact-sse/src',
      [
        'server',
        'server-runtime/src/stdio',
        'http',
        'server-runtime/src/http',
        'compact',
        'compact-http',
      ],
    ],
    [
      'core-ro/src',
      [
        'http',
        'server-runtime/src/http',
        'sse',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
    [
      'http-ro/src',
      [
        'server',
        'server-runtime/src/stdio',
        'sse',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
    [
      'sse-ro/src',
      [
        'server',
        'server-runtime/src/stdio',
        'http',
        'server-runtime/src/http',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
    [
      'compact-ro/src',
      [
        'http',
        'server-runtime/src/http',
        'sse',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
    [
      'compact-http-ro/src',
      [
        'server',
        'server-runtime/src/stdio',
        'sse',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
    [
      'compact-sse-ro/src',
      [
        'server',
        'server-runtime/src/stdio',
        'http',
        'server-runtime/src/http',
        'compact',
        'compact-http',
        'compact-sse',
      ],
    ],
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
