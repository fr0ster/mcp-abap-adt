/**
 * One `@mcp-abap-adt/lib` per server process, in every way a user installs.
 *
 * **Why.** 19.1.0 installed with `npm install -g @mcp-abap-adt/compact
 * @mcp-abap-adt/core` — the wrapper in one command with the base it depended
 * on — gave the wrapper two copies of `lib`: one under `compact/` for its
 * handler packages, one under `core/` for the server that runs them. Every
 * process-wide state of `lib` (the request context, the system context, the
 * caches) then existed twice, and a handler read the copy nobody had set
 * (#303). Measured on the published 19.1.0 before this test existed: the
 * request context the server entered was invisible to all three handler
 * packages. 19.2.0 makes the binary package the one `dependencies` owner of
 * `lib`, everything below it a peer, and this test proves the result in each
 * layout of the spec:
 *
 *   1. global, each wrapper in one command with its former base (all nine);
 *   2. global, wrapper and base in two commands, either order (one wrapper per
 *      transport, the three in one prefix per order);
 *   3. local, the default (hoisted) install of all twelve binaries;
 *   4. local, `--install-strategy=nested`, plain and compact of each transport;
 *   5. a version skew the ranges allow: the binaries at the release version, the
 *      runtime at a later patch — still one copy;
 *
 * and, for an embedder, `compact-readonly-entries` installed with `lib` and
 * alone (npm installs the missing peer): one copy, its peer.
 *
 * **What a case asserts.** A child `node` started on the installed tree
 * requires the binary's transport launcher of the runtime, the binary's own
 * launcher and every package its tool set loads, each resolved as that
 * package resolves it; then `libInstances()` holds one entry, every one of
 * them resolved the same `lib` file, and a request context entered through the
 * runtime's `lib` is the one each handler package's `lib` reads. Each binary
 * answers `--version` with its own package's version. `npm ls --all` passes
 * (no missing or invalid peer), every package of the release in the tree has
 * the version packed here, and a local install's lockfile resolves each of
 * them to its tarball.
 *
 * **No registry fetch of the release's own packages.** The installs name the
 * binaries alone, as a user does, so their dependencies come from a registry:
 * `tarballRegistry.ts` serves the tarballs packed here for the release's names
 * and passes only the other `@mcp-abap-adt/*` packages (the auth chain, the
 * connection) to the public one. The test asserts it was never asked for a
 * package of the release it does not serve.
 *
 * **Cost.** One `npm pack` of the eighteen packages, then about twenty
 * installs, four at a time (third-party packages from npm's cache when it has
 * them). `SKIP_INSTALL_MATRIX=true` skips it, and says so.
 */
import { execFile } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { packRelease, RELEASE_DIRS, ROOT } from '../helpers/installedRelease';
import { spawnOptionsForNpm } from '../helpers/platform';
import {
  startTarballRegistry,
  type TarballRegistry,
} from '../helpers/tarballRegistry';

const execFileAsync = promisify(execFile);

const SKIPPED = process.env.SKIP_INSTALL_MATRIX === 'true';

type Transport = 'stdio' | 'http' | 'sse';

interface Binary {
  /** The npm name without the scope. */
  readonly pkg: string;
  /** Its directory in this repository. */
  readonly dir: string;
  readonly bin: string;
  readonly transport: Transport;
  /** The packages of the release its tool set loads, besides `lib`. */
  readonly tools: readonly string[];
}

const binary = (
  pkg: string,
  bin: string,
  transport: Transport,
  tools: readonly string[] = [],
  dir = pkg,
): Binary => ({
  pkg,
  dir,
  bin,
  transport,
  tools: [...tools, 'background-runs-memory', 'responsible-rules'],
});

const BOTH_HALVES = ['compact-readonly-entries', 'compact-modify'];
const READ_HALF = ['compact-readonly-entries'];

