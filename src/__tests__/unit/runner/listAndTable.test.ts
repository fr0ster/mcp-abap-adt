/**
 * One list, one name table (D27, plan step 3).
 *
 * `tools/node-test-files.json` is the one list of the test files that run on
 * node:test; `tsconfig.paths.json` the one table of this repository's package
 * names and their source entries. Jest's configuration (`jest.config.js`)
 * builds its `moduleNameMapper` from the table and ignores every listed path;
 * `tsconfig.test.json` takes its `paths` from the table through `extends`;
 * the node:test resolve hook answers the table's names and nothing else.
 * Jest's configuration is read as Jest loads it, by running Jest in a child
 * process (`--showConfig`, `--listTests`), never by importing it.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import type { ResolveFnOutput, ResolveHookContext } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { readNameTable } from '../../helpers/nameTable';
import { tableResolve } from '../../helpers/resolveHook';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const JEST = require.resolve('jest/bin/jest');
/** Jest's own rule: a relative `./x.js` import is the `./x.ts` source. */
const RELATIVE_JS: [string, string] = ['^(\\.{1,2}/.*)\\.js$', '$1'];

/** Runs Jest in a child process, from the repository root, and returns stdout. */
function jest(args: readonly string[]): string {
  const run = spawnSync(process.execPath, [JEST, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(
      `jest ${args.join(' ')} exited ${run.status}: ${run.stderr}`,
    );
  }
  return run.stdout;
}

interface LoadedConfig {
  moduleNameMapper: Array<[string, string]>;
  testPathIgnorePatterns: string[];
}

function isStringPair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

/** The project configuration of `jest --showConfig`: data from a child process. */
function loadedConfig(args: readonly string[] = []): LoadedConfig {
  const shown: unknown = JSON.parse(jest([...args, '--showConfig']));
  if (
    typeof shown !== 'object' ||
    shown === null ||
    !('configs' in shown) ||
    !Array.isArray(shown.configs) ||
    shown.configs.length !== 1
  ) {
    throw new Error('jest --showConfig: not one project configuration');
  }
  const [config] = shown.configs;
  if (
    typeof config !== 'object' ||
    config === null ||
    !('moduleNameMapper' in config) ||
    !('testPathIgnorePatterns' in config)
  ) {
    throw new Error('jest --showConfig: no moduleNameMapper or ignores');
  }
  const mapper: unknown = config.moduleNameMapper;
  const ignores: unknown = config.testPathIgnorePatterns;
  if (!Array.isArray(mapper) || !mapper.every(isStringPair)) {
    throw new Error('jest --showConfig: moduleNameMapper is not pairs');
  }
  if (
    !Array.isArray(ignores) ||
    !ignores.every((p): p is string => typeof p === 'string')
  ) {
    throw new Error('jest --showConfig: testPathIgnorePatterns is not strings');
  }
  return { moduleNameMapper: mapper, testPathIgnorePatterns: ignores };
}

/** The test files `jest --listTests --json` finds: data from a child process. */
function listedTests(args: readonly string[] = []): string[] {
  const listed: unknown = JSON.parse(jest([...args, '--listTests', '--json']));
  if (
    !Array.isArray(listed) ||
    !listed.every((p): p is string => typeof p === 'string')
  ) {
    throw new Error('jest --listTests --json: not a list of paths');
  }
  return listed;
}

describe('one list, one name table', () => {
  it("Jest's mapper is the table", () => {
    const expected: Array<[string, string]> = [
      ...[...readNameTable(REPO)].map(([name, target]): [string, string] => [
        `^${name}$`,
        path.join(REPO, target),
      ]),
      RELATIVE_JS,
    ];
    expect(loadedConfig().moduleNameMapper).toEqual(expected);
  });

  it('Jest ignores every listed path', () => {
    const listedFile = path.join(
      REPO,
      'src',
      '__tests__',
      'unit',
      'ci',
      'ipsSummary.test.ts',
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-test-list-'));
    try {
      const list = path.join(dir, 'list.json');
      fs.writeFileSync(
        list,
        JSON.stringify(['src/__tests__/unit/ci/ipsSummary.test.ts']),
      );
      const config = path.join(dir, 'jest.config.js');
      fs.writeFileSync(
        config,
        `module.exports = require(${JSON.stringify(
          path.join(REPO, 'jest.config.js'),
        )}).jestConfig(${JSON.stringify(list)});\n`,
      );
      const withList = ['--config', config];
      expect(loadedConfig(withList).testPathIgnorePatterns).toHaveLength(3);
      const found = listedTests(withList);
      const foundWithout = listedTests();
      expect(foundWithout).toContain(listedFile);
      expect(found).not.toContain(listedFile);
      expect(found).toHaveLength(foundWithout.length - 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the type checker's paths are the table", () => {
    const file = path.join(REPO, 'tsconfig.test.json');
    const read = ts.readConfigFile(file, ts.sys.readFile);
    const raw: unknown = read.config;
    expect(read.error).toBeUndefined();
    if (typeof raw !== 'object' || raw === null || !('extends' in raw)) {
      throw new Error('tsconfig.test.json: no extends');
    }
    expect(raw.extends).toEqual(['./tsconfig.json', './tsconfig.paths.json']);
    const own: unknown = 'compilerOptions' in raw ? raw.compilerOptions : {};
    expect(typeof own === 'object' && own !== null && 'paths' in own).toBe(
      false,
    );

    const parsed = ts.getParsedCommandLineOfConfigFile(
      file,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          );
        },
      },
    );
    if (parsed === undefined) throw new Error('tsconfig.test.json: unread');
    const table = readNameTable(REPO);
    expect(Object.entries(parsed.options.paths ?? {})).toEqual(
      [...table].map(([name, target]) => [name, [target]]),
    );
    // Each name resolves to its source from a test, as the checker resolves it.
    const from = path.join(REPO, 'src', '__tests__', 'unit', 'any.test.ts');
    for (const [name, target] of table) {
      const resolved = ts.resolveModuleName(name, from, parsed.options, ts.sys)
        .resolvedModule?.resolvedFileName;
      expect([name, resolved]).toEqual([name, path.join(REPO, target)]);
    }
  });

  it("the hook answers only the table's names", () => {
    const buildDir = path.join(REPO, '.test-build');
    const hook = tableResolve(
      new Map([
        ['@mcp-abap-adt/lib', './src/index.ts'],
        ['@mcp-abap-adt/core/auth', './server/src/auth/index.ts'],
      ]),
      buildDir,
    );
    const context: ResolveHookContext = {
      conditions: ['node', 'require'],
      importAttributes: {},
      parentURL: undefined,
    };
    const handed: string[] = [];
    const next = (specifier: string): ResolveFnOutput => {
      handed.push(specifier);
      return { url: `node-own:${specifier}` };
    };
    expect(hook('@mcp-abap-adt/lib', context, next)).toEqual({
      url: pathToFileURL(path.join(buildDir, 'src', 'index.js')).href,
      shortCircuit: true,
    });
    expect(hook('@mcp-abap-adt/core/auth', context, next)).toEqual({
      url: pathToFileURL(
        path.join(buildDir, 'server', 'src', 'auth', 'index.js'),
      ).href,
      shortCircuit: true,
    });
    expect(handed).toEqual([]);
    // Not in the table: a sibling's other subpath, a registry package, a
    // relative import — each is Node's own.
    for (const other of [
      '@mcp-abap-adt/lib/handlers',
      '@mcp-abap-adt/adt-clients',
      './index.js',
    ]) {
      expect(hook(other, context, next)).toEqual({ url: `node-own:${other}` });
    }
    expect(handed).toEqual([
      '@mcp-abap-adt/lib/handlers',
      '@mcp-abap-adt/adt-clients',
      './index.js',
    ]);
  });

  it('nothing reads package.json jest', () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    expect(
      typeof manifest === 'object' && manifest !== null && 'jest' in manifest,
    ).toBe(false);
  });
});
