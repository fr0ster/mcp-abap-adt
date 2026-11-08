/**
 * The node:test build, `tools/build-node-tests.mjs` (`npm run test:build`;
 * D27, plan step 4): it refuses a Jest global, starts clean, emits nothing
 * when a compile fails, and takes its `paths` from the package-name table, as
 * every test configuration does. The build runs in a child process over
 * fixture repositories whose `tsconfig.node-test.json` extends the
 * repository's.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { SYSTEM_TYPES } from '@mcp-abap-adt/responsible-rules';
import * as ts from 'typescript';
import { readNameTable } from '../../helpers/nameTable';
import {
  environment,
  filesUnder,
  fixtureRepo,
  nodeTestSource,
  REPO,
  recorded,
  runTool,
  temporaryDir,
  writeAt,
} from './toolRuns';

const scratch = temporaryDir('node-test-build-');
after(() => scratch.remove());

const LISTED = 'src/__tests__/listed.test.ts';
const COMPILED = '.test-build/src/__tests__/listed.test.js';

function build(repo: string) {
  return runTool('build-node-tests.mjs', ['--repo', repo]);
}

/** The raw JSON of a configuration file, read as TypeScript reads it. */
function rawConfig(file: string): object {
  const read = ts.readConfigFile(file, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const raw: unknown = read.config;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${file}: not an object`);
  }
  return raw;
}

function ownPaths(raw: object): boolean {
  const own: unknown = 'compilerOptions' in raw ? raw.compilerOptions : {};
  return typeof own === 'object' && own !== null && 'paths' in own;
}

describe('the node:test build', () => {
  it('test:build is this build', () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    assert.ok(
      typeof manifest === 'object' &&
        manifest !== null &&
        'scripts' in manifest &&
        typeof manifest.scripts === 'object' &&
        manifest.scripts !== null &&
        'test:build' in manifest.scripts,
    );
    assert.equal(
      manifest.scripts['test:build'],
      'node tools/build-node-tests.mjs',
    );
  });

  it('the node:test build refuses a Jest global', () => {
    const jestGlobal = fixtureRepo(path.join(scratch.dir, 'jest'), [LISTED], {
      [LISTED]: [
        "import { test } from 'node:test';",
        "test('uses Jest', () => { expect(1).toBe(1); });",
        '',
      ].join('\n'),
    });
    const refused = build(jestGlobal);
    assert.equal(refused.status, 1);
    assert.ok(
      refused.stderr.includes("Cannot find name 'expect'"),
      refused.stderr,
    );
    assert.deepEqual(filesUnder(path.join(jestGlobal, '.test-build')), []);

    // The same file without the Jest global builds.
    const plain = fixtureRepo(path.join(scratch.dir, 'plain'), [LISTED], {
      [LISTED]: [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('uses node:assert', () => { assert.equal(1, 1); });",
        '',
      ].join('\n'),
    });
    const built = build(plain);
    assert.equal(built.status, 0, built.stderr);
    assert.ok(fs.existsSync(path.join(plain, ...COMPILED.split('/'))));
  });

  it('the build starts clean', () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'clean'), [LISTED], {
      [LISTED]: nodeTestSource('listed', 'FAIL_LISTED'),
    });
    // A compiled test whose source no longer exists.
    writeAt(
      repo,
      '.test-build/src/__tests__/stale.test.js',
      "require('node:test').test('stale', () => { throw new Error('stale ran'); });\n",
    );
    const built = build(repo);
    assert.equal(built.status, 0, built.stderr);
    assert.deepEqual(filesUnder(path.join(repo, '.test-build')), [
      'src/__tests__/listed.test.js',
      'src/__tests__/listed.test.js.map',
      'stub.js',
      'stub.js.map',
    ]);

    // Even with a stale file left, the runner runs the listed sources only.
    writeAt(
      repo,
      '.test-build/src/__tests__/stale.test.js',
      "require('node:test').test('stale', () => { throw new Error('stale ran'); });\n",
    );
    const record = path.join(scratch.dir, 'clean.record');
    const run = runTool(
      'run-tests.mjs',
      ['--repo', repo, '--concurrency', '1'],
      environment({ RECORD: record }),
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['listed']);
  });

  it('the build places the listed files beside the compiled code', () => {
    const repo = fixtureRepo(path.join(scratch.dir, 'placed'), [LISTED], {
      [LISTED]: nodeTestSource('listed', 'FAIL_LISTED'),
      'pkg/package.json': '{"version":"1.2.3"}\n',
      'fixtures/dir/a.json': '"a"\n',
      'fixtures/dir/deeper/b.json': '"b"\n',
    });
    writeAt(
      repo,
      'tools/node-test-placed.json',
      JSON.stringify(['fixtures/dir', 'pkg/package.json']),
    );
    // Left from an earlier build: the clean removes it before the placement.
    writeAt(repo, '.test-build/pkg/package.json', '{"version":"0.0.0"}\n');
    const built = build(repo);
    assert.equal(built.status, 0, built.stderr);
    assert.deepEqual(filesUnder(path.join(repo, '.test-build')), [
      'fixtures/dir/a.json',
      'fixtures/dir/deeper/b.json',
      'pkg/package.json',
      'src/__tests__/listed.test.js',
      'src/__tests__/listed.test.js.map',
      'stub.js',
      'stub.js.map',
    ]);
    assert.equal(
      fs.readFileSync(
        path.join(repo, '.test-build', 'pkg', 'package.json'),
        'utf8',
      ),
      '{"version":"1.2.3"}\n',
    );

    // An entry that names no file of the repository: the build fails.
    writeAt(
      repo,
      'tools/node-test-placed.json',
      JSON.stringify(['pkg/missing.json']),
    );
    const refused = build(repo);
    assert.equal(refused.status, 1);
    assert.ok(
      refused.stderr.includes('pkg/missing.json: no such repository path'),
      refused.stderr,
    );
  });

  it('a failed compile runs nothing', () => {
    const other = 'src/__tests__/other.test.ts';
    const repo = fixtureRepo(
      path.join(scratch.dir, 'failed'),
      [LISTED, other],
      {
        [LISTED]: [
          "import { test } from 'node:test';",
          "const wrong: number = 'not a number';",
          "test('typed wrong', () => { void wrong; });",
          '',
        ].join('\n'),
        [other]: nodeTestSource('other', 'FAIL_OTHER'),
        'pkg/package.json': '{}\n',
      },
    );
    writeAt(
      repo,
      'tools/node-test-placed.json',
      JSON.stringify(['pkg/package.json']),
    );
    const built = build(repo);
    assert.notEqual(built.status, 0);
    assert.deepEqual(filesUnder(path.join(repo, '.test-build')), []);

    const record = path.join(scratch.dir, 'failed.record');
    const run = runTool(
      'run-tests.mjs',
      ['--repo', repo, '--concurrency', '1'],
      environment({ RECORD: record }),
    );
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes('run the test build first'), run.stderr);
    assert.deepEqual(recorded(record), []);
  });

  it('every test configuration takes its paths from the table', () => {
    const table = readNameTable(REPO);
    assert.equal(
      ownPaths(rawConfig(path.join(REPO, 'tsconfig.json'))),
      false,
      'tsconfig.json defines paths',
    );
    for (const name of ['tsconfig.test.json', 'tsconfig.node-test.json']) {
      const file = path.join(REPO, name);
      const raw = rawConfig(file);
      assert.ok('extends' in raw, `${name}: no extends`);
      assert.deepEqual(
        raw.extends,
        ['./tsconfig.json', './tsconfig.paths.json'],
        name,
      );
      assert.equal(ownPaths(raw), false, `${name} defines paths of its own`);

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
      if (parsed === undefined) throw new Error(`${name}: unread`);
      assert.deepEqual(
        Object.entries(parsed.options.paths ?? {}),
        [...table].map(([entry, target]) => [entry, [target]]),
        name,
      );
      // Each name resolves to its source from a test, as the checker resolves it.
      const from = path.join(REPO, 'src', '__tests__', 'unit', 'any.test.ts');
      for (const [entry, target] of table) {
        const resolved: string | undefined = ts.resolveModuleName(
          entry,
          from,
          parsed.options,
          ts.sys,
        ).resolvedModule?.resolvedFileName;
        // TypeScript answers `/` separators on every platform; `path.normalize`
        // gives the platform's own, as `path.join` does.
        assert.deepEqual(
          [
            name,
            entry,
            resolved === undefined ? undefined : path.normalize(resolved),
          ],
          [name, entry, path.join(REPO, target)],
        );
      }
    }

    // This file imports a sibling by name: it compiled in the node:test build,
    // and the `require` of that name ran through the hook to its compiled
    // file, the module this file holds. (`require.resolve` is not answered by
    // `module.registerHooks` on Node 22 — measured on 22.23.4 — so the module
    // cache is read instead: the hook covers `require` on every Node.)
    const loaded: unknown =
      require.cache[
        path.join(REPO, '.test-build', 'responsible-rules', 'src', 'index.js')
      ]?.exports;
    assert.ok(
      typeof loaded === 'object' && loaded !== null && 'SYSTEM_TYPES' in loaded,
      'the compiled responsible-rules is not the loaded module',
    );
    assert.equal(loaded.SYSTEM_TYPES, SYSTEM_TYPES);
  });
});
