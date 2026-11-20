/**
 * The client's disconnect, http: a dropped request closes
 * nothing. The tool it started runs to its end — its `UNLOCK` lands — and no
 * logoff is sent while it runs. Then the pool's lifecycle as before: an
 * instance that holds no state is disposed after its work, its connection
 * logged off then; a pooled instance holding state (`state_handle`) stays in
 * the pool with its connections, until its stop tool or the idle bound.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import { isLogoff } from '../../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import {
  isUnlockOf,
  isUpdateOf,
  listenUrl,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
  until,
} from './harness';

let s: HttpStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

/** A `tools/call` the client drops with `drop()`. */
function droppable(name: string, args: Record<string, unknown>) {
  const controller = new AbortController();
  const sent = fetch(s.url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...basicHeaders(s.standIn.url),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  }).catch(() => 'dropped');
  return { drop: () => controller.abort(), sent };
}

const pause = () => new Promise((r) => setTimeout(r, 150));

it('without state: the dropped request’s tool runs to its end with no logoff under it; the instance is disposed after its work', async () => {
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  const call = droppable('LockedUpdate', { id: 'A' });
  await hold.arrived;
  call.drop();
  assert.equal(await call.sent, 'dropped');
  await pause();
  assert.equal(s.standIn.logoffs(), 0);
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['LockedUpdate'],
  );

  hold.release();
  await until(() => s.indexOf(isUnlockOf('A')) >= 0);
  // Its work ended: the instance leaves, its connection logged off after the UNLOCK.
  await until(() => s.standIn.logoffs() === 1);
  assert.ok(
    s.standIn.requests.findIndex((r) => isLogoff(r.url)) >
      s.indexOf(isUnlockOf('A')),
  );
});

it('a pooled instance holding state: the dropped request’s tool runs to its end, and the instance keeps its connections in the pool', async () => {
  const held = await s.call('HoldState', { id: 'P' });
  assert.equal(held.isError, false);
  const hold = s.standIn.hold((r) => isUpdateOf('P1')(r.url));
  const call = droppable('LockedUpdate', {
    id: 'P1',
    state_handle: held.text,
  });
  await hold.arrived;
  const sessionOf = (match: (url: string) => boolean) =>
    s.standIn.requests.find((r) => match(r.url))?.session;
  const toolSession = sessionOf(isUpdateOf('P1'));
  const stateSession = sessionOf((url) => url.startsWith(listenUrl('P')));
  assert.notEqual(toolSession, undefined);
  assert.notEqual(stateSession, undefined);
  // Neither the session the tool runs in nor the state's own is logged off:
  // the state is the handle's. (A connection the request's new credential
  // replaced ends as before, once no call works on it.)
  const loggedOff = (): (string | undefined)[] =>
    s.standIn.requests.filter((r) => isLogoff(r.url)).map((r) => r.session);

  call.drop();
  assert.equal(await call.sent, 'dropped');
  await pause();
  assert.ok(!loggedOff().includes(toolSession));
  assert.ok(!loggedOff().includes(stateSession));
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['LockedUpdate'],
  );

  hold.release();
  await until(() => s.indexOf(isUnlockOf('P1')) >= 0);
  await until(() => activeTools().length === 0);
  await pause();
  await turns(20);
  assert.ok(!loggedOff().includes(toolSession));
  assert.ok(!loggedOff().includes(stateSession));
  // The handle still reaches its instance and its state.
  const again = await s.call('LockedUpdate', {
    id: 'P2',
    state_handle: held.text,
  });
  assertMatchObject(again, { text: 'P2', isError: false });
  assert.ok(!loggedOff().includes(stateSession));
});
