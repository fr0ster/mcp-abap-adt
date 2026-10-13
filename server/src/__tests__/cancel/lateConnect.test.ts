/**
 * RF1 — a late connection is the instance's (D32 as amended by D56, spec
 * §5.3): the sole caller of stdio's shared `connect()` is cancelled while the
 * connect is held; the connect then completes. A cancel causes no logoff: the
 * completed connection is kept as the instance's `built` entry — no
 * `disconnect()`, no logoff at the stand-in — and the next call uses it
 * without a new connect. It is closed only by the instance's terminal close
 * (spec §6.4), which is A10's to wire.
 *
 * The hold is the ADT stand-in's, on the connect's own session request: the
 * connect's requests carry no signal (connection 16 takes none), so the
 * connect completes after its caller left. A hold at the token endpoint would
 * not do: a login's token exchange carries the provider's attempt signal, so
 * a sole caller's cancel aborts the exchange itself and no connection
 * completes — `loginEndsWithRequest` covers that.
 */

import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

beforeEach(async () => {
  s = await stand({ shutdown: {} });
});

afterEach(async () => {
  await s.close();
});

const isLogoff = (url: string) => url.includes('logoff');

it('the sole caller cancels while connect() is held: the late connection is kept, no logoff, and the next call uses it', async () => {
  const hold = s.adt.hold(() => true);
  const r1 = s.call('r1');
  await hold.arrived;

  r1.cancel();
  await until(() => s.active() === 0);
  expect(await r1.done).toBe('cancelled');

  hold.release();
  // The connect completes: its session request was answered and nothing
  // else follows it — no logoff reaches the system.
  await turns(50);
  const connectRequests = s.adt.requests.length;
  expect(s.adt.requests.some((r) => isLogoff(r.url))).toBe(false);
  expect(s.reached('r1')).toBe(false);

  // Kept: the next request sends its probe alone, on the late connection —
  // no new connect before it.
  expect(await s.call('r2').done).toEqual({ text: 'r2', isError: false });
  expect(s.adt.requests.slice(connectRequests).map((r) => r.url)).toEqual([
    '/sap/bc/adt/probe/r2',
  ]);
  expect(s.adt.requests.some((r) => isLogoff(r.url))).toBe(false);

  // The terminal close at shutdown disconnects it, once.
  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(0);
  await until(() => s.adt.logoffs() === 1);
  await turns(20);
  expect(s.adt.logoffs()).toBe(1);
});
