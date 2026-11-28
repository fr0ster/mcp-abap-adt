/**
 * A live test whose step left a lock behind fails at once (#394, second
 * review): between a test's start and its end, a lock that became
 * `unlock-sent` on any run connection — its release was sent and did not
 * reach SAP — is that test's failure, whichever suite or tester ran it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  heldLocksOf,
  unlockSentSince,
  unlockSentSnapshot,
} from '../../integration/helpers/heldLiveLocks';

const lock = (handle: string) => ({
  object_type: 'CLASS',
  object_name: `ZCL_${handle}`,
  lock_handle: handle,
});

describe('unlockSentSince', () => {
  it('names a lock whose unlock was sent and failed during the test', () => {
    const run = {};
    heldLocksOf(run).hold(lock('A'));
    const before = unlockSentSnapshot();
    heldLocksOf(run).unlockSent('A');
    assert.deepEqual(unlockSentSince(before), ['CLASS ZCL_A']);
  });

  it('a lock already unlock-sent before the test, or still held, is not named', () => {
    const run = {};
    heldLocksOf(run).hold(lock('B'));
    heldLocksOf(run).unlockSent('B');
    heldLocksOf(run).hold(lock('C'));
    const before = unlockSentSnapshot();
    assert.deepEqual(unlockSentSince(before), []);
  });
});
