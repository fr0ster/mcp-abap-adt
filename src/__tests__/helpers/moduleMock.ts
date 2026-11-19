/**
 * A module replaced for the rest of a test file (node:test `mock.module`,
 * under the runner's `--experimental-test-module-mocks`): the real module's
 * exports, with the names given replaced.
 *
 * Used only where `mock.method` on the defining module cannot reach the name:
 * `@mcp-abap-adt/adt-clients`, whose `exports` map closes its internal files
 * (spec §7, owner 2026-11-19). A module that binds the name when it loads
 * (`class X extends AdtClientOnPrem`) must load after the replacement, so
 * the file requires it after calling this.
 *
 * The replacement is the real module's exports with `replacements` over
 * them. Node 24 and later take it as `exports`; Node 22 has no `exports`
 * option (it gives an empty module) and takes `namedExports`. Which one
 * applies is read from what `require` answers, not from a version: `exports`
 * first, and when the module required does not carry every replacement,
 * that mock is restored and `namedExports` is used.
 *
 * Proven by `unit/testHelpers/moduleMock.test.ts`, the Node 22 path through
 * an injected `mock.module` that ignores `exports` as Node 22 does.
 *
 * Workspace names after a mock (measured, Node 26). The first `mock.module`
 * of a process replaces CommonJS `Module._load` with node:test's own loader,
 * which resolves every later `require` with the plain resolver bound when
 * node:test's mock module loaded, never through the hooks of
 * `module.registerHooks`. So the repository's resolve hook
 * (`resolvePreload.ts`, the name table) is no longer reached, and a later
 * `require('@mcp-abap-adt/background-runs-memory')` fails MODULE_NOT_FOUND.
 * After the mock, this helper puts one router in front of that loader:
 * a name of the table is handed on as its compiled file's path, which the
 * plain resolver finds and the hook would have answered; every other
 * request goes on unchanged. The router reads `Module._load`, the property
 * node:test itself replaces, and is installed once per process.
 */
import Module = require('node:module');

import * as path from 'node:path';
import { mock } from 'node:test';
import { readNameTable } from './nameTable';
import { repositoryRoot } from './repoRoot';
import { compiledFile } from './resolveHook';

/** `mock.module`'s options with Node 24's `exports`, absent from Node 22's types. */
export interface ModuleMockOptions {
  exports?: object;
  namedExports?: object;
}

/** What a module mock answers: its restore. */
export interface ModuleMockContext {
  restore(): void;
}

/** `mock.module`, as this helper calls it. */
export type ModuleMocker = (
  specifier: string,
  options: ModuleMockOptions,
) => ModuleMockContext;

/** `require`, as this helper calls it. */
export type ModuleLoader = (specifier: string) => unknown;

/** Whether `loaded` carries every replacement, by identity. */
function carries(loaded: unknown, replacements: object): boolean {
  if (typeof loaded !== 'object' || loaded === null) return false;
  return Object.entries(replacements).every(
    ([name, value]) => Reflect.get(loaded, name) === value,
  );
}

const nodeMocker: ModuleMocker = (specifier, options) =>
  mock.module(specifier, options);

const nodeLoader: ModuleLoader = (specifier) => require(specifier);

/** Marks the router, so it is put in front of the loader once. */
const ROUTER = Symbol('moduleMock: workspace names routed');

/**
 * Puts the router in front of the CommonJS loader that `mock.module`
 * installed (see the header): a name of the repository's table goes on as
 * its compiled file's path.
 */
function routeWorkspaceNames(): void {
  const loader: unknown = Reflect.get(Module, '_load');
  if (typeof loader !== 'function') {
    throw new Error('moduleMock: Module._load is not a function');
  }
  if (Reflect.get(loader, ROUTER) === true) return;
  const root = repositoryRoot(__dirname);
  const buildDir = path.join(root, '.test-build', 'tree');
  const files = new Map<string, string>();
  for (const [name, target] of readNameTable(root)) {
    files.set(name, compiledFile(buildDir, target));
  }
  const router = function (
    this: unknown,
    request: unknown,
    ...rest: unknown[]
  ): unknown {
    const file = typeof request === 'string' ? files.get(request) : undefined;
    return Reflect.apply(loader, this, [file ?? request, ...rest]);
  };
  Reflect.set(router, ROUTER, true);
  Reflect.set(Module, '_load', router);
}

/**
 * Replaces the module at `resolved` (an absolute path, `require.resolve`'s
 * answer) with its real exports and `replacements` over them, for every later
 * `require` of it in this file. Throws when neither form replaces it.
 */
export function mockModuleExports(
  resolved: string,
  replacements: object,
  mocker: ModuleMocker = nodeMocker,
  load: ModuleLoader = nodeLoader,
): ModuleMockContext {
  const real = load(resolved);
  if (typeof real !== 'object' || real === null) {
    throw new Error(`moduleMock: ${resolved} has no exports object`);
  }
  if (Object.keys(replacements).length === 0) {
    throw new Error('moduleMock: nothing to replace');
  }
  const replaced = { ...real, ...replacements };
  const viaExports = mocker(resolved, { exports: replaced });
  if (mocker === nodeMocker) routeWorkspaceNames();
  if (carries(load(resolved), replacements)) return viaExports;
  viaExports.restore();
  const viaNamed = mocker(resolved, { namedExports: replaced });
  if (carries(load(resolved), replacements)) return viaNamed;
  viaNamed.restore();
  throw new Error(`moduleMock: mock.module did not replace ${resolved}`);
}
