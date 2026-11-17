/**
 * The simple strategy (spec §3.3): each list matched by name and prefix,
 * nothing read from SAP, a subtree entry refused at construction; and the
 * refusal words.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type {
  AccessCall,
  IPackageReader,
} from '../../../lib/access/accessChecks';
import type { AccessLists } from '../../../lib/access/accessLists';
import {
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import {
  listedAccessChecks,
  refusalOf,
} from '../../../lib/access/listedAccessChecks';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import { ParameterRefusal } from '../../../lib/config/authParameters';

const NAME = 'test';

function call(given: Partial<AccessCall>): AccessCall {
  return {
    tool: 'CreateClass',
    dispatch: undefined,
    packages: [],
    requests: [],
    tables: [],
    packageCreate: false,
    ...given,
  };
}

function reader() {
  const superPackageOf = mock.fn(async (_name: string): Promise<string> => {
    throw new Error('the simple strategy reads nothing');
  });
  const sap: IPackageReader = { superPackageOf };
  return { sap, superPackageOf };
}

describe('listedAccessChecks', () => {
  it('matches allowed packages by name and prefix', async () => {
    const lists: AccessLists = {
      allowedPackages: [
        parsePackageEntry('ZFOO', NAME),
        parsePackageEntry('Z*', NAME),
      ],
    };
    const { sap, superPackageOf } = reader();
    const checks = listedAccessChecks(lists);
    for (const value of ['ZFOO', 'ZBAR']) {
      assert.deepEqual(
        await checks.check(
          call({ packages: [{ argument: 'package_name', value }] }),
          sap,
        ),
        { allowed: true },
      );
    }
    assert.deepEqual(
      await checks.check(
        call({ packages: [{ argument: 'package_name', value: 'YFOO' }] }),
        sap,
      ),
      {
        allowed: false,
        code: 'package_not_allowed',
        argument: 'package_name',
        value: 'YFOO',
      },
    );
    assert.equal(superPackageOf.mock.callCount(), 0);
  });

  it('matches allowed requests', async () => {
    const checks = listedAccessChecks({
      allowedRequests: [parseRequestEntry('A4HK*', NAME)],
    });
    const { sap } = reader();
    assert.deepEqual(
      await checks.check(
        call({
          requests: [{ argument: 'transport_request', value: 'A4HK900123' }],
        }),
        sap,
      ),
      { allowed: true },
    );
    assert.deepEqual(
      await checks.check(
        call({ requests: [{ argument: 'transport_request', value: 'B4HK1' }] }),
        sap,
      ),
      {
        allowed: false,
        code: 'request_not_allowed',
        argument: 'transport_request',
        value: 'B4HK1',
      },
    );
  });

  it('matches denied and allowed tables', async () => {
    const { sap } = reader();
    const denied = listedAccessChecks({
      deniedTables: [parseTableEntry('MARA', NAME)],
    });
    const tableCall = (value: string) =>
      call({ tables: [{ argument: 'table_name', value }] });
    assert.deepEqual(await denied.check(tableCall('MARA'), sap), {
      allowed: false,
      code: 'table_not_allowed',
      argument: 'table_name',
      value: 'MARA',
    });
    assert.deepEqual(await denied.check(tableCall('MARC'), sap), {
      allowed: true,
    });
    const allowed = listedAccessChecks({
      allowedTables: [parseTableEntry('ZT*', NAME)],
    });
    assert.equal((await allowed.check(tableCall('MARA'), sap)).allowed, false);
    assert.equal((await allowed.check(tableCall('ZTAB'), sap)).allowed, true);
  });

  // The table argument goes into `SELECT * FROM <table>`: with a table list
  // configured, a value that is not one table name — an alias, a join, a list
  // — would read a table the list does not admit.
  it('refuses a table argument that is not one table name while a table list is configured', async () => {
    const { sap } = reader();
    const tableCall = (value: string) =>
      call({ tables: [{ argument: 'table_name', value }] });
    const denied = listedAccessChecks({
      deniedTables: [parseTableEntry('SCARR', NAME)],
    });
    const allowed = listedAccessChecks({
      allowedTables: [parseTableEntry('ZT*', NAME)],
    });
    for (const value of [
      'SCARR AS S',
      'SFLIGHT INNER JOIN SCARR ON SFLIGHT~CARRID = SCARR~CARRID',
      'SFLIGHT, SCARR',
    ]) {
      assert.deepEqual(await denied.check(tableCall(value), sap), {
        allowed: false,
        code: 'table_not_allowed',
        argument: 'table_name',
        value,
      });
    }
    const join = 'ZTAB INNER JOIN MARA ON ZTAB~K = MARA~K';
    assert.deepEqual(await allowed.check(tableCall(join), sap), {
      allowed: false,
      code: 'table_not_allowed',
      argument: 'table_name',
      value: join,
    });
    assert.equal(
      (await denied.check(tableCall('/ABC/ZTAB'), sap)).allowed,
      true,
    );
    assert.equal(
      (await allowed.check(tableCall('ZT/ABC/X$'), sap)).allowed,
      true,
    );
  });

  it('checks each name against its own list', async () => {
    const checks = listedAccessChecks({
      allowedPackages: [parsePackageEntry('Z*', NAME)],
      allowedRequests: [parseRequestEntry('A4HK*', NAME)],
    });
    const { sap } = reader();
    const verdict = await checks.check(
      call({
        packages: [{ argument: 'package_name', value: 'ZFOO' }],
        requests: [{ argument: 'transport_request', value: 'B4HK1' }],
      }),
      sap,
    );
    assert.equal(
      verdict.allowed ? undefined : verdict.code,
      'request_not_allowed',
    );
  });

  it('refuses a subtree entry at construction', () => {
    assert.throws(
      () =>
        listedAccessChecks({
          allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
        }),
      (error: unknown) =>
        error instanceof ParameterRefusal &&
        error.words ===
          'allowed-packages: a subtree entry needs the package tree strategy: ZFOO/**',
    );
  });
});

describe('refusalOf', () => {
  const cases = [
    [
      'package_not_allowed',
      'package_name names a package outside the allowed packages: YFOO',
    ],
    [
      'package_tree_unreadable',
      'the package tree above YFOO could not be read, so package_name is not checked against the allowed packages',
    ],
    [
      'request_not_allowed',
      'package_name names a request outside the allowed requests: YFOO',
    ],
    [
      'table_not_allowed',
      'the data of YFOO is not readable through this server',
    ],
  ] as const;
  for (const [code, words] of cases) {
    it(`words ${code}`, () => {
      const refusal = refusalOf({
        allowed: false,
        code,
        argument: 'package_name',
        value: 'YFOO',
      });
      assert.deepEqual(serverRefusalOf(refusal), { code, words });
    });
  }
});
