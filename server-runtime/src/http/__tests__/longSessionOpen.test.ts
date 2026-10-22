/**
 * The long session's open over Streamable HTTP (spec §2): `SessionOpen` (and
 * the compact `HandlerSession` with `action: 'open'`) marks the instance's
 * long session open and answers its `state_handle`; the pool keeps the
 * instance because it now holds state. A call carrying the handle runs on
 * that instance and its held SAP connection: no new connection, no second
 * `systeminformation`, no logoff. Opening on an instance that already holds
 * state (a lock) answers that instance's handle and keeps what it holds.
 * Every call goes over real HTTP to the ADT stand-in.
 */

import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactLongSessionHandlersGroup } from '../../../../src/lib/compact/longSession/group';
import { LongSessionHandlersGroup } from '../../../../src/lib/handlers/groups/LongSessionHandlersGroup';
import { type HttpStand, httpStand, turns, until } from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;

let s: HttpStand;

const poolSize = () =>
  (s.mcp as unknown as { pool: { size(): number } }).pool.size();
const isSystemInformation = (url: string) =>
  url.startsWith('/sap/bc/adt/core/http/systeminformation');
const probes = () =>
  s.standIn.requests.filter((r) => r.url.startsWith('/sap/bc/adt/probe/'));

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand({
    groups: [
      new CompactModifyHandlersGroup(placeholder),
      new LongSessionHandlersGroup(placeholder),
      new CompactLongSessionHandlersGroup(placeholder),
    ],
  });
});

afterEach(async () => {
  await turns(20);
  await s.close();
  jest.restoreAllMocks();
});

const handleOf = (text: string): string =>
  (JSON.parse(text) as { state_handle: string }).state_handle;

it('SessionOpen on a new instance answers its state_handle, sends nothing to SAP, and the pool keeps the instance', async () => {
  const opened = await s.call('SessionOpen', {});
  expect(opened.status).toBe(200);
  expect(opened.isError).toBe(false);
  const handle = handleOf(opened.text);
  expect(handle).toMatch(/^[0-9A-F]{32}$/);
  expect(s.standIn.requests).toEqual([]);
  await turns(10);
  expect(poolSize()).toBe(1);
});

it('two calls carrying the handle run on the session instance: one SAP connection, one systeminformation, no logoff', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);

  const first = await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  expect(first.isError).toBe(false);
  const second = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  expect(second.isError).toBe(false);

  expect(probes()).toHaveLength(2);
  const sessions = new Set(s.standIn.requests.map((r) => r.session));
  expect(sessions.size).toBe(1);
  expect(
    s.standIn.requests.filter((r) => isSystemInformation(r.url)),
  ).toHaveLength(1);
  expect(s.standIn.logoffs()).toBe(0);
  expect(poolSize()).toBe(1);
});

it('the compact HandlerSession open answers the handle; calls carrying it share one SAP session', async () => {
  const opened = await s.call('HandlerSession', { action: 'open' });
  expect(opened.isError).toBe(false);
  const handle = handleOf(opened.text);
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  expect(new Set(probes().map((r) => r.session)).size).toBe(1);
  expect(
    s.standIn.requests.filter((r) => isSystemInformation(r.url)),
  ).toHaveLength(1);
  expect(s.standIn.logoffs()).toBe(0);
  expect(poolSize()).toBe(1);
});

it('opening an open session answers its handle again', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);
  const again = await s.call('SessionOpen', { state_handle: handle });
  expect(again.isError).toBe(false);
  expect(handleOf(again.text)).toBe(handle);
  const compact = await s.call('HandlerSession', {
    action: 'open',
    state_handle: handle,
  });
  expect(handleOf(compact.text)).toBe(handle);
  expect(poolSize()).toBe(1);
});

const LOCK = { object_type: 'CLASS', object_name: 'ZCL_LOCKED' };

it('SessionOpen carrying the handle of an instance holding a lock answers that handle and keeps the lock; the session outlives the UNLOCK', async () => {
  const locked = await s.call('HandlerLock', LOCK);
  expect(locked.isError).toBe(false);
  const { lock_handle: lockHandle, state_handle: stateHandle } = JSON.parse(
    locked.text,
  ) as { lock_handle: string; state_handle: string };

  const opened = await s.call('SessionOpen', { state_handle: stateHandle });
  expect(opened.isError).toBe(false);
  expect(handleOf(opened.text)).toBe(stateHandle);
  expect(poolSize()).toBe(1);

  const unlocked = await s.call('HandlerUnlock', {
    ...LOCK,
    lock_handle: lockHandle,
    state_handle: stateHandle,
  });
  expect(unlocked.isError).toBe(false);
  const lockSession = s.standIn.requests.find((r) =>
    r.url.includes('_action=LOCK'),
  )?.session;
  const unlockSession = s.standIn.requests.find((r) =>
    r.url.includes('_action=UNLOCK'),
  )?.session;
  expect(unlockSession).toBe(lockSession);

  // The lock is gone, the long session is not: the instance stays.
  await turns(20);
  expect(poolSize()).toBe(1);
  const after = await s.call('ProbeAdt', {
    id: 'x',
    state_handle: stateHandle,
  });
  expect(after.isError).toBe(false);
  expect(probes()[0]?.session).toBe(lockSession);
  expect(s.standIn.logoffs()).toBe(0);
  await until(() => poolSize() === 1);
});
