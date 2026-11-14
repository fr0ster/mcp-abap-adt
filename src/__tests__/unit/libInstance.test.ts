/**
 * Each loaded copy of `@mcp-abap-adt/lib` registers itself once on a
 * process-wide array, so a server runtime can see two copies in one process.
 * From 24.0.0 on an entry is `{ version, label }` — no path — and the array
 * keeps an earlier copy's `{ file }` entry, counted, never shown by its file.
 * Every public entry (each path of the root `exports` map) loads the
 * registering module for its side effect.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { secondCopyLine } from '../../../server-runtime/src/secondCopy';
import type { LibInstance } from '../../lib/instance';
import { packageManifestOf } from '../../lib/packageManifest';

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const INSTANCE_SOURCE = path.join(ROOT, 'src', 'lib', 'instance.ts');
const VERSION = packageManifestOf(
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')),
).version;
const THIS_COPY: LibInstance = { version: VERSION, label: 'dist' };

/** The array on the global, as another copy would find it. */
function registry(): unknown {
  return Reflect.get(globalThis, REGISTRY);
}

function resetRegistry(): void {
  Reflect.deleteProperty(globalThis, REGISTRY);
}

/** `modulePath` loaded afresh, as another copy of lib would be. */
function loadIsolated(modulePath: string): unknown {
  let loaded: unknown;
  jest.isolateModules(() => {
    loaded = require(modulePath);
  });
  return loaded;
}

/** The `libInstances` a loaded module exports; a module without one fails. */
function libInstancesOf(loaded: unknown): () => unknown {
  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    !('libInstances' in loaded) ||
    typeof loaded.libInstances !== 'function'
  ) {
    throw new Error('the module exports no libInstances');
  }
  const read = loaded.libInstances;
  return (): unknown => Reflect.apply(read, undefined, []);
}

afterEach(resetRegistry);

describe('lib instance registry', () => {
  it('registers one frozen entry per load: the version and the label, no path', () => {
    resetRegistry();
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    expect(list).toEqual([THIS_COPY]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Array.isArray(list) && Object.isFrozen(list[0])).toBe(true);
    expect(JSON.stringify(registry())).not.toContain(ROOT);
  });

  it('a second load registers a second entry', () => {
    resetRegistry();
    loadIsolated(INSTANCE_SOURCE);
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    expect(list).toEqual([THIS_COPY, THIS_COPY]);
  });

  it('libInstances returns a copy, not the registry', () => {
    resetRegistry();
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    expect(list).not.toBe(registry());
  });

  it('exports no mutator', () => {
    resetRegistry();
    const loaded = loadIsolated(INSTANCE_SOURCE);
    expect(
      typeof loaded === 'object' && loaded !== null ? Object.keys(loaded) : [],
    ).toEqual(['libInstances']);
  });

  it('the label is "bundled" inside a Node SEA executable', () => {
    resetRegistry();
    let loaded: unknown;
    try {
      jest.isolateModules(() => {
        jest.doMock('node:sea', () => ({ isSea: () => true }));
        loaded = require(INSTANCE_SOURCE);
      });
    } finally {
      // The mock is the registry's, not the isolated block's: lift it.
      jest.dontMock('node:sea');
    }
    expect(libInstancesOf(loaded)()).toEqual([
      { version: VERSION, label: 'bundled' },
    ]);
  });

  it('a copy loaded after one before 24.0.0 sees two copies; the line holds no path', () => {
    const earlierFile =
      '/global/a/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';
    Reflect.set(globalThis, REGISTRY, [Object.freeze({ file: earlierFile })]);
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    expect(list).toEqual([{ file: earlierFile }, THIS_COPY]);
    const seen: LibInstance[] = [{ file: earlierFile }, THIS_COPY];
    const line = secondCopyLine(seen, '@mcp-abap-adt/core');
    expect(line).toBe(
      `Two copies of @mcp-abap-adt/lib are loaded in this process (a copy before 24.0.0, ${VERSION} dist): reinstall @mcp-abap-adt/core (npm install -g @mcp-abap-adt/core).`,
    );
    expect(line).not.toContain(earlierFile);
  });

  it.each([
    ['a file that is no string', { file: 42 }],
    ['a version without a label', { version: '24.0.0' }],
    ['an unknown label', { version: '24.0.0', label: 'elsewhere' }],
    ['no entry at all', 'not an entry'],
  ])('an array with a malformed entry (%s) is replaced', (_name, entry) => {
    const malformed = [entry];
    Reflect.set(globalThis, REGISTRY, malformed);
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    expect(list).toEqual([THIS_COPY]);
    expect(registry()).not.toBe(malformed);
    expect(malformed).toEqual([entry]);
  });

  describe('every public entry registers exactly once', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    );
    const exportsMap: unknown =
      typeof manifest === 'object' && manifest !== null && 'exports' in manifest
        ? manifest.exports
        : undefined;
    const entries = Object.entries(
      typeof exportsMap === 'object' && exportsMap !== null ? exportsMap : {},
    ).map(([key, target]: [string, unknown]) => {
      const dist =
        typeof target === 'object' &&
        target !== null &&
        'require' in target &&
        typeof target.require === 'string'
          ? target.require
          : '';
      expect(dist.startsWith('./dist/')).toBe(true);
      expect(dist.endsWith('.js')).toBe(true);
      const src = path.join(
        ROOT,
        'src',
        `${dist.slice('./dist/'.length, -'.js'.length)}.ts`,
      );
      return [key, src] as const;
    });

    it('reads the whole exports map', () => {
      expect(entries.length).toBe(17);
    });

    it.each(entries)('%s', (_key, src) => {
      resetRegistry();
      loadIsolated(src);
      expect(registry()).toEqual([THIS_COPY]);
    });

    it('the root and config export libInstances', () => {
      for (const src of [
        path.join(ROOT, 'src', 'index.ts'),
        path.join(ROOT, 'src', 'lib', 'config', 'index.ts'),
      ]) {
        resetRegistry();
        expect(typeof libInstancesOf(loadIsolated(src))).toBe('function');
      }
    });
  });
});
