/**
 * No regular expression in production code. The scan
 * (`helpers/regexScan.ts`) reads the syntax tree of every git-tracked
 * production source of every package — `src`, `scripts`, `tools` and each
 * package's sources, `.ts`, `.js`, `.mjs` and `.cjs` outside tests, fixtures
 * and docs — for a regular-expression literal, any reference to `RegExp`
 * (by name or by a string key), and a `match` / `matchAll` / `search` call
 * on a receiver the type checker reads as a string, or given a string. There is no
 * allowlist: input is read with plain string code, `URL` /
 * `URLSearchParams`, character tests and the XML parser.
 *
 * Each fixture under `__fixtures__/regex/refused` is one regular expression
 * and must be reported; the one under `clean` must not be.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './helpers/failureScan';
import { productionSources, regexSitesIn } from './helpers/regexScan';

describe('no regular expression in production code', () => {
  it('scans src, scripts, tools and every package, outside tests and fixtures', () => {
    const files = productionSources();
    const roots = new Set(files.map((file) => file.split('/')[0]));
    for (const root of ['src', 'scripts', 'tools', 'server-runtime']) {
      assert.equal(roots.has(root), true, root);
    }
    for (const extension of ['.cjs', '.mjs', '.js']) {
      assert.equal(
        files.some((file) => file.endsWith(extension)),
        true,
        extension,
      );
    }
    for (const excluded of ['__tests__', '__fixtures__', 'docs']) {
      assert.equal(
        files.some((file) => file.split('/').includes(excluded)),
        false,
        excluded,
      );
    }
  });

  it('finds none', () => {
    const found = regexSitesIn(productionSources()).map(
      (site) => `${site.where} ${site.text}`,
    );
    assert.deepEqual(found, []);
  });

  describe('fixtures', () => {
    const root = path.join(
      REPO,
      'src',
      '__tests__',
      'unit',
      'sources',
      '__fixtures__',
      'regex',
    );
    const listed = (dir: string) =>
      fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`);

    for (const file of listed('refused')) {
      it(`refuses ${file}`, () => {
        assert.equal(regexSitesIn([file], root).length, 1);
      });
    }

    for (const file of listed('clean')) {
      it(`accepts ${file}`, () => {
        assert.deepEqual(regexSitesIn([file], root), []);
      });
    }
  });
});
