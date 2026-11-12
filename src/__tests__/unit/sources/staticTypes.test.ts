/**
 * Production code is checked by the compiler, not by the author's word: no
 * type assertion but `as const`, no `any`, no non-null or definite-assignment
 * `!`, no `ts-ignore`, `ts-expect-error` or `ts-nocheck` directive, no
 * `biome-ignore`.
 * The scan (`helpers/typeEscapeScan.ts`) reads the syntax tree of every production
 * source the regex scan reads (`regexScan.ts` `productionSources()`): every
 * git-tracked `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` of the root and
 * of each package — `src`, `scripts`, `tools`, `bin` — outside tests,
 * fixtures, typechecks and docs. A fixture tree laid out as a repository
 * proves the discovery. It is what makes `as unknown as`
 * fail the build, since `tsc` accepts it; Biome's three rules
 * (`noExplicitAny`, `noImplicitAnyLet`, `noUnsafeTypeAssertion`) and
 * `noImplicitAny` stand beside it.
 *
 * Each fixture under `__fixtures__/typeEscapes/refused` is one escape and must
 * be reported under its rule alone; the one under `clean` must not be.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO, rel } from './helpers/failureScan';
import { productionSources } from './helpers/regexScan';
import {
  type EscapeRule,
  productionDirectories,
  scanFile,
} from './helpers/typeEscapeScan';

/** A JSON value's member at `keys`, read by shape; absent when any step is not an object. */
function member(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined;
    }
    current = Reflect.get(current, key);
  }
  return current;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));
}

/** The files `biome.json` exempts from `noUnsafeTypeAssertion`. */
function biomeAssertionExemptions(): string[] {
  const overrides = member(readJson('biome.json'), ['overrides']);
  const exempt: string[] = [];
  for (const override of Array.isArray(overrides) ? overrides : []) {
    const rule = member(override, [
      'linter',
      'rules',
      'nursery',
      'noUnsafeTypeAssertion',
    ]);
    const includes = member(override, ['includes']);
    if (rule !== 'off' || !Array.isArray(includes)) continue;
    for (const include of includes) {
      if (typeof include === 'string') exempt.push(include);
    }
  }
  return exempt;
}

/** The paths a script's first `biome check` names (its words that are not flags). */
function biomeCheckPaths(script: string): string[] {
  const command = member(readJson('package.json'), ['scripts', script]);
  if (typeof command !== 'string') return [];
  const words = command.split(' && ')[0]?.split(' ') ?? [];
  if (words[0] !== 'biome' || words[1] !== 'check') return [];
  return words.slice(2).filter((word) => !word.startsWith('--'));
}

describe('production sources', () => {
  const directories = productionDirectories();
  // The files the regex scan reads: every git-tracked production source, the
  // root's tools and each package's bin and scripts included.
  const files = productionSources().map((file) => path.join(REPO, file));
  const escapes = files.flatMap(scanFile);

  it('scans the root src, scripts and every package src', () => {
    assert.deepEqual(
      [
        'src',
        'scripts',
        'server/src',
        'server-runtime/src',
        'http/src',
        'sse/src',
        'compact-modify/src',
        'compact-readonly-entries/src',
        'background-runs-memory/src',
        'responsible-rules/src',
        'compact-sse-ro/src',
      ].filter((dir) => !directories.includes(dir)),
      [],
    );
    for (const dir of directories) {
      assert.equal(
        files.some((file) => rel(file).startsWith(`${dir}/`)),
        true,
        dir,
      );
    }
    const scanned = files.map(rel);
    assert.deepEqual(
      [
        'src/lib/batch/phases.ts',
        'scripts/list-tools.ts',
        'server-runtime/src/stdio/launcher.ts',
        'tools/npm-test.mjs',
        'server/bin/mcp-abap-adt.js',
      ].filter((file) => !scanned.includes(file)),
      [],
    );
    assert.equal(
      scanned.some((file) => file.includes('__tests__')),
      false,
    );
    assert.equal(
      scanned.some((file) => file.endsWith('.test.ts')),
      false,
    );
    assert.equal(
      scanned.some((file) => file.includes('__fixtures__')),
      false,
    );
  });

  it('holds no escape', () => {
    assert.deepEqual(escapes, []);
  });

  it("exempts from Biome's assertion rule exactly the tests", () => {
    const tests = ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'];
    assert.deepEqual(biomeAssertionExemptions().sort(), [...tests].sort());
  });

  for (const script of ['lint', 'lint:check', 'build']) {
    it(`the root ${script} runs Biome over every production directory`, () => {
      // Its directories are exactly the production directories; every other
      // entry names a file that exists (the node:test tools, D27).
      const paths = biomeCheckPaths(script);
      const isDirectory = (entry: string): boolean => {
        const at = path.join(REPO, entry);
        return fs.existsSync(at) && fs.statSync(at).isDirectory();
      };
      assert.deepEqual(
        paths.filter(isDirectory).sort(),
        [...directories].sort(),
      );
      const files = paths.filter((entry) => !isDirectory(entry));
      assert.deepEqual(
        files.filter((entry) => {
          const at = path.join(REPO, entry);
          return !fs.existsSync(at) || !fs.statSync(at).isFile();
        }),
        [],
      );
    });
  }
});

