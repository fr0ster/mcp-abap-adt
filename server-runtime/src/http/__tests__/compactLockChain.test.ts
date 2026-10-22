/**
 * Compact's lock chain over Streamable HTTP: every request is an MCP session
 * of its own, and a lock lives in the SAP session that took it until its
 * UNLOCK or that session's logoff. So `HandlerLock` keeps its handle as the
 * pooled instance's state and answers the instance's `state_handle`; the
 * write and the unlock reach that instance — and its SAP session — by the
 * `x-mcp-state-handle` header, and are refused, sending nothing, under a
 * lock the instance they reached does not hold. A request of the same
 * user works on the held connection, its credential the request's: a
 * renewed token keeps the session and its locks.
 * Every call goes over real HTTP to the ADT stand-in.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import type { HandlerContext, IHandlerGroup } from '@mcp-abap-adt/lib/handlers';
import {
  basicHeaders,
  type HttpStand,
  httpStand,
  turns,
  until,
} from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;

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

/** `EchoArgs`: answers the arguments its handler received. */
const echoGroup: IHandlerGroup = {
  getName: () => 'echo-args',
  registerHandlers: () => {},
  getHandlers: () => [
    {
      toolDefinition: {
        name: 'EchoArgs',
        description: 'answers its arguments',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
      } as never,
      handler: (async (_context: unknown, args: unknown) => ({
        content: [{ type: 'text', text: JSON.stringify(args) }],
      })) as never,
    },
  ],
} as unknown as IHandlerGroup;

let s: HttpStand;

const poolSize = () =>
  (s.mcp as unknown as { pool: { size(): number } }).pool.size();
const isLock = (url: string) => url.includes('_action=LOCK');
const isUnlock = (url: string) => url.includes('_action=UNLOCK');
const requestsOf = (match: (r: { method: string; url: string }) => boolean) =>
  s.standIn.requests.filter(match);
const lockRequests = () => requestsOf((r) => isLock(r.url));
const puts = () => requestsOf((r) => r.method === 'PUT');
const unlocks = () => requestsOf((r) => isUnlock(r.url));

const LOCK = { object_type: 'CLASS', object_name: 'ZCL_LOCKED' };
const UPDATE = {
  object_type: 'CLASS',
  class_name: 'ZCL_LOCKED',
  source_code: 'CLASS zcl_locked DEFINITION. ENDCLASS.',
};

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand({
    groups: [new CompactModifyHandlersGroup(placeholder), loseGroup, echoGroup],
  });
});

afterEach(async () => {
  // The server logs a request's end after its answer went out.
  await turns(20);
  await s.close();
  jest.restoreAllMocks();
});

const withHeader = (
  handle: string,
  headers: Record<string, string> = basicHeaders(s.standIn.url),
) => ({
  ...headers,
  'x-mcp-state-handle': handle,
});

async function lock(): Promise<{ lockHandle: string; stateHandle: string }> {
  const locked = await s.call('HandlerLock', LOCK);
  expect(locked.status).toBe(200);
  expect(locked.isError).toBe(false);
  const answer = JSON.parse(locked.text) as {
    lock_handle: string;
    state_handle: string;
  };
  expect(answer.lock_handle).not.toBe('');
  expect(typeof answer.state_handle).toBe('string');
  return { lockHandle: answer.lock_handle, stateHandle: answer.state_handle };
}

it('lock, update, unlock over three requests with the header: one SAP session, the state ends at the UNLOCK', async () => {
  const { lockHandle, stateHandle } = await lock();
  expect(poolSize()).toBe(1);

  const updated = await s.call(
    'HandlerUpdate',
    { ...UPDATE, lock_handle: lockHandle },
    withHeader(stateHandle),
  );
  expect(updated.isError).toBe(false);

  const unlocked = await s.call(
    'HandlerUnlock',
    { ...LOCK, lock_handle: lockHandle },
    withHeader(stateHandle),
  );
  expect(unlocked.isError).toBe(false);

  expect(lockRequests()).toHaveLength(1);
  expect(puts()).toHaveLength(1);
  expect(unlocks()).toHaveLength(1);
  const session = lockRequests()[0]?.session;
  expect(puts()[0]?.session).toBe(session);
  expect(unlocks()[0]?.session).toBe(session);
  expect(puts()[0]?.url).toContain(`lockHandle=${lockHandle}`);
  // Nothing held after the UNLOCK: the instance leaves the pool.
  await until(() => poolSize() === 0);
});

// The spec's words (§1), copied here, never imported: the test is the copy.
const NOT_HELD_WORDS =
  'lock_handle is not held by this instance: send the state_handle HandlerLock answered as the state_handle argument (or in the x-mcp-state-handle header)';

