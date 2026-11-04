/**
 * Production code is checked by the compiler, not by the author's word: no
 * type assertion but `as const`, no `any`, no non-null or definite-assignment
 * `!`, no `ts-ignore`, `ts-expect-error` or `ts-nocheck` directive, no
 * `biome-ignore`.
 * The scan (`helpers/typeEscapeScan.ts`) reads the syntax tree of every production
 * source — the root `src`, `scripts`, and every package's `src`; tests,
 * fixtures and typechecks are outside it. It is what makes `as unknown as`
 * fail the build, since `tsc` accepts it; Biome's three rules
 * (`noExplicitAny`, `noImplicitAnyLet`, `noUnsafeTypeAssertion`) and
 * `noImplicitAny` stand beside it.
 *
 * Each fixture under `__fixtures__/typeEscapes/refused` is one escape and must
 * be reported under its rule alone; the one under `clean` must not be.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO, rel } from './helpers/failureScan';
import {
  type Escape,
  type EscapeRule,
  productionDirectories,
  productionFiles,
  scanFile,
} from './helpers/typeEscapeScan';

/**
 * The assertions that cannot go without a change in another package — the
 * only escapes allowed, each by file, line and exact text. The list may only
 * shrink: an entry no longer found fails, and so does any other escape, in
 * these files too.
 *
 * Upstream change that removes all three:
 * `IAbapConnection.makeAdtRequest<T = unknown, D = unknown>(…):
 * Promise<IAdtWireResponse<T, D>>` (`@mcp-abap-adt/interfaces-adt-connection`)
 * lets the caller choose `T`, so a connection that records or forwards a
 * request holds only `IAdtWireResponse<unknown>` and must assert the caller's
 * `T`. Once interfaces-adt-connection answers `data: unknown` (the caller reads
 * it) and adt-clients and connection follow, published first, these go — and
 * with them Biome's `noUnsafeTypeAssertion` override for their files in
 * `biome.json`, which must name exactly the files listed here.
 */
const BLOCKED: ReadonlyArray<{ where: string; text: string }> = [
  {
    where: 'src/lib/batch/phases.ts:178',
    text: 'correcting.record(request) as Promise<IAdtWireResponse<T, D>>',
  },
  {
    where: 'src/lib/batch/phases.ts:181',
    text: 'record(request) as Promise<IAdtWireResponse<T, D>>',
  },
  {
    where: 'src/handlers/system/readonly/handleRuntimeListFeeds.ts:537',
    text: 'ask(request) as Promise<IAdtWireResponse<T, D>>',
  },
];

const isBlocked = (found: Escape) =>
  found.rule === 'assertion' &&
  BLOCKED.some(
    (blocked) => blocked.where === found.where && blocked.text === found.text,
  );

const fileOf = (where: string) => where.slice(0, where.lastIndexOf(':'));

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
  const files = directories.flatMap((dir) =>
    productionFiles(path.join(REPO, dir)),
  );
  const escapes = files.flatMap(scanFile);

  it('scans the root src, scripts and every package src', () => {
    expect(directories).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    for (const dir of directories) {
      expect(files.some((file) => rel(file).startsWith(`${dir}/`))).toBe(true);
    }
    const scanned = files.map(rel);
    expect(scanned).toContain('src/lib/batch/phases.ts');
    expect(scanned).toContain('scripts/list-tools.ts');
    expect(scanned).toContain('server-runtime/src/stdio/launcher.ts');
    expect(scanned.some((file) => file.includes('__tests__'))).toBe(false);
    expect(scanned.some((file) => file.endsWith('.test.ts'))).toBe(false);
    expect(scanned.some((file) => file.includes('__fixtures__'))).toBe(false);
  });

  it('holds no escape but the blocked assertions', () => {
    expect(escapes.filter((found) => !isBlocked(found))).toEqual([]);
  });

  it('still finds every blocked assertion (a stale entry fails)', () => {
    for (const blocked of BLOCKED) {
      expect(escapes).toContainEqual({ rule: 'assertion', ...blocked });
    }
  });

  it("exempts from Biome's assertion rule exactly the tests and the blocked files", () => {
    const tests = ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'];
    const blockedFiles = BLOCKED.map((blocked) => fileOf(blocked.where));
    expect(biomeAssertionExemptions().sort()).toEqual(
      [...new Set([...tests, ...blockedFiles])].sort(),
    );
  });

  it.each(['lint', 'lint:check', 'build'])(
    'the root %s runs Biome over every production directory',
    (script) => {
      expect(biomeCheckPaths(script).sort()).toEqual([...directories].sort());
    },
  );
});

describe('the scan refuses each escape, and only those', () => {
  const root = path.join(__dirname, '__fixtures__/typeEscapes');
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
    expect(onDisk).toEqual(REFUSED.map(([name]) => name).sort());
    const rules: EscapeRule[] = [
      'assertion',
      'any',
      '!',
      '@ts-ignore',
      '@ts-expect-error',
      '@ts-nocheck',
      'biome-ignore',
    ];
    expect(new Set(REFUSED.map(([, rule]) => rule))).toEqual(new Set(rules));
  });

  it.each(REFUSED)('refuses %s under %s alone', (name, rule) => {
    const found = scanFile(fixture('refused', name));
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((one) => one.rule))).toEqual(new Set([rule]));
  });

  it('accepts as const, <const>, satisfies, the logical ! and the words in a string', () => {
    expect(scanFile(fixture('clean', 'allowed'))).toEqual([]);
  });
});