describe('discovery reads every production source of a repository, tools and bin included', () => {
  // A fixture laid out as a repository: discovery runs over it as over the
  // real one, so a directory or an extension left out of discovery leaves its
  // fixture unfound — which a test of scanFile alone could not show.
  const tree = path.join(
    REPO,
    'src',
    '__tests__',
    'unit',
    'sources',
    '__fixtures__',
    'typeEscapes',
    'tree',
  );
  const found = productionSources(tree);
  const rulesOf = (file: string) =>
    new Set(scanFile(path.join(tree, file)).map((one) => one.rule));

  it('finds the tool, the bin, the package script and the clean source', () => {
    assert.deepEqual(found, [
      'pkg/bin/escape.mjs',
      'pkg/scripts/escape.ts',
      'pkg/src/clean.ts',
      'tools/escape.mjs',
    ]);
  });

  it('reports each under its rule, and nothing in the clean one', () => {
    assert.deepEqual(
      rulesOf('tools/escape.mjs'),
      new Set(['@ts-expect-error']),
    );
    assert.deepEqual(rulesOf('pkg/bin/escape.mjs'), new Set(['biome-ignore']));
    assert.deepEqual(rulesOf('pkg/scripts/escape.ts'), new Set(['assertion']));
    assert.deepEqual(rulesOf('pkg/src/clean.ts'), new Set());
  });
});

describe('the scan refuses each escape, and only those', () => {
  const root = path.join(
    REPO,
    'src',
    '__tests__',
    'unit',
    'sources',
    '__fixtures__',
    'typeEscapes',
  );
  const fixture = (kind: 'refused' | 'clean', name: string) =>
    path.join(root, kind, `${name}.ts`);
  const REFUSED: ReadonlyArray<readonly [string, EscapeRule]> = [
    ['assertion', 'assertion'],
    ['angleBracketAssertion', 'assertion'],
    ['asUnknownAs', 'assertion'],
    ['any', 'any'],
    ['nonNull', '!'],
    ['definiteAssignment', '!'],
    ['tsIgnore', '@ts-ignore'],
    ['tsExpectError', '@ts-expect-error'],
    ['tsNocheck', '@ts-nocheck'],
    ['biomeIgnore', 'biome-ignore'],
  ];

  it('has one fixture per way past it, every rule among them', () => {
    const onDisk = fs
      .readdirSync(path.join(root, 'refused'))
      .map((name) => path.basename(name, '.ts'))
      .sort();
    assert.deepEqual(onDisk, REFUSED.map(([name]) => name).sort());
    const rules: EscapeRule[] = [
      'assertion',
      'any',
      '!',
      '@ts-ignore',
      '@ts-expect-error',
      '@ts-nocheck',
      'biome-ignore',
    ];
    assert.deepEqual(new Set(REFUSED.map(([, rule]) => rule)), new Set(rules));
  });

  for (const [name, rule] of REFUSED) {
    it(`refuses ${name} under ${rule} alone`, () => {
      const found = scanFile(fixture('refused', name));
      assert.ok(found.length > 0, `${name}: nothing found`);
      assert.deepEqual(new Set(found.map((one) => one.rule)), new Set([rule]));
    });
  }

  it('accepts as const, <const>, satisfies, the logical ! and the words in a string', () => {
    assert.deepEqual(scanFile(fixture('clean', 'allowed')), []);
  });
});
