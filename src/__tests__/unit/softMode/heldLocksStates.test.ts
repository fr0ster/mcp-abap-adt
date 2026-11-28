/**
 * The lock registry's states (#394, spec §3): `held`, `unlock-sent`,
 * released. Nothing is resent: `releaseAll` sends only for `held` locks and
 * marks each `unlock-sent` before it sends; a `withLock` carrier is taken in
 * `unlock-sent`; a lock leaves only on an `ok` unlock or its connection's
 * lost session; one registry per connection.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolResultLike } from '../../../lib/toolResult';
import {
  HeldLiveLocks,
  heldLocksIfAny,
  heldLocksOf,
} from '../../integration/helpers/heldLiveLocks';

const lock = (handle: string) => ({
  object_type: 'CLASS',
  object_name: `ZCL_${handle}`,
  lock_handle: handle,
});

const json = (payload: unknown, isError: boolean): ToolResultLike => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

const noReport = () => {};

describe('HeldLiveLocks states', () => {
  it('an unlock that failed on the network is not sent again', async () => {
    const locks = new HeldLiveLocks();
    locks.hold(lock('A'));
    const sent: string[] = [];
    const unlock = async (held: { lock_handle: string }) => {
      sent.push(held.lock_handle);
      return {
        isError: true,
        text: JSON.stringify({
          origin: 'connection',
          connection_cause: 'ECONNREFUSED',
        }),
      };
    };
    await locks.releaseAll(unlock, noReport);
    await locks.releaseAll(unlock, noReport);
    assert.deepEqual(sent, ['A']);
    assert.deepEqual(locks.stillOwned, [
      { lock: lock('A'), state: 'unlock-sent' },
    ]);
  });

  it('a suite-sent unlock marks the lock, and releaseAll skips it', async () => {
    const locks = new HeldLiveLocks();
    locks.hold(lock('A'));
    locks.hold(lock('B'));
    locks.unlockSent('A');
    const sent: string[] = [];
    const lines: string[] = [];
    await locks.releaseAll(
      async (held) => {
        sent.push(held.lock_handle);
        return { text: 'unlocked' };
      },
      (line) => lines.push(line),
    );
    assert.deepEqual(sent, ['B']);
    assert.deepEqual(
      locks.stillHeld.map((held) => held.lock_handle),
      ['A'],
    );
    assert.match(lines.join('\n'), /ZCL_A/);
  });

  it('marks the lock before the unlock is sent', async () => {
    const locks = new HeldLiveLocks();
    locks.hold(lock('A'));
    let stateWhileSending: string | undefined;
    await locks.releaseAll(async () => {
      stateWhileSending = locks.stillOwned[0]?.state;
      return { text: 'unlocked' };
    }, noReport);
    assert.equal(stateWhileSending, 'unlock-sent');
    assert.equal(locks.stillHeld.length, 0);
  });

  it('an ok unlock releases, a lost session releases all, anything else keeps', () => {
    const locks = new HeldLiveLocks();
    for (const handle of ['A', 'B', 'C']) locks.hold(lock(handle));
    locks.unlockAnswered('A', 'ok');
    locks.unlockAnswered('B', 'refused');
    locks.unlockAnswered('C', 'network');
    assert.deepEqual(
      locks.stillOwned.map((owned) => [owned.lock.lock_handle, owned.state]),
      [
        ['B', 'unlock-sent'],
        ['C', 'unlock-sent'],
      ],
    );
    locks.unlockAnswered('B', 'session-lost');
    assert.equal(locks.stillHeld.length, 0);
  });

  it('takes in a left_locked carrier as unlock-sent, on a success and a failure', () => {
    const locks = new HeldLiveLocks();
    locks.takeInLeftLocked(
      json(
        {
          result: 'SUCCESS',
          cleanup: {
            left_locked: true,
            lock_handle: 'S',
            object: { type: 'CLASS', name: 'ZCL_S' },
          },
        },
        false,
      ),
    );
    locks.takeInLeftLocked(
      json(
        {
          message: 'x',
          origin: 'connection',
          left_locked: true,
          lock_handle: 'F',
          object: { type: 'CLASS', name: 'ZCL_F' },
        },
        true,
      ),
    );
    assert.deepEqual(
      locks.stillOwned.map((owned) => [owned.lock.object_name, owned.state]),
      [
        ['ZCL_S', 'unlock-sent'],
        ['ZCL_F', 'unlock-sent'],
      ],
    );
  });

  it('a carrier without left_locked, or without a handle, takes in nothing', () => {
    const locks = new HeldLiveLocks();
    locks.takeInLeftLocked(
      json({ result: 'SUCCESS', cleanup: { warning: 'x' } }, false),
    );
    locks.takeInLeftLocked(json({ cleanup: { left_locked: true } }, false));
    locks.takeInLeftLocked({ content: [{ type: 'text', text: 'SUCCESS' }] });
    assert.equal(locks.stillHeld.length, 0);
  });

  it('one registry per connection: another connection changes nothing', () => {
    const run = {};
    const sibling = {};
    heldLocksOf(run).hold(lock('A'));
    heldLocksOf(sibling).sessionLost();
    assert.equal(heldLocksOf(run).stillHeld.length, 1);
    assert.equal(heldLocksIfAny({}), undefined);
    assert.equal(heldLocksIfAny(run), heldLocksOf(run));
  });
});
