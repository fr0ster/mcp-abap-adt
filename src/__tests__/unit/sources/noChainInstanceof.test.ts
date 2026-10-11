/**
 * D14 / §9: a failure is read by structure through auth-errors — never by
 * `instanceof` of a chain class, never through a thrown value's `message`,
 * `stack`, `cause` or `name`, and a thrown value never goes whole into a log
 * line or a string. The scan (`helpers/failureScan.ts`) runs on the
 * TypeScript program with its type checker: what a name resolves to, never
 * what it is called.
 *
 * - `instanceof` of a chain class: every package's `src` (lib, core, http,
 *   sse).
 * - a thrown value's use: core, http and sse whole, and lib's auth, HTTP
 *   transport and embeddable server. lib's handlers and their libraries carry
 *   ADT errors, whose text is the tool's data (D27); how they convert a
 *   refusal is the D45 audit's (C7), with its own list.
 *
 * The scan's own rules are load-bearing: each fixture under
 * `__fixtures__/failureScan/refused` is one way past a name-based scan and
 * must be reported; each under `clean` must not.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createProgram,
  type Finding,
  REPO,
  rel,
  scanProgram,
  tsFiles,
} from './helpers/failureScan';

const PACKAGES = ['src', 'server/src', 'http/src', 'sse/src'];
const THROWN_SCOPE = [
  'src/lib/auth',
  'src/lib/httpTransport',
  'src/embeddable',
  'server/src',
  'http/src',
  'sse/src',
];

/**
 * The exact findings allowed, each with its reason. Main's instance pool,
 * carried as it is (ruling 16), quotes the held state's undo words in its
 * shutdown report; A10 removes both (the report reads `failureOf(e)?.message
 * ?? errorClassOf(e)`), and this list is then empty.
 */
const ALLOWED: ReadonlyArray<{ where: string; text: string; why: string }> = [
  {
    where: 'http/src/InstancePool.ts',
    text: 'e.message',
    why: "the held state's undo words in the pool's shutdown report (A10)",
  },
  {
    where: 'http/src/InstancePool.ts',
    text: 'String(e)',
    why: "the held state's undo words in the pool's shutdown report (A10)",
  },
];

const isAllowed = (finding: Finding) =>
  ALLOWED.some(
    (allowed) =>
      finding.where.startsWith(`${allowed.where}:`) &&
      finding.text === allowed.text,
  );

describe('the sources (D14, §9)', () => {
  const files = PACKAGES.flatMap((dir) => tsFiles(path.join(REPO, dir)));
  const inScope = (scope: readonly string[]) =>
    new Set(
      files.filter((file) =>
        scope.some((dir) => rel(file).startsWith(`${dir}/`)),
      ),
    );
  const all = new Set(files);
  const findings = scanProgram(createProgram(files), all, {
    instanceof: all,
    thrown: inScope(THROWN_SCOPE),
  });

  it('scans every package, the launcher included', () => {
    for (const dir of PACKAGES) {
      expect(files.some((f) => rel(f).startsWith(`${dir}/`))).toBe(true);
    }
    expect(files.map(rel)).toContain('server/src/launcher.ts');
  });

  it('finds nothing but the listed exceptions', () => {
    expect(findings.filter((f) => !isAllowed(f))).toEqual([]);
  });

  it('every listed exception is still found (a stale entry fails)', () => {
    for (const allowed of ALLOWED) {
      expect(
        findings.some(
          (f) =>
            f.where.startsWith(`${allowed.where}:`) && f.text === allowed.text,
        ),
      ).toBe(true);
    }
  });
});

describe('the scan refuses every way past it, and only those', () => {
  const root = path.join(__dirname, '__fixtures__/failureScan');
  const refused = fs
    .readdirSync(path.join(root, 'refused'))
    .map((name) => path.join(root, 'refused', name));
  const clean = fs
    .readdirSync(path.join(root, 'clean'))
    .map((name) => path.join(root, 'clean', name));
  const fixtures = new Set([...refused, ...clean]);
  const findings = scanProgram(createProgram([...fixtures]), fixtures, {
    instanceof: fixtures,
    thrown: fixtures,
  });
  const of = (file: string) =>
    findings.filter((f) => f.where.startsWith(`${rel(file)}:`));

  it('has fixtures of both kinds', () => {
    expect(refused.length).toBeGreaterThanOrEqual(20);
    expect(clean.length).toBeGreaterThanOrEqual(3);
  });

  it.each(refused.map((file) => [path.basename(file, '.ts'), file]))(
    'refuses %s',
    (name, file) => {
      const rule = name.startsWith('instanceof') ? 'instanceof' : 'thrown';
      expect(of(file).map((f) => f.rule)).toContain(rule);
    },
  );

  it.each(clean.map((file) => [path.basename(file, '.ts'), file]))(
    'accepts %s',
    (_name, file) => {
      expect(of(file)).toEqual([]);
    },
  );
});
