/**
 * Production code is checked by the compiler, not by the author's word: no
 * type assertion but `as const`, no `any`, no non-null or definite-assignment
 * `!`, no `@ts-expect-error`, `@ts-expect-error` or `biome-ignore`. The scan
 * (`helpers/typeEscapeScan.ts`) reads the syntax tree of every production
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
 * it) and adt-clients and connection follow, published first, these go.
 */
const BLOCKED: ReadonlyArray<{ where: string; text: string }> = [
  {
    where: 'src/lib/batch/phases.ts:173',
    text: 'correcting.record(request) as Promise<IAdtWireResponse<T, D>>',
  },
  {
    where: 'src/lib/batch/phases.ts:176',
    text: 'record(request) as Promise<IAdtWireResponse<T, D>>',
  },
  {
    where: 'src/handlers/system/readonly/handleRuntimeListFeeds.ts:535',
    text: 'ask(request) as Promise<IAdtWireResponse<T, D>>',
  },
];

const isBlocked = (found: Escape) =>
  found.rule === 'assertion' &&
  BLOCKED.some(
    (blocked) => blocked.where === found.where && blocked.text === found.text,
  );

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
