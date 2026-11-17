/**
 * The package-tree strategy (spec §3.3): exact and prefix entries matched
 * with no read, a subtree entry by walking up the tree through the call's
 * reader, a package create's parent taken from the call, a failed read or a
 * package met twice refused `package_tree_unreadable`; and the strategy a
 * launcher picks for its lists.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { AccessCall } from '../../../lib/access/accessChecks';
import {
  parsePackageEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import {
  accessChecksFor,
  packageTreeAccessChecks,
} from '../../../lib/access/packageTreeAccessChecks';

const NAME = 'test';

/** A reader answering from `parents` (`undefined`: the top), its reads counted. */
function treeReader(parents: Readonly<Record<string, string | undefined>>) {
  const superPackageOf = mock.fn(
    async (name: string): Promise<string | undefined> => {
      if (!(name in parents)) throw new Error(`no package ${name}`);
      return parents[name];
    },
  );
  return { sap: { superPackageOf }, superPackageOf };
}

function packageCall(
  packages: ReadonlyArray<readonly [string, string]>,
  packageCreate = false,
): AccessCall {
  return {
    tool: packageCreate ? 'CreatePackage' : 'CheckPackage',
    dispatch: undefined,
    packages: packages.map(([argument, value]) => ({ argument, value })),
    requests: [],
    tables: [],
    packageCreate,
  };
}

const TREE = {
  ZFOO: 'ZROOT',
  ZCHILD: 'ZFOO',
  ZGRAND: 'ZCHILD',
  ZROOT: undefined,
  YTOP: undefined,
  ZOUTSIDE: 'YROOT',
  YROOT: undefined,
  ZA: 'ZB',
  ZB: 'ZA',
  ZSELF: 'ZSELF',
};

describe('packageTreeAccessChecks', () => {
  const checks = packageTreeAccessChecks({
    allowedPackages: [
      parsePackageEntry('ZBAR', NAME),
      parsePackageEntry('Y*', NAME),
      parsePackageEntry('ZFOO/**', NAME),
    ],
  });

  it('matches exact and prefix entries with no read', async () => {
    const { sap, superPackageOf } = treeReader(TREE);
    for (const value of ['ZBAR', 'YANY']) {
      assert.deepEqual(
        await checks.check(packageCall([['package_name', value]]), sap),
        { allowed: true },
      );
    }
    assert.equal(superPackageOf.mock.callCount(), 0);
  });

  const walks: ReadonlyArray<readonly [string, boolean, number]> = [
    ['ZFOO', true, 0],
    ['ZCHILD', true, 1],
    ['ZGRAND', true, 2],
  ];
  for (const [value, allowed, reads] of walks) {
    it(`${value}: ${allowed ? 'allowed' : 'refused'} after ${reads} read(s)`, async () => {
      const { sap, superPackageOf } = treeReader(TREE);
      const verdict = await checks.check(
        packageCall([['package_name', value]]),
        sap,
      );
      assert.equal(verdict.allowed, allowed);
      assert.equal(superPackageOf.mock.callCount(), reads);
    });
  }

  it('refuses a package at the top of another tree', async () => {
    const strict = packageTreeAccessChecks({
      allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
    });
    const { sap } = treeReader(TREE);
    assert.deepEqual(
      await strict.check(packageCall([['package_name', 'YTOP']]), sap),
      {
        allowed: false,
        code: 'package_not_allowed',
        argument: 'package_name',
        value: 'YTOP',
      },
    );
  });

  it('takes a package create’s parent from the call, never reading the new package', async () => {
    const { sap, superPackageOf } = treeReader(TREE);
    const verdict = await checks.check(
      packageCall(
        [
          ['package_name', 'ZNEW'],
          ['super_package', 'ZFOO'],
        ],
        true,
      ),
      sap,
    );
    assert.deepEqual(verdict, { allowed: true });
    assert.equal(
      superPackageOf.mock.calls.some((each) => each.arguments[0] === 'ZNEW'),
      false,
    );
  });

  it('reads package_name of any other call: CheckPackage outside the subtree is refused', async () => {
    const { sap, superPackageOf } = treeReader(TREE);
    const strict = packageTreeAccessChecks({
      allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
    });
    assert.deepEqual(
      await strict.check(
        packageCall([
          ['package_name', 'ZOUTSIDE'],
          ['super_package', 'ZFOO'],
        ]),
        sap,
      ),
      {
        allowed: false,
        code: 'package_not_allowed',
        argument: 'package_name',
        value: 'ZOUTSIDE',
      },
    );
    assert.equal(superPackageOf.mock.calls[0]?.arguments[0], 'ZOUTSIDE');
  });

  for (const [what, value, tree] of [
    ['a failed read', 'ZMISSING', TREE],
    ['a cycle', 'ZA', TREE],
    ['a package that is its own parent', 'ZSELF', TREE],
  ] as const) {
    it(`refuses ${what} package_tree_unreadable`, async () => {
      const { sap } = treeReader(tree);
      assert.deepEqual(
        await checks.check(packageCall([['package_name', value]]), sap),
        {
          allowed: false,
          code: 'package_tree_unreadable',
          argument: 'package_name',
          value,
        },
      );
    });
  }
});

describe('accessChecksFor', () => {
  it('gives no strategy without a call-time list', () => {
    assert.equal(accessChecksFor({}), undefined);
  });

  it('gives the simple strategy for name and prefix entries: it reads nothing', async () => {
    const checks = accessChecksFor({
      allowedPackages: [parsePackageEntry('Z*', NAME)],
    });
    assert.ok(checks !== undefined);
    const { sap, superPackageOf } = treeReader(TREE);
    assert.equal(
      (await checks.check(packageCall([['package_name', 'YTOP']]), sap))
        .allowed,
      false,
    );
    assert.equal(superPackageOf.mock.callCount(), 0);
  });

  it('gives the tree strategy for a subtree entry: it reads the tree', async () => {
    const checks = accessChecksFor({
      allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
    });
    assert.ok(checks !== undefined);
    const { sap, superPackageOf } = treeReader(TREE);
    assert.equal(
      (await checks.check(packageCall([['package_name', 'ZCHILD']]), sap))
        .allowed,
      true,
    );
    assert.equal(superPackageOf.mock.callCount(), 1);
  });

  it('gives a strategy for a table list alone', async () => {
    const checks = accessChecksFor({
      deniedTables: [parseTableEntry('MARA', NAME)],
    });
    assert.ok(checks !== undefined);
    const { sap } = treeReader(TREE);
    const verdict = await checks.check(
      {
        tool: 'GetTableContents',
        dispatch: undefined,
        packages: [],
        requests: [],
        tables: [{ argument: 'table_name', value: 'MARA' }],
        packageCreate: false,
      },
      sap,
    );
    assert.equal(verdict.allowed, false);
  });
});
