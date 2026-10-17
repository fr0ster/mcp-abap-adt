/**
 * Stdin's `end` then `close` is one start, not a start and a second
 * trigger — the consumer closed the transport, and the same orderly close
 * runs: a held write still lands, exit 0. Only a signal after the start
 * forces.
 */

import { deferred, setup, turns } from './harness';

it('end then close is one start: the held write lands, exit 0', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.stdin.emit('end');
  s.processLike.stdin.emit('close');
  await turns();
  expect(s.order.filter((o) => o === 'begin')).toHaveLength(1);
  expect(s.exits).toEqual([]);
  write.resolve({ notStored: [] });
  await turns();
  expect(s.exits).toEqual([0]);
  expect(s.stderr).toEqual([]);
});

it('a SIGTERM after stdin ended is the second trigger: the forced close', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.stdin.emit('end');
  await turns();
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.exits).toEqual([1]);
  write.resolve({ notStored: [] });
});
