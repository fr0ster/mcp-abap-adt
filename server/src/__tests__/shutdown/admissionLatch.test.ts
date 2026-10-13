/**
 * The admission latch, stdio (spec §6.4, §14.5): a tool call read after
 * stdin's end gets the shutdown answer and nothing of it is sent — no
 * connection, no request — while a held `UNLOCK` of an earlier tool lands
 * before exit. (The full and the compact tool set: the A7 parity suite.)
 */

import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { SHUTDOWN_SENTENCE } from '../../auth/serverSentences';
import { type Stand, stand, turns } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

it("a call read after stdin's end gets the shutdown answer; the held UNLOCK still lands; exit 0", async () => {
  s = await stand({ shutdown: {} });
  const hold = s.adt.hold((r) => isUnlockOf('A')(r.url));
  const first = s.callTool('LockedUpdate', { id: 'A' });
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
  await turns(10);
  // Nothing of it was sent.
  expect(s.adt.requests.length).toBe(before);
  expect(s.adt.requests.some((r) => isLockOf('LATE')(r.url))).toBe(false);

  hold.release();
  expect(await first).toEqual({ text: 'A', isError: false });
  expect(await s.exited).toBe(0);
  expect(s.adt.requests.some((r) => isUnlockOf('A')(r.url))).toBe(true);
});
