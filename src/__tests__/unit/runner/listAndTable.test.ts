/**
 * One name table (D27, plan step 3): `tsconfig.paths.json` is the one table
 * of this repository's package names and their source entries; the test
 * resolve hook answers the table's names and nothing else. That every test
 * configuration takes its `paths` from the table is checked in
 * `build.test.ts`.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import type { ResolveFnOutput, ResolveHookContext } from 'node:module';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { repositoryRoot } from '../../helpers/repoRoot';
import { tableResolve } from '../../helpers/resolveHook';

const REPO = repositoryRoot(__dirname);

describe('one name table', () => {
  it("the hook answers only the table's names", () => {
    const buildDir = path.join(REPO, '.test-build', 'tree');
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
    assert.deepStrictEqual(hook('@mcp-abap-adt/lib', context, next), {
      url: pathToFileURL(path.join(buildDir, 'src', 'index.js')).href,
      shortCircuit: true,
    });
    assert.deepStrictEqual(hook('@mcp-abap-adt/core/auth', context, next), {
      url: pathToFileURL(
        path.join(buildDir, 'server', 'src', 'auth', 'index.js'),
      ).href,
      shortCircuit: true,
    });
    assert.deepStrictEqual(handed, []);
    // Not in the table: a sibling's other subpath, a registry package, a
    // relative import — each is Node's own.
    for (const other of [
      '@mcp-abap-adt/lib/handlers',
      '@mcp-abap-adt/adt-clients',
      './index.js',
    ]) {
      assert.deepStrictEqual(hook(other, context, next), {
        url: `node-own:${other}`,
      });
    }
    assert.deepStrictEqual(handed, [
      '@mcp-abap-adt/lib/handlers',
      '@mcp-abap-adt/adt-clients',
      './index.js',
    ]);
  });

  it('the manifest holds no test runner configuration of its own', () => {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    assert.equal(
      typeof manifest === 'object' && manifest !== null && 'jest' in manifest,
      false,
    );
  });
});
