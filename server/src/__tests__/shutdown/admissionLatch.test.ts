/**
 * The admission latch, stdio (spec §6.4, §14.5): a tool call read after
 * stdin's end gets the shutdown answer and nothing of it is sent — no
 * connection, no request — while the earlier tool, its `UNLOCK` held, is
 * interrupted and not awaited: the exit is `0`. (The full and the compact
 * tool set: the A7 parity suite.)
 */

import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { SHUTDOWN_SENTENCE } from '../../auth/serverSentences';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

it("a call read after stdin's end gets the shutdown answer and sends nothing; exit 0 without waiting for the earlier tool", async () => {
  s = await stand({ shutdown: {} });
  const hold = s.adt.hold((r) => isUnlockOf('A')(r.url));
  void s.callTool('LockedUpdate', { id: 'A' });
  await hold.arrived;
  const before = s.adt.requests.length;

  s.processLike.stdin.emit('end');
  const late = await s.callTool('LockedUpdate', { id: 'LATE' });
  expect(late).not.toBe('cancelled');
  const { text, isError } = late as { text: string; isError: boolean };
  expect(isError).toBe(true);
  expect(JSON.parse(text)).toMatchObject({
    error: 'authentication_failed',
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  expect(await s.exited).toBe(0);
  await turns(10);
  // Nothing of the late call was sent; the only request after the trigger is
  // the connector's logoff.
  expect(s.adt.requests.some((r) => isLockOf('LATE')(r.url))).toBe(false);
  await until(() => s.adt.logoffs() === 1);
  expect(s.adt.requests.length).toBe(before + 1);
  hold.release();
  await until(() => s.active() === 0);
});
