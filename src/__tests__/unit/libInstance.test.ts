/**
 * Each loaded copy of `@mcp-abap-adt/lib` registers itself once on a
 * process-wide array, so a server runtime can see two copies in one process.
 * From 24.0.0 on an entry is `{ version, label }` — no path — and the array
 * keeps an earlier copy's `{ file }` entry, counted, never shown by its file.
 * Every public entry (each path of the root `exports` map) loads the
 * registering module for its side effect.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import sea = require('node:sea');

import { afterEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { secondCopyLine } from '../../../server-runtime/src/secondCopy';
import type { LibInstance } from '../../lib/instance';
import { packageManifestOf } from '../../lib/packageManifest';
import { repositoryRoot } from '../helpers/repoRoot';

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');
const ROOT = repositoryRoot(__dirname);
/** The test build's compiled src/ (this file runs from its __tests__/unit). */
const BUILT_SRC = path.join(__dirname, '..', '..');
/** The compiled module the test build made of src/lib/instance.ts. */
const INSTANCE_SOURCE = path.join(BUILT_SRC, 'lib', 'instance.js');
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
  // Every compiled src module but the tests' out of the module cache first,
  // so this load runs the module and everything of lib it loads again — the
  // fresh module graph.
  const tests = `${path.sep}__tests__${path.sep}`;
  for (const cached of Object.keys(require.cache)) {
    if (cached.startsWith(BUILT_SRC + path.sep) && !cached.includes(tests)) {
      delete require.cache[cached];
    }
  }
  return require(modulePath);
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
    assert.deepStrictEqual(list, [THIS_COPY]);
    assert.equal(Object.isFrozen(list), true);
    assert.equal(Array.isArray(list) && Object.isFrozen(list[0]), true);
    assert.ok(!JSON.stringify(registry()).includes(ROOT));
  });

  it('a second load registers a second entry', () => {
    resetRegistry();
    loadIsolated(INSTANCE_SOURCE);
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    assert.deepStrictEqual(list, [THIS_COPY, THIS_COPY]);
  });

  it('libInstances returns a copy, not the registry', () => {
    resetRegistry();
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    assert.notEqual(list, registry());
  });

  it('exports no mutator', () => {
    resetRegistry();
    const loaded = loadIsolated(INSTANCE_SOURCE);
    assert.deepStrictEqual(
      typeof loaded === 'object' && loaded !== null ? Object.keys(loaded) : [],
      ['libInstances'],
    );
  });

  it('the label is "bundled" inside a Node SEA executable', () => {
    resetRegistry();
    let loaded: unknown;
    // node:sea's own object (the module reads isSea from it when it loads);
    // lifted after the load.
    const insideSea = mock.method(sea, 'isSea', () => true);
    try {
      loaded = loadIsolated(INSTANCE_SOURCE);
    } finally {
      insideSea.mock.restore();
    }
    assert.deepStrictEqual(libInstancesOf(loaded)(), [
      { version: VERSION, label: 'bundled' },
    ]);
  });

  it('a copy loaded after one before 24.0.0 sees two copies; the line holds no path', () => {
    const earlierFile =
      '/global/a/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';
    Reflect.set(globalThis, REGISTRY, [Object.freeze({ file: earlierFile })]);
    const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
    assert.deepStrictEqual(list, [{ file: earlierFile }, THIS_COPY]);
    const seen: LibInstance[] = [{ file: earlierFile }, THIS_COPY];
    const line = secondCopyLine(seen, '@mcp-abap-adt/core');
    assert.equal(
      line,
      `Two copies of @mcp-abap-adt/lib are loaded in this process (a copy before 24.0.0, ${VERSION} dist): reinstall @mcp-abap-adt/core (npm install -g @mcp-abap-adt/core).`,
    );
    assert.ok(!line.includes(earlierFile));
  });

  for (const [_name, entry] of [
    ['a file that is no string', { file: 42 }],
    ['a version without a label', { version: '24.0.0' }],
    ['an unknown label', { version: '24.0.0', label: 'elsewhere' }],
    ['no entry at all', 'not an entry'],
  ]) {
    it(
      format('an array with a malformed entry (%s) is replaced', _name),
      () => {
        const malformed = [entry];
        Reflect.set(globalThis, REGISTRY, malformed);
        const list = libInstancesOf(loadIsolated(INSTANCE_SOURCE))();
        assert.deepStrictEqual(list, [THIS_COPY]);
        assert.notEqual(registry(), malformed);
        assert.deepStrictEqual(malformed, [entry]);
      },
    );
  }

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
      assert.equal(dist.startsWith('./dist/'), true);
      assert.equal(dist.endsWith('.js'), true);
      const src = path.join(
        BUILT_SRC,
        `${dist.slice('./dist/'.length, -'.js'.length)}.js`,
      );
      return [key, src] as const;
    });

    it('reads the whole exports map', () => {
      assert.deepStrictEqual(
        entries.map(([key]) => key),
        [
          '.',
          './handlers',
          './utils',
          './embeddable',
          './config',
          './auth',
          './logger',
          './request-context',
          './handlers/read',
          './handlers/write',
          './compact-shared',
          './http-transport',
          './debugger',
          './state',
          './tool-set',
          './adt-headers',
          './tool-search',
          './prompts',
        ],
      );
    });

    for (const [_key, src] of entries) {
      it(format('%s', _key), () => {
        resetRegistry();
        loadIsolated(src);
        assert.deepStrictEqual(registry(), [THIS_COPY]);
      });
    }

    it('the root and config export libInstances', () => {
      for (const src of [
        path.join(BUILT_SRC, 'index.js'),
        path.join(BUILT_SRC, 'lib', 'config', 'index.js'),
      ]) {
        resetRegistry();
        assert.equal(typeof libInstancesOf(loadIsolated(src)), 'function');
      }
    });
  });
});
