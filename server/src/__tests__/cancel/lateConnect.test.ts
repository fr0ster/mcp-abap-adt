/**
 * RF1 — a late connect built for nobody is not kept (D32, spec §5.3): the
 * sole caller of stdio's shared `connect()` is cancelled while the connect
 * is held; the connect then completes. The connection built for nobody is
 * disconnected — its logoff reaches the system — and nothing is kept: the
 * next request connects afresh.
 *
 * The hold is the ADT stand-in's, on the connect's own session request: on
 * connection 15 the connect's requests carry no signal, so the connect
 * completes after its caller left. (A login's token exchange does not: it
 * carries the provider's attempt signal, so a sole caller's cancel aborts
 * the exchange itself — `loginEndsWithRequest` covers that.)
 */

import { type Stand, stand, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

beforeEach(async () => {
  s = await stand();
});

afterEach(async () => {
  await s.close();
});

const isLogoff = (url: string) => url.includes('logoff');

it('the sole caller cancels while connect() is held: the late connection is disconnected, nothing kept', async () => {
  const hold = s.adt.hold(() => true);
  const r1 = s.call('r1');
  await hold.arrived;
  const connectRequests = s.adt.requests.length;

  r1.cancel();
  await until(() => s.active() === 0);
  expect(s.stderr.join('')).toContain('[MCP] request_aborted');
  expect(s.adt.requests.some((r) => isLogoff(r.url))).toBe(false);

  hold.release();
  // Disconnected: its logoff reaches the system.
  await until(() => s.adt.requests.some((r) => isLogoff(r.url)));
  expect(s.reached('r1')).toBe(false);

  // Nothing kept: the next request connects afresh — its session request
  // comes before its probe.
  const before = s.adt.requests.length;
  expect(await s.call('r2').done).toEqual({ text: 'r2', isError: false });
  const after = s.adt.requests.slice(before).map((r) => r.url);
  expect(after.length).toBeGreaterThan(1);
  expect(after.at(-1)).toBe('/sap/bc/adt/probe/r2');
  expect(after.slice(0, -1)).toEqual(
    expect.arrayContaining(
      s.adt.requests.slice(0, connectRequests).map((r) => r.url),
    ),
  );
});
