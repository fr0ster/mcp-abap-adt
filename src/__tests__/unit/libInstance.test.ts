/**
 * Each loaded copy of `@mcp-abap-adt/lib` registers itself once on a
 * process-wide array, so a server runtime can see two copies in one process.
 * Every public entry (each path of the root `exports` map) loads the
 * registering module for its side effect.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const INSTANCE_SOURCE = path.join(ROOT, 'src', 'lib', 'instance.ts');

type Registry = Array<{ file: string }>;

function registry(): Registry | undefined {
  return (globalThis as Record<symbol, unknown>)[REGISTRY] as
    | Registry
    | undefined;
}

function resetRegistry(): void {
  delete (globalThis as Record<symbol, unknown>)[REGISTRY];
}

function loadIsolated(modulePath: string): Record<string, unknown> {
  let loaded: Record<string, unknown> = {};
  jest.isolateModules(() => {
    loaded = require(modulePath);
  });
  return loaded;
}

afterEach(resetRegistry);

describe('lib instance registry', () => {
  it('registers one frozen entry per load, file = its __filename', () => {
    resetRegistry();
    const { libInstances } = loadIsolated(INSTANCE_SOURCE) as {
      libInstances: () => readonly { file: string }[];
    };
    const list = libInstances();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ file: INSTANCE_SOURCE });
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list[0])).toBe(true);
    expect(registry()).toHaveLength(1);
  });

  it('a second load registers a second entry', () => {
    resetRegistry();
    loadIsolated(INSTANCE_SOURCE);
    const { libInstances } = loadIsolated(INSTANCE_SOURCE) as {
      libInstances: () => readonly { file: string }[];
    };
    expect(libInstances()).toEqual([
      { file: INSTANCE_SOURCE },
      { file: INSTANCE_SOURCE },
    ]);
  });

  it('libInstances returns a copy, not the registry', () => {
    resetRegistry();
    const { libInstances } = loadIsolated(INSTANCE_SOURCE) as {
      libInstances: () => readonly { file: string }[];
    };
    expect(libInstances()).not.toBe(registry());
  });

  it('exports no mutator', () => {
    resetRegistry();
    const loaded = loadIsolated(INSTANCE_SOURCE);
    expect(Object.keys(loaded).sort()).toEqual(['libInstances']);
  });

  it('file is "bundled" where __filename is not a string', () => {
    resetRegistry();
    const { outputText } = ts.transpileModule(
      readFileSync(INSTANCE_SOURCE, 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    // A fresh context: no `__filename` binding and a global of its own, so
    // the registry of this realm (and of Jest's outer one) is not touched.
    const module = { exports: {} as Record<string, unknown> };
    vm.runInNewContext(outputText, { exports: module.exports, module });
    const libInstances = module.exports.libInstances as () => readonly {
      file: string;
    }[];
    expect(libInstances()).toEqual([{ file: 'bundled' }]);
  });

  describe('every public entry registers exactly once', () => {
    const exportsMap = JSON.parse(
      readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    ).exports as Record<string, { require: string }>;
    const entries = Object.entries(exportsMap).map(([key, target]) => {
      const dist = target.require;
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
      expect(registry()).toEqual([
        { file: path.join(ROOT, 'src', 'lib', 'instance.ts') },
      ]);
    });

    it('the root and config export libInstances', () => {
      for (const src of [
        path.join(ROOT, 'src', 'index.ts'),
        path.join(ROOT, 'src', 'lib', 'config', 'index.ts'),
      ]) {
        resetRegistry();
        const loaded = loadIsolated(src);
        expect(typeof loaded.libInstances).toBe('function');
      }
    });
  });
});
