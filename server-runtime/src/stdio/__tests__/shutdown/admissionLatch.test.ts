/**
 * The admission latch, stdio: a tool call read after
 * stdin's end gets the shutdown answer and nothing of it is sent — no
 * connection, no request — while the earlier tool, its `UNLOCK` held, is
 * interrupted and not awaited: the exit is `0`. (The full and the compact
 * tool set: the parity suite.)
 */

import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import {
  isLockOf,
  isUnlockOf,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { SHUTDOWN_SENTENCE } from '../../auth/serverSentences';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

let s: Stand;

afterEach(async () => {
  await s.close();
});

it("a call read after stdin's end gets the shutdown answer and sends nothing; exit 0 without waiting for the earlier tool", async () => {
  s = await stand({ kind: 'onprem', shutdown: {} });
  const hold = s.adt.hold((r) => isUnlockOf('A')(r.url));
  void s.callTool('LockedUpdate', { id: 'A' });
  await hold.arrived;
  const before = s.adt.requests.length;

  s.processLike.stdin.emit('end');
  const late = await s.callTool('LockedUpdate', { id: 'LATE' });
  assert.notEqual(late, 'cancelled');
  const { text, isError } = late as { text: string; isError: boolean };
  assert.equal(isError, true);
  assertMatchObject(JSON.parse(text), {
    error: 'authentication_failed',
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  assert.equal(await s.exited, 0);
  await turns(10);
  // Nothing of the late call was sent; the only request after the trigger is
  // the connector's logoff.
  assert.equal(
    s.adt.requests.some((r) => isLockOf('LATE')(r.url)),
    false,
  );
  await until(() => s.adt.logoffs() === 1);
  assert.equal(s.adt.requests.length, before + 1);
  hold.release();
  await until(() => s.active() === 0);
});
