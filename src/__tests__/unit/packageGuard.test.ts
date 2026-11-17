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
  PackageGuardRefusal,
  packageOnSystemOf,
  packageRefusal,
} from '../integration/helpers/packageGuard';
import { LambdaTester } from '../integration/helpers/testers/LambdaTester';

/** A tester whose package is the default one, as a suite that reads its package_name. */
class PackageReading extends LambdaTester {
  protected override creationPackage(): string {
    return resolvePackageName();
  }
  get packageName(): string | undefined {
    return this.context?.packageName;
  }
}

const CONFIG = `
environment:
  system_type: cloud
  default_package: ZADT_BLD_PKG03
  integration_hard_mode:
    enabled: true
create_class:
  test_cases:
    - name: local_case
      params:
        class_name: ZCL_GUARD_CASE
        package_name: $TMP
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-guard-'));
const file = path.join(dir, 'test-config.yaml');
fs.writeFileSync(file, CONFIG);
process.env.MCP_TEST_CONFIG = file;

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** SAP's wire answer of a status, nothing else in it. */
const wire = (status: number) => ({
  status,
  statusText: '',
  headers: {},
  data: '',
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

  it('a package still to be created is checked by the configured parent it is created under', () => {
    const absent = { exists: false } as const;
    assert.equal(
      guardedChildPackage(
        'onprem',
        'child',
        'ZMCP_SHARED',
        absent,
        'parent',
        'ZAC_TEST_PKG',
      ),
      'ZMCP_SHARED',
    );
    assert.throws(
      () =>
        guardedChildPackage(
          'onprem',
          'child',
          'ZMCP_SHARED',
          absent,
          'parent',
          'ZOTHER',
        ),
      {
        message:
          'the package guard: parent names ZOTHER, which is none of $TMP, ZAC_TEST_PKG on onprem: nothing is created',
      },
    );
    assert.throws(
      () =>
        guardedChildPackage(
          'onprem',
          'child',
          'ZMCP_SHARED',
          absent,
          'parent',
          '',
        ),
      {
        message:
          'the package guard: child names ZMCP_SHARED, which is none of $TMP, ZAC_TEST_PKG on onprem: nothing is created',
      },
    );
  });

  it('an allowed package is allowed whatever SAP reads of it', () => {
    assert.equal(
      guardedChildPackage(
        'cloud',
        'child',
        'ZADT_BLD_PKG03',
        { exists: true, superPackage: 'ZANYTHING' },
        'parent',
        undefined,
      ),
      'ZADT_BLD_PKG03',
    );
  });

  it('an existing package is checked by the super package SAP reads, never by the configured parent', () => {
    assert.equal(
      guardedChildPackage(
        'cloud',
        'child',
        'ZMCP_SHR_PKG',
        { exists: true, superPackage: 'ZADT_BLD_PKG03' },
        'parent',
        '',
      ),
      'ZMCP_SHR_PKG',
    );
    assert.throws(
      () =>
        guardedChildPackage(
          'cloud',
          'child',
          'ZFOREIGN',
          { exists: true, superPackage: 'ZELSEWHERE' },
          'parent',
          'ZADT_BLD_PKG03',
        ),
      {
        message:
          'the package guard: the super package SAP reads for child (ZFOREIGN) names ZELSEWHERE, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
      },
    );
    assert.throws(
      () =>
        guardedChildPackage(
          'cloud',
          'child',
          'ZFOREIGN',
          { exists: true, superPackage: undefined },
          'parent',
          'ZADT_BLD_PKG03',
        ),
      {
        message:
          'the package guard: child names ZFOREIGN, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
      },
    );
  });

  it('a package read only a confirmed not-found counts as absent; it is then checked by its configured parent', () => {
    const absent404 = packageOnSystemOf('child', 'ZMCP_SHR_PKG', {
      ok: false,
      error: {
        origin: 'refusal',
        message: 'not found',
        response: wire(404),
      },
    });
    assert.deepEqual(absent404, { exists: false });
    assert.deepEqual(
      packageOnSystemOf('child', 'ZMCP_SHR_PKG', {
        ok: false,
        error: {
          origin: 'refusal',
          message: 'gone',
          code: 'ADT_OBJECT_NOT_FOUND',
        },
      }),
      { exists: false },
    );
    assert.equal(
      guardedChildPackage(
        'cloud',
        'child',
        'ZMCP_SHR_PKG',
        absent404,
        'parent',
        'ZADT_BLD_PKG03',
      ),
      'ZMCP_SHR_PKG',
    );
  });

  it('an existing package whose read fails otherwise is refused, though its configured parent is allowed', () => {
    const refusedRead = () =>
      guardedChildPackage(
        'cloud',
        'shared_dependencies.package',
        'ZFOREIGN',
        packageOnSystemOf('shared_dependencies.package', 'ZFOREIGN', {
          ok: false,
          error: {
            origin: 'refusal',
            message: 'no authority',
            response: wire(403),
          },
        }),
        'shared_dependencies.super_package',
        'ZADT_BLD_PKG03',
      );
    assert.throws(refusedRead, (error: unknown) => {
      assert.ok(error instanceof PackageGuardRefusal);
      assert.equal(
        error.message,
        'the package guard: shared_dependencies.package names ZFOREIGN, which SAP did not read (status 403: no authority): its super package is unknown, nothing is created in it',
      );
      return true;
    });
    assert.throws(
      () =>
        packageOnSystemOf('k', 'ZFOREIGN', {
          ok: false,
          error: { origin: 'connection', message: 'socket hang up' },
        }),
      {
        message:
          'the package guard: k names ZFOREIGN, which SAP did not read (origin connection: socket hang up): its super package is unknown, nothing is created in it',
      },
    );
  });

  it('a package read answers the super package its document names', () => {
    assert.deepEqual(
      packageOnSystemOf('k', 'ZMCP_SHR_PKG', {
        ok: true,
        document:
          '<pak:package xmlns:pak="http://www.sap.com/adt/packages" adtcore:name="ZMCP_SHR_PKG" xmlns:adtcore="http://www.sap.com/adt/core"><pak:superPackage adtcore:name="ZADT_BLD_PKG03"/></pak:package>',
      }),
      { exists: true, superPackage: 'ZADT_BLD_PKG03' },
    );
  });

  it('resolvePackageName answers the allowed default package', () => {
    assert.equal(resolvePackageName(), 'ZADT_BLD_PKG03');
  });

  it("a tester whose case's package the guard refuses fails to start: no skip", async () => {
    const tester = new LambdaTester('create_class', 'local_case', 'guard-test');
    await assert.rejects(tester.init(), (error: unknown) => {
      assert.ok(error instanceof PackageGuardRefusal);
      assert.equal(
        error.message,
        'the package guard: test_cases[name=local_case].params.package_name names $TMP, which is none of ZADT_BLD_PKG03 on cloud: nothing is created',
      );
      return true;
    });
  });

  it("a tester reading its case's package_name takes the guarded default package", async () => {
    const tester = new PackageReading(
      'create_class',
      'local_case',
      'guard-test',
    );
    await tester.init();
    assert.equal(tester.packageName, 'ZADT_BLD_PKG03');
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
