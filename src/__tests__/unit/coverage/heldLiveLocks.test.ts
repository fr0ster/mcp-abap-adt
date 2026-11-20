/**
 * The live suites' held compact locks: every handle still held is attempted
 * at the suite's end, whatever the others answered, and a lock whose unlock
 * SAP refused or that threw stays held and is reported.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HeldLiveLocks } from '../../integration/helpers/heldLiveLocks';

const lock = (handle: string) => ({
  object_type: 'TABLE_SETTINGS',
  object_name: `ZT_${handle}`,
  lock_handle: handle,
});

describe('HeldLiveLocks', () => {
  it('attempts every handle when one unlock answers an error and the next throws', async () => {
    const locks = new HeldLiveLocks();
    for (const handle of ['A', 'B', 'C']) locks.hold(lock(handle));
    const attempted: string[] = [];
    const lines: string[] = [];
    const still = await locks.releaseAll(
      async (held) => {
        attempted.push(held.lock_handle);
        if (held.lock_handle === 'A') return { isError: true, text: 'refused' };
        if (held.lock_handle === 'B') throw new Error('connection lost');
        return { text: 'unlocked' };
      },
      (line) => lines.push(line),
    );
    assert.deepEqual(attempted, ['A', 'B', 'C']);
    assert.deepEqual(
      still.map((held) => held.lock_handle),
      ['A', 'B'],
    );
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? '', /ZT_A: refused/);
    assert.match(lines[1] ?? '', /ZT_B: Error: connection lost/);
  });

  it('keeps a handle until it is released', () => {
    const locks = new HeldLiveLocks();
    locks.hold(lock('A'));
    assert.equal(locks.stillHeld.length, 1);
    locks.released('A');
    assert.equal(locks.stillHeld.length, 0);
  });
});
