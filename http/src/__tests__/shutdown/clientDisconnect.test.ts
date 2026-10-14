/**
 * The client's disconnect, http (owner's ruling): a dropped request closes
 * nothing. The tool it started runs to its end — its `UNLOCK` lands — and no
 * logoff is sent while it runs. Then the pool's lifecycle as before: an
 * instance that holds no state is disposed after its work, its connection
 * logged off then; a pooled instance holding state (`state_handle`) stays in
 * the pool with its connections, until its stop tool or the idle bound.
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isUnlockOf,
  isUpdateOf,
  listenUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
  until,
} from './harness';

jest.setTimeout(30_000);

let s: HttpStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
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
  expect(await call.sent).toBe('dropped');
  await pause();
  expect(s.standIn.logoffs()).toBe(0);
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);

  hold.release();
  await until(() => s.indexOf(isUnlockOf('A')) >= 0);
  // Its work ended: the instance leaves, its connection logged off after the UNLOCK.
  await until(() => s.standIn.logoffs() === 1);
  expect(s.standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
    s.indexOf(isUnlockOf('A')),
  );
});

it('a pooled instance holding state: the dropped request’s tool runs to its end, and the instance keeps its connections in the pool', async () => {
  const held = await s.call('HoldState', { id: 'P' });
  expect(held.isError).toBe(false);
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
  expect(toolSession).toBeDefined();
  expect(stateSession).toBeDefined();
  // Neither the session the tool runs in nor the state's own is logged off:
  // the state is the handle's. (A connection the request's new credential
  // replaced ends as before, once no call works on it.)
  const loggedOff = () =>
    s.standIn.requests.filter((r) => isLogoff(r.url)).map((r) => r.session);

  call.drop();
  expect(await call.sent).toBe('dropped');
  await pause();
  expect(loggedOff()).not.toContain(toolSession);
  expect(loggedOff()).not.toContain(stateSession);
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);

  hold.release();
  await until(() => s.indexOf(isUnlockOf('P1')) >= 0);
  await until(() => activeTools().length === 0);
  await pause();
  await turns(20);
  expect(loggedOff()).not.toContain(toolSession);
  expect(loggedOff()).not.toContain(stateSession);
  // The handle still reaches its instance and its state.
  const again = await s.call('LockedUpdate', {
    id: 'P2',
    state_handle: held.text,
  });
  expect(again).toMatchObject({ text: 'P2', isError: false });
  expect(loggedOff()).not.toContain(stateSession);
});
