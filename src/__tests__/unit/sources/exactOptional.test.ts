/**
 * `exactOptionalPropertyTypes` is on in every TypeScript project of the
 * repository (spec §3, §6): read from each configuration as the compiler
 * reads it, `extends` followed, so a project that turns it off, or a new one
 * that never turned it on, is named. `tsconfig.paths.json` is no project: a
 * table of paths the others extend.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import { REPO } from './helpers/failureScan';

function projects(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((file) => {
      const name = path.posix.basename(file);
      return (
        name.startsWith('tsconfig') &&
        name.endsWith('.json') &&
        name !== 'tsconfig.paths.json' &&
        !file.includes('__fixtures__')
      );
    });
}

function exactIn(tsconfig: string): boolean | undefined {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(REPO, tsconfig),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  return parsed?.options.exactOptionalPropertyTypes;
}

describe('every TypeScript project checks optional properties exactly', () => {
  const found = projects();

  it('finds the root, test and package projects', () => {
    for (const expected of [
      'tsconfig.json',
      'tsconfig.test.json',
      'tsconfig.node-test.json',
      'server-runtime/tsconfig.json',
      'server-runtime/tsconfig.test.json',
      'compact-modify/tsconfig.json',
    ]) {
      assert.ok(found.includes(expected), expected);
    }
  });

  it('turns exactOptionalPropertyTypes on in each', () => {
    assert.deepEqual(
      found.filter((tsconfig) => exactIn(tsconfig) !== true),
      [],
    );
  });
});
