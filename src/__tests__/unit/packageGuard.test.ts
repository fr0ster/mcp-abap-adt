/**
 * The package guard of the live harness (`helpers/packageGuard.ts`): a live
 * run creates only in a package its configured system kind allows — on
 * premise `$TMP` or ZAC_TEST_PKG, on the cloud exactly ZADT_BLD_PKG03 — and
 * a refusal names the config key and the package. A package created under an
 * allowed parent is checked by its parent. `resolvePackageName`, the path the
 * tester suites pick their package by, applies it before anything is created.
 *
 * The config is a file of this test's own, named by `MCP_TEST_CONFIG` before
 * anything reads it (the harness reads it once per process): a cloud system.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { resolvePackageName } from '../integration/helpers/configHelpers';
import {
  guardedChildPackage,
  guardedPackage,
  packageRefusal,
} from '../integration/helpers/packageGuard';

const CONFIG = `
environment:
  system_type: cloud
  default_package: ZADT_BLD_PKG03
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-guard-'));
const file = path.join(dir, 'test-config.yaml');
fs.writeFileSync(file, CONFIG);
process.env.MCP_TEST_CONFIG = file;

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the package guard', () => {
  it('on premise allows $TMP and ZAC_TEST_PKG, in any case', () => {
    assert.equal(packageRefusal('onprem', 'k', '$TMP'), undefined);
    assert.equal(packageRefusal('onprem', 'k', 'ZAC_TEST_PKG'), undefined);
    assert.equal(packageRefusal('onprem', 'k', 'zac_test_pkg'), undefined);
  });

  it('on premise refuses any other package, naming the key and the package', () => {
    assert.equal(
      packageRefusal('onprem', 'environment.default_package', 'ZMCP_TEST'),
      'the package guard: environment.default_package names ZMCP_TEST, which is none of $TMP, ZAC_TEST_PKG on onprem: nothing is created',
    );
    assert.notEqual(packageRefusal('onprem', 'k', 'ZADT_BLD_PKG03'), undefined);
  });

  it('on the cloud allows exactly ZADT_BLD_PKG03', () => {
    assert.equal(packageRefusal('cloud', 'k', 'ZADT_BLD_PKG03'), undefined);
    assert.equal(
      packageRefusal('cloud', 'k', '$TMP'),
      'the package guard: k names $TMP, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
    );
    assert.notEqual(packageRefusal('cloud', 'k', 'ZAC_TEST_PKG'), undefined);
    assert.notEqual(packageRefusal('cloud', 'k', 'ZADT_BLD_PKG031'), undefined);
  });

  it('on the legacy system allows $TMP alone', () => {
    assert.equal(packageRefusal('legacy', 'k', '$TMP'), undefined);
    assert.notEqual(packageRefusal('legacy', 'k', 'ZAC_TEST_PKG'), undefined);
  });

  it('refuses every package when no system kind is stated', () => {
    assert.equal(
      packageRefusal(undefined, 'k', '$TMP'),
      'the package guard: k names $TMP, and no system kind is stated: nothing is created',
    );
  });

  it('guardedPackage answers an allowed package and throws the refusal for another', () => {
    assert.equal(
      guardedPackage('cloud', 'k', 'ZADT_BLD_PKG03'),
      'ZADT_BLD_PKG03',
    );
    assert.throws(() => guardedPackage('cloud', 'k', 'ZLOCAL'), {
      message:
        'the package guard: k names ZLOCAL, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
    });
  });

  it('a package created under an allowed parent is checked by its parent', () => {
    assert.equal(
      guardedChildPackage(
        'onprem',
        'child',
        'ZMCP_SHARED',
        'parent',
        'ZAC_TEST_PKG',
      ),
      'ZMCP_SHARED',
    );
    assert.equal(
      guardedChildPackage(
        'cloud',
        'child',
        'ZADT_BLD_PKG03',
        'parent',
        undefined,
      ),
      'ZADT_BLD_PKG03',
    );
    assert.throws(
      () =>
        guardedChildPackage(
          'onprem',
          'child',
          'ZMCP_SHARED',
          'parent',
          'ZOTHER',
        ),
      {
        message:
          'the package guard: parent names ZOTHER, which is none of $TMP, ZAC_TEST_PKG on onprem: nothing is created',
      },
    );
    assert.throws(
      () => guardedChildPackage('onprem', 'child', 'ZMCP_SHARED', 'parent', ''),
      {
        message:
          'the package guard: child names ZMCP_SHARED, which is none of $TMP, ZAC_TEST_PKG on onprem: nothing is created',
      },
    );
  });

  it('resolvePackageName answers the allowed default package', () => {
    assert.equal(resolvePackageName(), 'ZADT_BLD_PKG03');
  });

  it("resolvePackageName refuses a case's package the system does not allow, naming its key", () => {
    assert.throws(
      () =>
        resolvePackageName({
          name: 'local_case',
          params: { package_name: '$TMP' },
        }),
      {
        message:
          'the package guard: test_cases[name=local_case].params.package_name names $TMP, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
      },
    );
  });
});