it('lock, update, unlock over three requests with the state_handle argument alone, no header: one SAP session, the state ends at the UNLOCK', async () => {
  const { lockHandle, stateHandle } = await lock();
  expect(poolSize()).toBe(1);

  const updated = await s.call('HandlerUpdate', {
    ...UPDATE,
    lock_handle: lockHandle,
    state_handle: stateHandle,
  });
  expect(updated.isError).toBe(false);

  const unlocked = await s.call('HandlerUnlock', {
    ...LOCK,
    lock_handle: lockHandle,
    state_handle: stateHandle,
  });
  expect(unlocked.isError).toBe(false);

  expect(lockRequests()).toHaveLength(1);
  expect(puts()).toHaveLength(1);
  expect(unlocks()).toHaveLength(1);
  const session = lockRequests()[0]?.session;
  expect(puts()[0]?.session).toBe(session);
  expect(unlocks()[0]?.session).toBe(session);
  expect(puts()[0]?.url).toContain(`lockHandle=${lockHandle}`);
  await until(() => poolSize() === 0);
});

it('the declared state_handle routes the call and reaches no handler that does not declare it: the handler gets the arguments it got before', async () => {
  const { stateHandle } = await lock();
  const echoed = await s.call('EchoArgs', {
    value: 'v',
    state_handle: stateHandle,
  });
  expect(echoed.isError).toBe(false);
  expect(JSON.parse(echoed.text)).toEqual({ value: 'v' });
  // Routed to the lock's instance: no second instance in the pool.
  expect(poolSize()).toBe(1);
});

it('without the header or the argument the write and the unlock are refused, sending nothing, in words naming the argument', async () => {
  const { lockHandle } = await lock();
  const before = s.standIn.requests.length;

  const updated = await s.call('HandlerUpdate', {
    ...UPDATE,
    lock_handle: lockHandle,
  });
  expect(updated.isError).toBe(true);
  expect(updated.text).toContain(NOT_HELD_WORDS);

  const unlocked = await s.call('HandlerUnlock', {
    ...LOCK,
    lock_handle: lockHandle,
  });
  expect(unlocked.isError).toBe(true);
  expect(unlocked.text).toContain(NOT_HELD_WORDS);

  expect(puts()).toEqual([]);
  expect(unlocks()).toEqual([]);
  // Only the logons of the refused calls' own instances, nothing written.
  expect(
    s.standIn.requests
      .slice(before)
      .filter((r) => r.method === 'PUT' || isUnlock(r.url)),
  ).toEqual([]);
  // The lock's instance still holds it.
  expect(poolSize()).toBe(1);
});

it('a request with another credential (a renewed token) works on the held connection: same SAP session, the lock kept, the write sent with the new credential', async () => {
  const { lockHandle, stateHandle } = await lock();
  const lockedWith = lockRequests()[0]?.authorization;
  expect(lockedWith?.startsWith('Basic ')).toBe(true);
  const renewed = {
    'x-sap-url': s.standIn.url,
    'x-sap-client': '100',
    'x-sap-jwt-token': 'renewed-token',
  };
  const updated = await s.call(
    'HandlerUpdate',
    { ...UPDATE, lock_handle: lockHandle },
    withHeader(stateHandle, renewed),
  );
  expect(updated.isError).toBe(false);
  expect(puts()).toHaveLength(1);
  const session = lockRequests()[0]?.session;
  expect(puts()[0]?.session).toBe(session);
  expect(puts()[0]?.authorization).toBe('Bearer renewed-token');
  expect(puts()[0]?.url).toContain(`lockHandle=${lockHandle}`);
  // Nothing logged off: the session lives on.
  expect(s.standIn.loggedOff()).toEqual([]);

  const unlocked = await s.call(
    'HandlerUnlock',
    { ...LOCK, lock_handle: lockHandle },
    withHeader(stateHandle, renewed),
  );
  expect(unlocked.isError).toBe(false);
  expect(unlocks()).toHaveLength(1);
  expect(unlocks()[0]?.session).toBe(session);
  expect(unlocks()[0]?.authorization).toBe('Bearer renewed-token');
  await until(() => poolSize() === 0);
});

it('a session SAP lost takes its locks with it: the write on the replacement session is refused, sending nothing', async () => {
  const { lockHandle, stateHandle } = await lock();
  const lost = await s.call('LoseSession', {}, withHeader(stateHandle));
  expect(lost.isError).toBe(false);
  const updated = await s.call(
    'HandlerUpdate',
    { ...UPDATE, lock_handle: lockHandle },
    withHeader(stateHandle),
  );
  expect(updated.isError).toBe(true);
  expect(updated.text).toContain('lock_handle is not held by this instance');
  expect(puts()).toEqual([]);
});
