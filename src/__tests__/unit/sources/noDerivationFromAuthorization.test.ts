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

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  CREDENTIAL_DECLARATIONS,
  createDerivationProgram,
  type Derivation,
  type DerivationForm,
  type DerivationRule,
  declaredAuthorization,
  productionSources,
  scanDerivations,
  testHelperDirectories,
  testHelperSources,
} from './helpers/authorizationDerivationScan';
import { REPO, rel } from './helpers/failureScan';

describe('production and the test helpers', () => {
  const production = productionSources();
  const helpers = testHelperSources();
  const files = [...production, ...helpers];
  const program = createDerivationProgram(files);
  const findings = scanDerivations(program, files, new Set(production));

  it('scans every test-helper tree, found by walking the packages', () => {
    const directories = testHelperDirectories();
    assert.deepEqual(
      [
        'src/__tests__/helpers',
        'src/__tests__/integration/helpers',
        'server-runtime/src/stdio/__tests__/helpers',
      ].filter((dir) => !directories.includes(dir)),
      [],
    );
    const scanned = files.map(rel);
    assert.deepEqual(
      [
        'src/lib/utils.ts',
        'server-runtime/src/stdio/launcher.ts',
        'src/__tests__/integration/helpers/realmCheck.ts',
        'server-runtime/src/stdio/__tests__/helpers/loginStand.ts',
        'compact/tools/generate-docs.js',
      ].filter((file) => !scanned.includes(file)),
      [],
    );
    assert.equal(
      scanned.some((file) => file.startsWith('tools/')),
      true,
    );
  });

  it('reads every authorization field of the config types, the settings left out', () => {
    for (const [owner, settings] of CREDENTIAL_DECLARATIONS) {
      const declared = declaredAuthorization(program, owner);
      // Every setting left out is a member the type declares: none is stale.
      assert.deepEqual(
        { owner, settings: declared.settings },
        { owner, settings: [...settings].sort() },
      );
      assert.deepEqual(
        { owner, read: declared.authorization.length > 0 },
        { owner, read: true },
      );
    }
    assert.deepEqual(
      declaredAuthorization(program, 'ISapConfigBase').authorization,
      [
        'authType',
        'certKeyPath',
        'certPassphrase',
        'certPath',
        'certPfxPath',
        'jwtToken',
        'kerberosService',
        'kerberosSpn',
        'password',
        'refreshToken',
        'sessionCookies',
        'sncLib',
        'sncMyName',
        'sncPartnerName',
        'sncQop',
        'uaaClientId',
        'uaaClientSecret',
        'uaaUrl',
      ],
    );
  });

  it('derives no kind from a credential and decodes no token', () => {
    assert.deepEqual(findings, []);
  });
});

describe('the scan refuses each form, and only those', () => {
  const root = path.join(
    REPO,
    'src',
    '__tests__',
    'unit',
    'sources',
    '__fixtures__',
    'kindFromCredential',
  );
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
    cloudFlag: [
      { form: 'assignment', rule: 'kind' },
      { form: 'assignment', rule: 'credential-boolean' },
    ],
    comparison: [{ form: 'comparison', rule: 'kind' }],
    ifReturn: [{ form: 'return', rule: 'kind' }],
    switchReturn: [
      { form: 'return', rule: 'kind' },
      { form: 'return', rule: 'kind' },
    ],
    ifAssign: [{ form: 'assignment', rule: 'kind' }],
    presenceUndefined: [{ form: 'return', rule: 'credential-boolean' }],
    doubleNot: [{ form: 'return', rule: 'credential-boolean' }],
    booleanCall: [{ form: 'return', rule: 'credential-boolean' }],
    includes: [{ form: 'return', rule: 'credential-boolean' }],
    inOperator: [{ form: 'return', rule: 'credential-boolean' }],
    uaaUrl: [{ form: 'return', rule: 'kind' }],
    decode: [
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
    ],
  };

  it('has a fixture for every refused form, each with its expectation', () => {
    assert.deepEqual(
      refused.map((file) => path.basename(file, '.ts')).sort(),
      Object.keys(expected).sort(),
    );
  });

  for (const file of refused) {
    const name = path.basename(file, '.ts');
    it(`refuses ${name} by its own form alone`, () => {
      assert.deepEqual(of(file, findings), expected[name]);
    });
  }

  for (const file of clean) {
    it(`accepts ${path.basename(file, '.ts')}`, () => {
      assert.deepEqual(of(file, findings), []);
    });
  }

  it('accepts the explicit-kind resolver, statedSystemKind, unchanged', () => {
    assert.deepEqual(of(statedSystemKind, findings), []);
  });

  it("accepts the realm check's exp read as a test helper, and refuses it as production", () => {
    assert.deepEqual(of(realmExp, findings), []);
    const asProductionFindings = scanDerivations(
      program,
      [realmExp],
      new Set([realmExp]),
    );
    assert.deepEqual(of(realmExp, asProductionFindings), [
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
      { form: 'decode', rule: 'decode' },
    ]);
  });
});
