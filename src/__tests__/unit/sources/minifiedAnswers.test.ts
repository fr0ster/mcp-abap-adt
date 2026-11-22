/**
 * Every answer is minified JSON (terse answers, decision 2): no production
 * source calls `JSON.stringify` with an indent, except the sites named in
 * `INDENT_KEPT` — a log line or console listing, or a file written to disk,
 * each with its reason. The scan (`helpers/indentedStringifyScan.ts`) reads
 * the syntax tree of every production source (`productionSources`: `src`,
 * `scripts`, `tools` and every package's sources, outside tests and
 * fixtures). Each fixture under `__fixtures__/indentedStringify/refused` is
 * one indenting call and must be reported; the one under `clean` must not be.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { REPO } from './helpers/failureScan';
import { indentedStringifiesIn } from './helpers/indentedStringifyScan';
import { productionSources } from './helpers/regexScan';

/** The sites that keep an indent: none of them builds an answer. */
const INDENT_KEPT: Readonly<Record<string, string>> = {
  'scripts/list-tools.ts#<top>':
    'a developer script printing the tool listing to the console',
  'tools/debug-runtime-explorer.js#compact':
    'a hand-run explorer clipping a value for its console log',
  'tools/runtime-profiling-dumps-explorer.js#compact':
    'a hand-run explorer clipping a value for its console log',
};

it('scans src, the packages, scripts and tools', () => {
  const files = productionSources();
  assert.ok(files.includes('src/lib/answer.ts'));
  assert.ok(files.includes('compact-modify/src/handlers/handleHandlerLock.ts'));
  assert.ok(files.includes('scripts/list-tools.ts'));
  assert.equal(
    files.some((file) => file.split('/').includes('__tests__')),
    false,
  );
});

it('finds no indenting JSON.stringify outside the allowlist', () => {
  assert.deepStrictEqual(
    indentedStringifiesIn(productionSources(), REPO)
      .filter((found) => INDENT_KEPT[found.site] === undefined)
      .map((found) => found.where),
    [],
  );
});

it('names in the allowlist only sites that still indent', () => {
  const sites = new Set(
    indentedStringifiesIn(productionSources(), REPO).map((found) => found.site),
  );
  assert.deepStrictEqual(
    Object.keys(INDENT_KEPT).filter((site) => !sites.has(site)),
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
    'indentedStringify',
  );
  const listed = (dir: string) =>
    fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`);

  for (const file of listed('refused')) {
    it(format('refuses %s', file), () => {
      assert.equal(indentedStringifiesIn([file], root).length, 1);
    });
  }

  for (const file of listed('clean')) {
    it(format('accepts %s', file), () => {
      assert.deepStrictEqual(indentedStringifiesIn([file], root), []);
    });
  }
});