const BINARIES = {
  core: binary('core', 'mcp-abap-adt', 'stdio', [], 'server'),
  http: binary('http', 'mcp-abap-adt-http', 'http'),
  sse: binary('sse', 'mcp-abap-adt-sse', 'sse'),
  compact: binary('compact', 'mcp-abap-adt-compact', 'stdio', BOTH_HALVES),
  'compact-http': binary(
    'compact-http',
    'mcp-abap-adt-compact-http',
    'http',
    BOTH_HALVES,
  ),
  'compact-sse': binary(
    'compact-sse',
    'mcp-abap-adt-compact-sse',
    'sse',
    BOTH_HALVES,
  ),
  'core-ro': binary('core-ro', 'mcp-abap-adt-ro', 'stdio'),
  'http-ro': binary('http-ro', 'mcp-abap-adt-http-ro', 'http'),
  'sse-ro': binary('sse-ro', 'mcp-abap-adt-sse-ro', 'sse'),
  'compact-ro': binary(
    'compact-ro',
    'mcp-abap-adt-compact-ro',
    'stdio',
    READ_HALF,
  ),
  'compact-http-ro': binary(
    'compact-http-ro',
    'mcp-abap-adt-compact-http-ro',
    'http',
    READ_HALF,
  ),
  'compact-sse-ro': binary(
    'compact-sse-ro',
    'mcp-abap-adt-compact-sse-ro',
    'sse',
    READ_HALF,
  ),
} as const;

type BinaryName = keyof typeof BINARIES;

/** Each wrapper and the package it was a wrapper of up to 19.1.0. */
const FORMER_BASE: Record<string, BinaryName> = {
  compact: 'core',
  'compact-ro': 'core',
  'core-ro': 'core',
  'compact-http': 'http',
  'compact-http-ro': 'http',
  'http-ro': 'http',
  'compact-sse': 'sse',
  'compact-sse-ro': 'sse',
  'sse-ro': 'sse',
};

const sourceVersion = (dir: string): string =>
  (
    JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

const RELEASE_VERSION = sourceVersion('.');

/** The later patch of the runtime that layout 5 installs. */
const laterPatch = (version: string): string => {
  const [major, minor, patch] = version.split('.');
  return `${major}.${minor}.${Number(patch) + 1}`;
};

/**
 * The child that loads an installed tree. Arguments: the directory to resolve
 * from, then the specifiers to load (a package path or an absolute file),
 * each required as that directory resolves it. Then it finds every copy of the
 * server runtime the process loaded (in `require.cache`: the runtime the
 * launcher really took, not one resolved beside it) and, from each, enters a
 * request context through that runtime's `lib`; with no runtime loaded (an
 * embedder), through the first specifier's. Prints one JSON line: the copies
 * `lib` registered, the distinct `lib` files resolved (from every specifier
 * and every runtime), whether each specifier's `lib` read each entered
 * context, the runtimes loaded and the package (`name@version`) each
 * specifier resolved into.
 *
 * Everything is resolved in the child: inside Jest, `createRequire` answers
 * through the `moduleNameMapper`, which maps the release's names to this
 * checkout's sources. `MATRIX_RUNTIME` names the runtime's directory mark
 * (the 19.1.0 measurement used `/@mcp-abap-adt/core/`).
 */
const CHECKER = `'use strict';
const { createRequire } = require('node:module');
const { readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');
const [from, ...specifiers] = process.argv.slice(2);
const mark = process.env.MATRIX_RUNTIME || '/@mcp-abap-adt/server-runtime/';
const fromRequire = createRequire(path.join(from, 'resolve-from.js'));
const manifestOf = (dir) => {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return manifest.name ? manifest.name + '@' + manifest.version : null;
  } catch {
    return null;
  }
};
const packageOf = (file) => {
  for (let dir = path.dirname(file); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const found = manifestOf(dir);
    if (found) return found;
  }
  return null;
};
const libFrom = (file) => {
  const contextFile = createRequire(file).resolve('@mcp-abap-adt/lib/request-context');
  return { lib: realpathSync(contextFile), context: require(contextFile) };
};
const loaded = specifiers.map((specifier) => {
  const file = fromRequire.resolve(specifier);
  require(file);
  return { specifier, pkg: packageOf(file), ...libFrom(file) };
});
const runtimeRoots = new Set();
for (const file of Object.keys(require.cache)) {
  const posix = file.split(path.sep).join('/');
  const at = posix.lastIndexOf(mark);
  if (at >= 0) runtimeRoots.add(file.slice(0, at + mark.length - 1));
}
const entering = runtimeRoots.size > 0
  ? [...runtimeRoots].map((root) => ({ name: manifestOf(root), ...libFrom(path.join(root, 'package.json')) }))
  : [{ name: loaded[0].specifier, lib: loaded[0].lib, context: loaded[0].context }];
const config = fromRequire('@mcp-abap-adt/lib/config');
const instances = typeof config.libInstances === 'function'
  ? config.libInstances().map((entry) => entry.file)
  : null;
const seen = {};
entering.forEach((enter, index) => {
  const marker = { masterLanguage: 'install-matrix-' + index };
  enter.context.runWithRequestContext(marker, () => {
    for (const l of loaded) seen[enter.name + ' -> ' + l.specifier] = l.context.getRequestContext() === marker;
  });
});
console.log(JSON.stringify({
  instances,
  libs: [...new Set([...loaded, ...entering].map((l) => l.lib))],
  seen,
  runtimes: runtimeRoots.size > 0 ? entering.map((e) => e.name) : [],
  packages: Object.fromEntries(loaded.map((l) => [l.specifier, l.pkg])),
}));
`;

/** npm without the settings `npm test` put into the environment. */
const npmEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.toLowerCase().startsWith('npm_')) delete env[key];
  return env;
};

