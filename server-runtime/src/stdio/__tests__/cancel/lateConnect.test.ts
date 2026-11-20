/**
 * The connect is a send on the instance's connection: the
 * sole caller of stdio's shared `connect()` is sent a cancel while the
 * connect is held — which aborts nothing (a tool call cannot be cancelled):
 * the connect completes, the call's tool runs on it, nothing is logged off,
 * and the next call uses it without a new connect. The session's end while
 * the connect is held: the shutdown sends no logoff before the connect's
 * request was answered. The connection is closed only by the instance's
 * terminal close.
 *
 * The hold is the ADT stand-in's, on the connect's own session request: the
 * connect's requests carry no signal (connection 16 takes none), so the
 * connect completes after its caller left. A hold at the token endpoint would
 * not do: a login's token exchange carries the provider's attempt signal, so
 * a sole caller's cancel aborts the exchange itself and no connection
 * completes — `loginEndsWithRequest` covers that.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

let s: Stand;

beforeEach(async () => {
  s = await stand({ kind: 'onprem', shutdown: {} });
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
  assert.equal(await r1.done, 'cancelled');
  await turns(50);
  assert.equal(s.active(), 1);

  hold.release();
  // The connect completes and the call's tool runs on it; no logoff
  // reaches the system.
  await until(() => s.reached('r1'));
  await until(() => s.active() === 0);
  const connectRequests = s.adt.requests.length;
  assert.equal(
    s.adt.requests.some((r) => isLogoff(r.url)),
    false,
  );

  // Kept: the next request sends its probe alone, on the late connection —
  // no new connect before it.
  assert.deepStrictEqual(await s.call('r2').done, {
    text: 'r2',
    isError: false,
  });
  assert.deepStrictEqual(
    s.adt.requests.slice(connectRequests).map((r) => r.url),
    ['/sap/bc/adt/probe/r2'],
  );
  assert.equal(
    s.adt.requests.some((r) => isLogoff(r.url)),
    false,
  );

  // The terminal close at shutdown disconnects it, once.
  s.processLike.emit('SIGTERM');
  assert.equal(await s.exited, 0);
  await until(() => s.adt.logoffs() === 1);
  await turns(20);
  assert.equal(s.adt.logoffs(), 1);
});

it('the session ends while connect() is held: no logoff before the connect’s request was answered', async () => {
  const hold = s.adt.hold(() => true);
  const r1 = s.call('r1');
  await hold.arrived;

  // The session's end: the client's transport closes, then the shutdown.
  await s.client.close();
  assert.equal(await r1.done, 'cancelled');
  s.processLike.emit('SIGTERM');
  await turns(50);
  assert.equal(s.adt.logoffs(), 0);
  // The call is tracked until its connect settled: the shutdown waits for it.
  assert.equal(s.active(), 1);

  const held = s.adt.requests.length;
  hold.release();
  assert.equal(await s.exited, 0);
  await until(() => s.adt.logoffs() === 1);
  // The logoff came after the held request; the tool never ran.
  const logoff = s.adt.requests.findIndex((r) => isLogoff(r.url));
  assert.ok(logoff >= held);
  assert.equal(s.reached('r1'), false);
});
