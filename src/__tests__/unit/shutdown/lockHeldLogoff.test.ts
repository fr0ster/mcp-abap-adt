/**
 * A session holding a lock is closed with a logoff (spec §14.4 item 4,
 * §6.4, D55): a lock tool's session, and an update whose `UNLOCK` the
 * stand-in refuses, end their tool with the lock held. At shutdown (core,
 * http per-request and pooled, sse), at an SSE close and at the pool's
 * eviction, the stand-in's log holds that session's logoff after the `LOCK`
 * — the logoff is what releases the lock — before the exit, or before the
 * instance is gone.
 */

import { httpStand } from '../../../../http/src/__tests__/shutdown/harness';
import { stand as coreStand } from '../../../../server/src/__tests__/helpers/loginStand';
import { sseStand } from '../../../../sse/src/__tests__/shutdown/harness';
import { ownedConnections } from '../../../lib/ownedConnections';
import { isLogoff } from '../../helpers/adtStandIn';
import { isLockOf, isUnlockOf } from '../../helpers/shutdownTools';

jest.setTimeout(30_000);

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
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it('core, at shutdown: the lock tool and the refused UNLOCK end with the session logged off', async () => {
  const s = await coreStand({ shutdown: {} });
  try {
    s.adt.answer((r) => isUnlockOf('B')(r.url), 500);
    expect(await s.callTool('LockOnly', { id: 'A' })).toMatchObject({
      isError: false,
    });
    expect(await s.callTool('LockedUpdate', { id: 'B' })).toMatchObject({
      isError: true,
    });
    expect(s.adt.logoffs()).toBe(0);
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    await until(() => s.adt.logoffs() === 1);
    expect(loggedOffAfterLock(s.adt.requests, 'A')).toBe(true);
    expect(loggedOffAfterLock(s.adt.requests, 'B')).toBe(true);
  } finally {
    await s.close();
  }
});

it("http per-request, at the pool's eviction after the request: logged off before the instance is gone", async () => {
  const s = await httpStand();
  try {
    expect((await s.call('LockOnly', { id: 'A' })).isError).toBe(false);
    await until(() => loggedOffAfterLock(s.standIn.requests, 'A'));
    expect(ownedConnections()).toEqual([]);
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
  } finally {
    await s.close();
  }
});

it('http pooled, at shutdown: the kept instance’s session is logged off after its LOCK', async () => {
  const s = await httpStand();
  try {
    const held = await s.call('HoldState', { id: 'S' });
    s.standIn.answer((r) => isUnlockOf('B')(r.url), 500);
    expect(
      (await s.call('LockedUpdate', { id: 'B', state_handle: held.text }))
        .isError,
    ).toBe(true);
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    await until(() => loggedOffAfterLock(s.standIn.requests, 'B'));
    expect(ownedConnections()).toEqual([]);
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
    expect(s.standIn.logoffs()).toBe(1);

    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    await until(() => s.standIn.logoffs() === 2);
    expect(loggedOffAfterLock(s.standIn.requests, 'O')).toBe(true);
  } finally {
    await s.close();
  }
});
