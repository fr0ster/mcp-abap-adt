/**
 * No regular expression in production code. The scan
 * (`helpers/regexScan.ts`) reads the syntax tree of every git-tracked
 * production source of every package — `src`, `scripts`, `tools` and each
 * package's sources, `.ts`, `.js`, `.mjs` and `.cjs` outside tests, fixtures
 * and docs — for a regular-expression literal, any reference to `RegExp`, and
 * a `match` / `matchAll` / `search` call given a string. There is no
 * allowlist: input is read with plain string code, `URL` /
 * `URLSearchParams`, character tests and the XML parser.
 *
 * Each fixture under `__fixtures__/regex/refused` is one regular expression
 * and must be reported; the one under `clean` must not be.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { productionSources, regexSites } from './helpers/regexScan';

describe('no regular expression in production code', () => {
  it('scans src, scripts, tools and every package, outside tests and fixtures', () => {
    const files = productionSources();
    const roots = new Set(files.map((file) => file.split('/')[0]));
    for (const root of ['src', 'scripts', 'tools', 'server-runtime']) {
      expect(roots.has(root)).toBe(true);
    }
    expect(files.some((file) => file.endsWith('.cjs'))).toBe(true);
    expect(files.some((file) => file.endsWith('.mjs'))).toBe(true);
    expect(files.some((file) => file.endsWith('.js'))).toBe(true);
    for (const excluded of ['__tests__', '__fixtures__', 'docs']) {
      expect(files.some((file) => file.split('/').includes(excluded))).toBe(
        false,
      );
    }
  });

  it('finds none', () => {
    const found = productionSources().flatMap((file) =>
      regexSites(file).map((site) => `${site.where} ${site.text}`),
    );
    expect(found).toEqual([]);
  });

  describe('fixtures', () => {
    const root = path.join(__dirname, '__fixtures__/regex');
    const listed = (dir: string) =>
      fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`);

    it.each(listed('refused'))('refuses %s', (file) => {
      expect(regexSites(file, root)).toHaveLength(1);
    });

    it.each(listed('clean'))('accepts %s', (file) => {
      expect(regexSites(file, root)).toEqual([]);
    });
  });
});