const npm = async (args: string[], cwd: string): Promise<string> =>
  (
    await execFileAsync('npm', args, {
      cwd,
      env: npmEnv(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      ...spawnOptionsForNpm,
    })
  ).stdout;

const INSTALL_FLAGS = ['--no-audit', '--no-fund', '--ignore-scripts'];

/** Where `npm install -g --prefix <prefix>` puts packages. */
const globalRoot = (prefix: string): string =>
  process.platform === 'win32'
    ? join(prefix, 'node_modules')
    : join(prefix, 'lib', 'node_modules');

/** One installed tree and the binaries installed into it. */
interface Installed {
  readonly label: string;
  readonly global: boolean;
  /** The prefix (global) or the project directory (local). */
  readonly dir: string;
  /** Where the tree's top-level packages are. */
  readonly modules: string;
  readonly binaries: readonly Binary[];
  /** The registry it was installed from. */
  readonly registry: TarballRegistry;
}

/** At most `limit` installs at once: each is an npm process and a tree. */
function pool(limit: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (job) => {
    if (running >= limit)
      await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await job();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

const spec = (name: string, version = RELEASE_VERSION): string =>
  `@mcp-abap-adt/${name}@${version}`;

describe('one @mcp-abap-adt/lib per server process, in every install layout', () => {
  // One pack of eighteen and about twenty installs: minutes on a cold cache.
  jest.setTimeout(20 * 60 * 1000);

  let workdir: string | undefined;
  const registries: TarballRegistry[] = [];
  const cases = new Map<string, Promise<Installed>>();
  let checker = '';

  const at = (label: string): Promise<Installed> => {
    const found = cases.get(label);
    if (found === undefined) throw new Error(`no install case ${label}`);
    return found;
  };

  beforeAll(
    async () => {
      if (SKIPPED) return;
      workdir = mkdtempSync(join(tmpdir(), 'mcp-install-matrix-'));
      checker = join(workdir, 'checker.cjs');
      writeFileSync(checker, CHECKER);

      // Every package of the release, packed once; and for layout 5 a copy of
      // the runtime at the next patch, packed from a prepared directory.
      const packs = join(workdir, 'packs');
      mkdirSync(packs);
      const tarballs = packRelease(packs, RELEASE_DIRS);
      const skewed = join(workdir, 'runtime-later-patch');
      mkdirSync(skewed);
      for (const part of ['dist', 'README.md', 'LICENSE'])
        cpSync(join(ROOT, 'server-runtime', part), join(skewed, part), {
          recursive: true,
        });
      const runtimeManifest = JSON.parse(
        readFileSync(join(ROOT, 'server-runtime', 'package.json'), 'utf8'),
      );
      writeFileSync(
        join(skewed, 'package.json'),
        JSON.stringify(
          { ...runtimeManifest, version: laterPatch(runtimeManifest.version) },
          null,
          2,
        ),
      );
      const skewPacks = join(workdir, 'skew-packs');
      mkdirSync(skewPacks);
      const [laterRuntime] = packRelease(skewPacks, [skewed]);

      const release = await startTarballRegistry(tarballs);
      const skew = await startTarballRegistry([
        ...tarballs,
        laterRuntime as string,
      ]);
      registries.push(release, skew);

      const limit = pool(4);
      const start = (
        label: string,
        install: () => Promise<Omit<Installed, 'label'>>,
      ): void => {
        const running = limit(async () => ({ label, ...(await install()) }));
        // Awaited by its test; marked handled so a failure is that test's.
        running.catch(() => undefined);
        cases.set(label, running);
      };
      const freshDir = (label: string): string => {
        const dir = join(workdir as string, label);
        mkdirSync(dir);
        return dir;
      };
      const globalInstall = (
        registry: TarballRegistry,
        prefix: string,
        names: readonly string[],
      ): Promise<string> =>
        npm(
          [
            'install',
            '-g',
            '--prefix',
            prefix,
            ...INSTALL_FLAGS,
            ...registry.npmArgs,
            ...names.map((name) => spec(name)),
          ],
          prefix,
        );
      const localInstall = async (
        registry: TarballRegistry,
        dir: string,
        names: readonly string[],
        extra: readonly string[] = [],
      ): Promise<void> => {
        writeFileSync(
          join(dir, 'package.json'),
          '{"name":"install-matrix","version":"0.0.0","private":true}\n',
        );
        await npm(
          [
            'install',
            ...INSTALL_FLAGS,
            ...extra,
            ...registry.npmArgs,
            ...names.map((name) => spec(name)),
          ],
          dir,
        );
      };

      // 1. Global, each wrapper in one command with its former base.
      for (const [wrapper, base] of Object.entries(FORMER_BASE)) {
        start(`global ${wrapper} with ${base}`, async () => {
          const prefix = freshDir(`l1-${wrapper}`);
          await globalInstall(release, prefix, [wrapper, base]);
          return {
            global: true,
            dir: prefix,
            modules: globalRoot(prefix),
            binaries: [BINARIES[wrapper as BinaryName], BINARIES[base]],
            registry: release,
          };
        });
      }

      // 2. Global, wrapper and base in two commands, either order.
      const wrappers = ['compact', 'http-ro', 'compact-sse'] as const;
      const bases = wrappers.map(
        (wrapper) => FORMER_BASE[wrapper] as BinaryName,
      );
      for (const [order, first, second] of [
        ['wrappers first', wrappers, bases],
        ['bases first', bases, wrappers],
      ] as const) {
        start(`global, two commands, ${order}`, async () => {
          const prefix = freshDir(`l2-${order.replace(' ', '-')}`);
          await globalInstall(release, prefix, first);
          await globalInstall(release, prefix, second);
          return {
            global: true,
            dir: prefix,
            modules: globalRoot(prefix),
            binaries: [...wrappers, ...bases].map((name) => BINARIES[name]),
            registry: release,
          };
        });
      }

      // 3. Local, the default (hoisted) install of all twelve.
      start('local, hoisted, all twelve', async () => {
        const dir = freshDir('l3');
        await localInstall(release, dir, Object.keys(BINARIES));
        return {
          global: false,
          dir,
          modules: join(dir, 'node_modules'),
          binaries: Object.values(BINARIES),
          registry: release,
        };
      });

      // 4. Local, nested: plain and compact of each transport.
      for (const [plain, compact] of [
        ['core', 'compact'],
        ['http', 'compact-http'],
        ['sse', 'compact-sse'],
      ] as const) {
        start(`local, nested, ${plain} and ${compact}`, async () => {
          const dir = freshDir(`l4-${plain}`);
          await localInstall(
            release,
            dir,
            [plain, compact],
            ['--install-strategy=nested'],
          );
          return {
            global: false,
            dir,
            modules: join(dir, 'node_modules'),
            binaries: [BINARIES[plain], BINARIES[compact]],
            registry: release,
          };
        });
      }

      // 5. The runtime at a later patch than the binaries.
      start('global, the runtime at a later patch', async () => {
        const prefix = freshDir('l5');
        await globalInstall(skew, prefix, ['compact', 'core']);
        return {
          global: true,
          dir: prefix,
          modules: globalRoot(prefix),
          binaries: [BINARIES.compact, BINARIES.core],
          registry: skew,
        };
      });

      // An embedder: compact-readonly-entries with lib, and alone.
      for (const [label, names] of [
        [
          'compact-readonly-entries with lib',
          ['compact-readonly-entries', 'lib'],
        ],
        ['compact-readonly-entries alone', ['compact-readonly-entries']],
      ] as const) {
        start(`local, ${label}`, async () => {
          const dir = freshDir(`embed-${names.length}`);
          await localInstall(release, dir, names);
          return {
            global: false,
            dir,
            modules: join(dir, 'node_modules'),
            binaries: [],
            registry: release,
          };
        });
      }
    },
    20 * 60 * 1000,
  );

  afterAll(async () => {
    await Promise.allSettled([...cases.values()]);
    await Promise.all(registries.map((registry) => registry.close()));
    if (workdir !== undefined)
      rmSync(workdir, { recursive: true, force: true });
  });

  /** The child's verdict on one tree, resolved from `from`. */
  const load = async (
    from: string,
    specifiers: readonly string[],
  ): Promise<{
    instances: string[] | null;
    libs: string[];
    seen: Record<string, boolean>;
    runtimes: string[];
    packages: Record<string, string | null>;
  }> => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [checker, from, ...specifiers],
      { cwd: from, encoding: 'utf8' },
    );
    return JSON.parse(stdout.trim().split('\n').at(-1) as string);
  };

  const expectOneLib = (verdict: Awaited<ReturnType<typeof load>>): void => {
    expect(verdict.instances).toHaveLength(1);
    expect(verdict.libs).toHaveLength(1);
    expect(Object.values(verdict.seen).length).toBeGreaterThan(0);
    expect(verdict.seen).toEqual(
      Object.fromEntries(Object.keys(verdict.seen).map((key) => [key, true])),
    );
  };

  /** Each package of the release in `npm ls`, with the version served. */
  const expectServedVersions = async (installed: Installed): Promise<void> => {
    const tree = JSON.parse(
      await npm(
        installed.global
          ? ['ls', '-g', '--prefix', installed.dir, '--all', '--json']
          : ['ls', '--all', '--json'],
        installed.dir,
      ),
    );
    const found: string[] = [];
    const walk = (
      deps: Record<string, { version?: string; dependencies?: unknown }>,
    ) => {
      for (const [name, node] of Object.entries(deps ?? {})) {
        const served = installed.registry.served.get(name);
        if (served !== undefined) {
          found.push(name);
          // The newest served version: npm takes the highest one the ranges allow.
          expect({ name, version: node.version }).toEqual({
            name,
            version: served.at(-1),
          });
        }
        walk((node.dependencies ?? {}) as never);
      }
    };
    walk(tree.dependencies);
    expect(found).toContain('@mcp-abap-adt/lib');
  };

  /** A local install's lockfile: every package of the release from its tarball. */
  const expectTarballsInLockfile = (installed: Installed): void => {
    const lock = JSON.parse(
      readFileSync(join(installed.dir, 'package-lock.json'), 'utf8'),
    ) as { packages: Record<string, { name?: string; resolved?: string }> };
    const ours = Object.entries(lock.packages).filter(([path]) => {
      const name = path.split('node_modules/').at(-1) ?? '';
      return installed.registry.served.has(name);
    });
    expect(ours.length).toBeGreaterThan(0);
    for (const [path, entry] of ours)
      expect({
        path,
        own: installed.registry.isOwnTarball(entry.resolved),
      }).toEqual({ path, own: true });
  };

  const expectBinaries = async (installed: Installed): Promise<void> => {
    for (const bin of installed.binaries) {
      const dir = join(installed.modules, '@mcp-abap-adt', bin.pkg);
      // The launcher first: the runtime it takes is the one checked.
      const verdict = await load(dir, [
        join(dir, 'dist', 'launcher.js'),
        ...bin.tools.map((tool) => `@mcp-abap-adt/${tool}`),
        '@mcp-abap-adt/lib/tool-set',
        '@mcp-abap-adt/lib/config',
      ]);
      expect({ binary: bin.pkg, instances: verdict.instances?.length }).toEqual(
        {
          binary: bin.pkg,
          instances: 1,
        },
      );
      expectOneLib(verdict);
      // One runtime, the newest the registry offered: the one the ranges take.
      const runtimeVersion = installed.registry.served
        .get('@mcp-abap-adt/server-runtime')
        ?.at(-1);
      expect({ binary: bin.pkg, runtimes: verdict.runtimes }).toEqual({
        binary: bin.pkg,
        runtimes: [`@mcp-abap-adt/server-runtime@${runtimeVersion}`],
      });

      const { stdout } = await execFileAsync(
        process.execPath,
        [join(dir, 'bin', `${bin.bin}.js`), '--version'],
        { cwd: installed.dir, encoding: 'utf8' },
      );
      expect({ binary: bin.pkg, version: stdout.trim() }).toEqual({
        binary: bin.pkg,
        version: sourceVersion(bin.dir),
      });
    }
  };

  const check = async (label: string): Promise<Installed> => {
    const installed = await at(label);
    await expectBinaries(installed);
    await expectServedVersions(installed);
    if (!installed.global) expectTarballsInLockfile(installed);
    return installed;
  };

  const skippable = SKIPPED ? it.skip : it;
  if (SKIPPED) console.log('[install-matrix] skipped by SKIP_INSTALL_MATRIX');

  describe('1. global, each wrapper in one command with its former base', () => {
    skippable.each(Object.entries(FORMER_BASE))(
      '%s with %s',
      async (wrapper, base) => {
        await check(`global ${wrapper} with ${base}`);
      },
    );
  });

  describe('2. global, wrapper and base in two commands', () => {
    skippable.each(['wrappers first', 'bases first'])('%s', async (order) => {
      await check(`global, two commands, ${order}`);
    });
  });

  skippable(
    '3. local, the default install of all twelve binaries',
    async () => {
      await check('local, hoisted, all twelve');
    },
  );

  describe('4. local, --install-strategy=nested', () => {
    skippable.each([
      ['core', 'compact'],
      ['http', 'compact-http'],
      ['sse', 'compact-sse'],
    ])('%s and %s', async (plain, compact) => {
      await check(`local, nested, ${plain} and ${compact}`);
    });
  });

  skippable(
    '5. the runtime at a later patch than the binaries: still one copy',
    async () => {
      const installed = await check('global, the runtime at a later patch');
      for (const bin of installed.binaries) {
        const verdict = await load(
          join(installed.modules, '@mcp-abap-adt', bin.pkg),
          [
            join(
              installed.modules,
              '@mcp-abap-adt',
              bin.pkg,
              'dist',
              'launcher.js',
            ),
          ],
        );
        expect({ binary: bin.pkg, runtimes: verdict.runtimes }).toEqual({
          binary: bin.pkg,
          runtimes: [
            `@mcp-abap-adt/server-runtime@${laterPatch(RELEASE_VERSION)}`,
          ],
        });
      }
    },
  );

  describe('an embedder: compact-readonly-entries takes lib as its peer', () => {
    skippable.each(['with lib', 'alone'])('%s', async (how) => {
      const installed = await check(`local, compact-readonly-entries ${how}`);
      const verdict = await load(installed.dir, [
        '@mcp-abap-adt/lib/request-context',
        '@mcp-abap-adt/compact-readonly-entries',
      ]);
      expectOneLib(verdict);
    });
  });

  skippable(
    'never asks the public registry for a package of the release',
    async () => {
      await Promise.allSettled([...cases.values()]);
      const ours = new Set(
        RELEASE_DIRS.map(
          (dir) =>
            (
              JSON.parse(
                readFileSync(join(ROOT, dir, 'package.json'), 'utf8'),
              ) as {
                name: string;
              }
            ).name,
        ),
      );
      for (const registry of registries) {
        expect(registry.proxied.filter((name) => ours.has(name))).toEqual([]);
        expect(new Set(registry.served.keys())).toEqual(ours);
      }
    },
  );
});
