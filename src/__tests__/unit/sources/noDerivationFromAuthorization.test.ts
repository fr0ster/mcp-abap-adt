/**
 * Nothing is derived from the authorization (the owner's rule): the system
 * kind comes only from what the consumer states, never from the credential
 * type, the token or its claims. The scan
 * (`helpers/authorizationDerivationScan.ts`) runs on the TypeScript program
 * with its type checker over every package's production `src`, `scripts` and
 * `tools`, and over every test-helper tree (each `helpers` directory under a
 * `__tests__` directory): no kind value is produced from a credential read,
 * there or in a test helper; no production code decodes a token. No
 * allowlist: a finding is fixed in the code.
 *
 * The check covers kind inference and production token decoding only. The
 * credential plumbing that reads which credential the consumer supplied —
 * the provider for the stated `authType`, the login header of a basic
 * destination, the configuration summary — derives no kind and is not
 * refused. The realm check's `exp` read is a test helper: outside the
 * decoding ban, inside the kind check.
 *
 * Its limit, stated: a credential read reaching a kind through another
 * module, or through an untyped value, is beyond this check and left to
 * review.
 *
 * Each fixture under `__fixtures__/kindFromCredential/refused` is refused by
 * its own form alone; each under `clean` passes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createDerivationProgram,
  type Derivation,
  type DerivationForm,
  type DerivationRule,
  productionSources,
  scanDerivations,
  testHelperDirectories,
  testHelperSources,
} from './helpers/authorizationDerivationScan';
import { REPO, rel } from './helpers/failureScan';

jest.setTimeout(300_000);

describe('production and the test helpers', () => {
  const production = productionSources();
  const helpers = testHelperSources();
  const files = [...production, ...helpers];
  const program = createDerivationProgram(files);
  const findings = scanDerivations(program, files, new Set(production));

  it('scans every test-helper tree, found by walking the packages', () => {
    expect(testHelperDirectories()).toEqual(
      expect.arrayContaining([
        'src/__tests__/helpers',
        'src/__tests__/integration/helpers',
        'server-runtime/src/stdio/__tests__/helpers',
      ]),
    );
    const scanned = files.map(rel);
    expect(scanned).toContain('src/lib/utils.ts');
    expect(scanned).toContain('server-runtime/src/stdio/launcher.ts');
    expect(scanned).toContain(
      'src/__tests__/integration/helpers/realmCheck.ts',
    );
    expect(scanned).toContain(
      'server-runtime/src/stdio/__tests__/helpers/loginStand.ts',
    );
    expect(scanned.some((file) => file.startsWith('tools/'))).toBe(true);
  });

  it('derives no kind from a credential and decodes no token', () => {
    expect(findings).toEqual([]);
  });
});

describe('the scan refuses each form, and only those', () => {
  const root = path.join(__dirname, '__fixtures__', 'kindFromCredential');
  const refusedDir = path.join(root, 'refused');
  const cleanDir = path.join(root, 'clean');
  const refused = fs
    .readdirSync(refusedDir)
    .map((name) => path.join(refusedDir, name));
  const clean = fs
    .readdirSync(cleanDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(cleanDir, entry.name));
  const realmExp = path.join(cleanDir, 'helpers', 'realmExp.ts');
  const statedSystemKind = path.join(REPO, 'src', 'lib', 'systemKind.ts');
  const files = [...refused, ...clean, realmExp, statedSystemKind];
  const program = createDerivationProgram(files);
  const asProduction = new Set([...refused, ...clean, statedSystemKind]);
  const of = (file: string, findings: readonly Derivation[]) =>
    findings
      .filter((found) => found.where.startsWith(`${rel(file)}:`))
      .map((found) => ({ form: found.form, rule: found.rule }));
  const findings = scanDerivations(program, files, asProduction);

  const expected: Record<
    string,
    ReadonlyArray<{ form: DerivationForm; rule: DerivationRule }>
  > = {
    assignment: [{ form: 'assignment', rule: 'kind' }],
    property: [{ form: 'property', rule: 'credential-boolean' }],
    argument: [{ form: 'argument', rule: 'kind' }],
    inlineCall: [{ form: 'argument', rule: 'kind' }],
    return: [{ form: 'return', rule: 'credential-boolean' }],
    cloudFlag: [{ form: 'assignment', rule: 'kind' }],
    comparison: [{ form: 'comparison', rule: 'kind' }],
    decode: [
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
    ],
  };

  it('has a fixture for every refused form, each with its expectation', () => {
    expect(refused.map((file) => path.basename(file, '.ts')).sort()).toEqual(
      Object.keys(expected).sort(),
    );
  });

  it.each(refused.map((file) => [path.basename(file, '.ts'), file]))(
    'refuses %s by its own form alone',
    (name, file) => {
      expect(of(file, findings)).toEqual(expected[name]);
    },
  );

  it.each(clean.map((file) => [path.basename(file, '.ts'), file]))(
    'accepts %s',
    (_name, file) => {
      expect(of(file, findings)).toEqual([]);
    },
  );

  it('accepts the explicit-kind resolver, statedSystemKind, unchanged', () => {
    expect(of(statedSystemKind, findings)).toEqual([]);
  });

  it("accepts the realm check's exp read as a test helper, and refuses it as production", () => {
    expect(of(realmExp, findings)).toEqual([]);
    const asProductionFindings = scanDerivations(
      program,
      [realmExp],
      new Set([realmExp]),
    );
    expect(of(realmExp, asProductionFindings)).toEqual([
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
    ]);
  });
});
