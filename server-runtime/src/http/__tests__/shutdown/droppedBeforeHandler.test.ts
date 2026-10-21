/**
 * The client's disconnect, http: a dropped request ends no call. Each
 * request has a transport of its own, and the response's close closes it —
 * that is not the end of the instance's session. A call admitted before the
 * drop goes on to its end wherever it waits — for its connection, for its
 * system lookup, for its turn in the main flow — and its handler runs
 * exactly once; nobody reads its answer. A pooled instance stays in the
 * pool with its state.
 */

import { isLogoff } from '../../../../../src/__tests__/helpers/adtStandIn';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  listenUrl,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import type { IHandlerGroup } from '../../../../../src/lib/handlers/interfaces';
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
let previousType: string | undefined;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand({ groups: [loseGroup] });
  previousType = process.env.SAP_SYSTEM_TYPE;
});

afterEach(async () => {
  await s.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  errorSpy.mockRestore();
});

/** `LoseSession`: marks its connection's session lost, as SAP's answer would. */
const loseGroup: IHandlerGroup = {
  getName: () => 'lose-session',
  registerHandlers: () => {},
  getHandlers: () => [
    {
      toolDefinition: {
        name: 'LoseSession',
        description: 'marks the session lost',
        inputSchema: { type: 'object', properties: {} },
      } as never,
      handler: (async (
        context: { connection: { isConnected?: () => boolean } },
        _args: unknown,
      ) => {
        context.connection.isConnected = () => false;
        return { content: [{ type: 'text', text: 'lost' }] };
      }) as never,
    },
  ],
} as unknown as IHandlerGroup;

/**
 * SAP ended the pooled instance's main session: the next request on its
 * handle builds a replacement connection (the state's own connection is
 * another session, untouched).
 */
async function loseMainSession(handle: string): Promise<void> {
  const lost = await s.call(
    'LoseSession',
    {},
    { ...basicHeaders(s.standIn.url), 'x-mcp-state-handle': handle },
  );
  expect(lost.isError).toBe(false);
}

/** A request the stand-in received that is not a logoff. */
const notLogoff = (r: { url: string }) => !isLogoff(r.url);

/** A POST of `body` the client drops with `drop()`. */
function droppable(
  body: unknown,
  headers: Record<string, string> = basicHeaders(s.standIn.url),
) {
  const controller = new AbortController();
  const sent = fetch(s.url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  }).catch(() => 'dropped');
  return { drop: () => controller.abort(), sent };
}

const toolCall = (id: number, name: string, args: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

/** Long enough for the response's close to reach the transport and the instance. */
const pause = () => new Promise((r) => setTimeout(r, 150));

const count = (match: (url: string) => boolean) =>
  s.standIn.requests.filter((r) => match(r.url)).length;

const sessionOf = (match: (url: string) => boolean) =>
  s.standIn.requests.find((r) => match(r.url))?.session;

const loggedOff = () =>
  s.standIn.requests.filter((r) => isLogoff(r.url)).map((r) => r.session);

/**
 * A pooled instance holding state, its main session ended by SAP: the next
 * request on its handle builds a replacement connection — its connect and,
 * on ABAP Cloud, its system lookup are that request's waits.
 */
async function pooled(id: string): Promise<string> {
  const held = await s.call('HoldState', { id });
  expect(held.isError).toBe(false);
  await loseMainSession(held.text);
  return held.text;
}

/** The handle still reaches its instance and its state, which is not logged off. */
async function stillPooled(handle: string, stateId: string, nextId: string) {
  const stateSession = sessionOf((url) => url.startsWith(listenUrl(stateId)));
  expect(stateSession).toBeDefined();
  expect(loggedOff()).not.toContain(stateSession);
  const again = await s.call('LockedUpdate', {
    id: nextId,
    state_handle: handle,
  });
  expect(again).toMatchObject({ text: nextId, isError: false });
  expect(loggedOff()).not.toContain(stateSession);
}

it('dropped while its call waits for the connection: the handler still runs exactly once, and the instance stays in the pool', async () => {
  const handle = await pooled('P');
  const before = s.standIn.requests.filter(notLogoff).length;
  // The next request at the system but the lost session's logoff is the
  // replacement's connect.
  const hold = s.standIn.hold(notLogoff);
  const call = droppable(
    toolCall(77, 'LockedUpdate', { id: 'C', state_handle: handle }),
  );
  await hold.arrived;
  expect(s.standIn.requests.filter(notLogoff).length).toBe(before + 1);
  expect(count(isLockOf('C'))).toBe(0);

  call.drop();
  expect(await call.sent).toBe('dropped');
  await pause();
  // The call is still live, its signal not aborted.
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);

  hold.release();
  await until(() => count(isUnlockOf('C')) === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(count(isLockOf('C'))).toBe(1);
  expect(count(isUpdateOf('C'))).toBe(1);
  await stillPooled(handle, 'P', 'C2');
});

it('dropped while its call waits for the system lookup: the handler still runs exactly once, and the instance stays in the pool', async () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  const handle = await pooled('Q');
  const isLookup = (url: string) => url.includes('systeminformation');
  const lookupsBefore = count(isLookup);
  const hold = s.standIn.hold((r) => isLookup(r.url));
  const call = droppable(
    toolCall(78, 'LockedUpdate', { id: 'L', state_handle: handle }),
  );
  await hold.arrived;
  expect(count(isLookup)).toBe(lookupsBefore + 1);
  expect(count(isLockOf('L'))).toBe(0);

  call.drop();
  expect(await call.sent).toBe('dropped');
  await pause();
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);

  hold.release();
  await until(() => count(isUnlockOf('L')) === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(count(isLockOf('L'))).toBe(1);
  expect(count(isUpdateOf('L'))).toBe(1);
  await stillPooled(handle, 'Q', 'L2');
});

it('dropped while a call waits for its turn in the main flow: both handlers run exactly once, in order', async () => {
  // One request, one instance, two calls: the second queues behind the first.
  const hold = s.standIn.hold((r) => isUpdateOf('F1')(r.url));
  const call = droppable([
    toolCall(81, 'LockedUpdate', { id: 'F1' }),
    toolCall(82, 'LockedUpdate', { id: 'F2' }),
  ]);
  await hold.arrived;
  await until(() => activeTools().length === 2);
  expect(count(isLockOf('F2'))).toBe(0);

  call.drop();
  expect(await call.sent).toBe('dropped');
  await pause();
  // Both calls live, none aborted; no logoff under the running one.
  expect(activeTools()).toHaveLength(2);
  expect(activeTools().every((t) => !t.signal.aborted)).toBe(true);
  expect(s.standIn.logoffs()).toBe(0);

  hold.release();
  await until(() => count(isUnlockOf('F2')) === 1);
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(count(isLockOf('F1'))).toBe(1);
  expect(count(isLockOf('F2'))).toBe(1);
  expect(count(isUpdateOf('F2'))).toBe(1);
  expect(s.indexOf(isLockOf('F2'))).toBeGreaterThan(
    s.indexOf(isUnlockOf('F1')),
  );
  // Its work ended: the instance without state leaves, logged off after it.
  await until(() => s.standIn.logoffs() === 1);
  expect(s.standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
    s.indexOf(isUnlockOf('F2')),
  );
});
