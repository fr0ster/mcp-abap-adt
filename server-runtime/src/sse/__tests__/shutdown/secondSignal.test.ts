/**
 * The second signal, sse: the shutdown waits for no
 * tool, so with an `UNLOCK` held at the stand-in the first `SIGTERM` already
 * ends with the logoff written and exit `0`; a second signal after it, or a
 * `--shutdown-timeout=1`, changes nothing — one exit, one logoff. (The
 * forced close while a logoff is still being written: lib's
 * transport-shutdown suite.)
 */

import assert from 'node:assert/strict';
import { afterEach, it, type Mock, mock } from 'node:test';
import { format } from 'node:util';
import { isUnlockOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import { type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;
let errorSpy: Mock<typeof console.error>;

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

for (const [_name, shutdownTimeoutMs] of [
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
] satisfies [string, number | undefined][]) {
  it(
    format('%s after the logoffs: one exit 0, one logoff', _name),
    async (t) => {
      errorSpy = t.mock.method(console, 'error', () => {});
      s = await sseStand(
        shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
      );
      const connection = await s.open();
      const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
      await connection.call('LockedUpdate', { id: 'A' }, 1);
      await hold.arrived;
      s.processLike.emit('SIGTERM');
      assert.equal(await s.exited, 0);
      if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
      else await new Promise((r) => setTimeout(r, 1_200));
      await turns(20);
      assert.deepStrictEqual(s.exits, [0]);
      await until(() => s.standIn.logoffs() === 1);
      await turns(20);
      assert.equal(s.standIn.logoffs(), 1);
      hold.release();
    },
  );
}
