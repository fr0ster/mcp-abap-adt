/**
 * A top-level package, live, on premise: a local package with no super
 * package is created, locked, unlocked and deleted through the tools.
 *
 * SAP's lock of a package (`CL_PAK_ADT_PERSIST->if_wb_object_persist~lock`)
 * reads the package by its name alone, and a create with an empty
 * `<pak:superPackage/>` makes a package at the top of the tree. Measured on
 * premise (2026-11-21): such a create answered 201, its LOCK 200 and its
 * UNLOCK 200, while `HandlerLock` refused the lock before sending anything
 * and `CreatePackage` refused the create.
 *
 * The calls go through `livePrepare`: the keys these paths stand for are
 * pinned and covered live by their family tasks; this file proves a package
 * with no parent on premise. The read is parsed as the package tools parse
 * it, and the teardown releases a lock the case still holds under its handle
 * before the delete, in the suite's own session (`helpers/topLevelPackage.ts`,
 * both covered without SAP by `topLevelPackageCase.test.ts`).
 *
 * On premise only: a local (`$`) package lives on premise, and the cloud has
 * none. The package's name is read free before its create and recorded for
 * cleanup before it; it is deleted after and read absent.
 */
import { randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import {
  releaseThenDelete,
  topLevelReadProblem,
} from '../../helpers/topLevelPackage';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const PACKAGE = `$ZMCPTL${SUFFIX}`;

/** The lock the case holds and has not released: its handle. */
let held: string | undefined;

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The unlock of the package under `handle`. */
function unlock(handle: string): Promise<LiveAnswer> {
  return livePrepare('HandlerLock', {
    action: 'unlock',
    object_type: 'PACKAGE',
    object_name: PACKAGE,
    lock_handle: handle,
  });
}

liveSuite(['onprem'], 'a top-level package', () => {
  before(async () => {
    await expectNameFree({
      tool: 'GetPackage',
      args: { package_name: PACKAGE },
    });
    recordCreated('DeletePackage', { package_name: PACKAGE });
  });

  // In the suite's session, before its runner closes: a lock still held is
  // released first, then the package is deleted.
  after(async () => {
    await releaseThenDelete(held, unlock, deleteRecorded);
    held = undefined;
    await expectAbsent({ tool: 'GetPackage', args: { package_name: PACKAGE } });
  });

  it('is created with no super_package, locked by HandlerLock with its name alone, and unlocked under the handle', async () => {
    succeeded(
      'CreatePackage',
      await livePrepare('CreatePackage', {
        package_name: PACKAGE,
        description: 'MCP top-level package live case',
        package_type: 'development',
        software_component: 'LOCAL',
      }),
    );

    const read = succeeded(
      'GetPackage',
      await livePrepare('GetPackage', {
        package_name: PACKAGE,
        detail: 'raw',
      }),
    );
    const problem = topLevelReadProblem(read.text, PACKAGE);
    if (problem !== undefined) throw new Error(problem);

    const locked = succeeded(
      'HandlerLock',
      await livePrepare('HandlerLock', {
        object_type: 'PACKAGE',
        object_name: PACKAGE,
      }),
    );
    const handle = member(JSON.parse(locked.text), 'lock_handle');
    if (typeof handle !== 'string' || handle === '') {
      throw new Error(`HandlerLock answered no handle: ${locked.text}`);
    }
    held = handle;

    succeeded('HandlerUnlock', await unlock(handle));
    held = undefined;
  });
});
