/**
 * The connect is a send on the instance's connection (D56, spec §5.3): the
 * sole caller of stdio's shared `connect()` is sent a cancel while the
 * connect is held — which aborts nothing (a tool call cannot be cancelled):
 * the connect completes, the call's tool runs on it, nothing is logged off,
 * and the next call uses it without a new connect. The session's end while
 * the connect is held: the shutdown sends no logoff before the connect's
 * request was answered. The connection is closed only by the instance's
 * terminal close (spec §6.4).
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

it('the sole caller is sent a cancel while connect() is held: it runs on the late connection, no logoff, and the next call uses it', async () => {
  const hold = s.adt.hold(() => true);
  const r1 = s.call('r1');
  await hold.arrived;

  r1.cancel();
  expect(await r1.done).toBe('cancelled');
  await turns(50);
  expect(s.active()).toBe(1);

  hold.release();
  // The connect completes and the call's tool runs on it; no logoff
  // reaches the system.
  await until(() => s.reached('r1'));
  await until(() => s.active() === 0);
  const connectRequests = s.adt.requests.length;
  expect(s.adt.requests.some((r) => isLogoff(r.url))).toBe(false);

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

it('the session ends while connect() is held: no logoff before the connect’s request was answered', async () => {
  const hold = s.adt.hold(() => true);
  const r1 = s.call('r1');
  await hold.arrived;

  // The session's end: the client's transport closes, then the shutdown.
  await s.client.close();
  expect(await r1.done).toBe('cancelled');
  s.processLike.emit('SIGTERM');
  await turns(50);
  expect(s.adt.logoffs()).toBe(0);
  // The call is tracked until its connect settled: the shutdown waits for it.
  expect(s.active()).toBe(1);

  const held = s.adt.requests.length;
  hold.release();
  expect(await s.exited).toBe(0);
  await until(() => s.adt.logoffs() === 1);
  // The logoff came after the held request; the tool never ran.
  const logoff = s.adt.requests.findIndex((r) => isLogoff(r.url));
  expect(logoff).toBeGreaterThanOrEqual(held);
  expect(s.reached('r1')).toBe(false);
});
