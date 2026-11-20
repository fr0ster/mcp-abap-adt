/**
 * Stdin's `end` then `close` is one start, not a start and a second
 * trigger — the consumer closed the transport, and the same orderly close
 * runs: a held write still lands, exit 0. Only a signal after the start
 * forces.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { deferred, setup, turns } from './harness';

it('end then close is one start: the held write lands, exit 0', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.stdin.emit('end');
  s.processLike.stdin.emit('close');
  await turns();
  assert.equal(s.order.filter((o) => o === 'begin').length, 1);
  assert.deepStrictEqual(s.exits, []);
  write.resolve({ notStored: [] });
  await turns();
  assert.deepStrictEqual(s.exits, [0]);
  assert.deepStrictEqual(s.stderr, []);
});

it('a SIGTERM after stdin ended is the second trigger: the forced close', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.stdin.emit('end');
  await turns();
  s.processLike.emit('SIGTERM');
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
  write.resolve({ notStored: [] });
});
