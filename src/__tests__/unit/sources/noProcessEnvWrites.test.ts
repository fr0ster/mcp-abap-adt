/**
 * No production source writes `process.env` (D26 B4): a launcher resolves
 * its values — from its CLI, YAML, the destination's env file read as a
 * file, and the environment as the fallback — and passes them explicitly.
 * The scan (`helpers/processEnvWriteScan.ts`) reads the syntax tree of every
 * production `.ts` under a package's `src` (outside `__tests__`, test
 * helpers and fixtures) for every write form, on `process.env` and on its
 * aliases. Each fixture under `__fixtures__/processEnvWrites/refused` is one
 * write and must be reported; the one under `clean` must not be.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { REPO } from './helpers/failureScan';
import { envWritesIn } from './helpers/processEnvWriteScan';
import { productionSources } from './helpers/regexScan';

/** Every production `.ts` under a package's `src`. */
function packageSources(): string[] {
  return productionSources().filter(
    (file) => file.endsWith('.ts') && file.split('/').includes('src'),
  );
}

it("scans src and server-runtime's src", () => {
  const files = packageSources();
  assert.ok(files.includes('server-runtime/src/stdio/launcher.ts'));
  assert.ok(files.includes('src/lib/connectionFactory.ts'));
  assert.equal(
    files.some((file) => file.split('/').includes('__tests__')),
    false,
  );
});

it('finds no write to process.env', () => {
  assert.deepStrictEqual(
    envWritesIn(packageSources(), REPO).map(
      (write) => `${write.where} ${write.form}`,
    ),
    [],
  );
});

describe('fixtures', () => {
  const root = path.join(
    REPO,
    'src',
    '__tests__',
    'unit',
    'sources',
    '__fixtures__',
    'processEnvWrites',
  );
  const listed = (dir: string) =>
    fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`);

  for (const file of listed('refused')) {
    it(format('refuses %s', file), () => {
      assert.equal(envWritesIn([file], root).length, 1);
    });
  }

  for (const file of listed('clean')) {
    it(format('accepts %s', file), () => {
      assert.deepStrictEqual(envWritesIn([file], root), []);
    });
  }
});
