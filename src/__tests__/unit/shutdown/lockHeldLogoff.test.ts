/**
 * A session holding a lock is closed with a logoff: a lock tool's session, and an update whose `UNLOCK` the
 * stand-in refuses, end their tool with the lock held. At shutdown (core,
 * http per-request and pooled, sse), at an SSE close and at the pool's
 * eviction, the stand-in's log holds that session's logoff after the `LOCK`
 * — the logoff is what releases the lock — before the exit, or before the
 * instance is gone.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { httpStand } from '../../../../server-runtime/src/http/__tests__/shutdown/harness';
import { sseStand } from '../../../../server-runtime/src/sse/__tests__/shutdown/harness';
import { stand as coreStand } from '../../../../server-runtime/src/stdio/__tests__/helpers/loginStand';
import { ownedConnections } from '../../../lib/ownedConnections';
import { isLogoff } from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import { isLockOf, isUnlockOf } from '../../helpers/shutdownTools';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

async function until(done: () => boolean, limitMs = 10_000) {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((r) => setTimeout(r, 2));
  }
}

type Log = Array<{ url: string }>;

/** Whether a logoff follows the `LOCK` of `id` in the log. */
const loggedOffAfterLock = (log: Log, id: string) => {
  const lock = log.findIndex((r) => isLockOf(id)(r.url));
  return lock >= 0 && log.some((r, i) => i > lock && isLogoff(r.url));
};

beforeEach(() => {
  mock.method(console, 'error', () => {});
});

afterEach(() => mock.restoreAll());

it('core, at shutdown: the lock tool and the refused UNLOCK end with the session logged off', async () => {
  const s = await coreStand({ kind: 'onprem', shutdown: {} });
  try {
    s.adt.answer((r) => isUnlockOf('B')(r.url), 500);
    assertMatchObject(await s.callTool('LockOnly', { id: 'A' }), {
      isError: false,
    });
    assertMatchObject(await s.callTool('LockedUpdate', { id: 'B' }), {
      isError: true,
    });
    assert.equal(s.adt.logoffs(), 0);
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    await until(() => s.adt.logoffs() === 1);
    assert.equal(loggedOffAfterLock(s.adt.requests, 'A'), true);
    assert.equal(loggedOffAfterLock(s.adt.requests, 'B'), true);
  } finally {
    await s.close();
  }
});

it("http per-request, at the pool's eviction after the request: logged off before the instance is gone", async () => {
  const s = await httpStand();
  try {
    assert.equal((await s.call('LockOnly', { id: 'A' })).isError, false);
    await until(() => loggedOffAfterLock(s.standIn.requests, 'A'));
    assert.deepStrictEqual(ownedConnections(), []);
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
  } finally {
    await s.close();
  }
});

it('http pooled, at shutdown: the kept instance’s session is logged off after its LOCK', async () => {
  const s = await httpStand();
  try {
    const held = await s.call('HoldState', { id: 'S' });
    s.standIn.answer((r) => isUnlockOf('B')(r.url), 500);
    assert.equal(
      (await s.call('LockedUpdate', { id: 'B', state_handle: held.text }))
        .isError,
      true,
    );
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    await until(() => loggedOffAfterLock(s.standIn.requests, 'B'));
    assert.deepStrictEqual(ownedConnections(), []);
  } finally {
    await s.close();
  }
});

it('sse, at shutdown and at an SSE close', async () => {
  const s = await sseStand();
  try {
    const closing = await s.open();
    const open = await s.open();
    await closing.call('LockOnly', { id: 'C' }, 1);
    await closing.answer(1);
    await open.call('LockOnly', { id: 'O' }, 1);
    await open.answer(1);

    closing.close();
    await until(() => loggedOffAfterLock(s.standIn.requests, 'C'));
    assert.equal(s.standIn.logoffs(), 1);

    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    await until(() => s.standIn.logoffs() === 2);
    assert.equal(loggedOffAfterLock(s.standIn.requests, 'O'), true);
  } finally {
    await s.close();
  }
});
