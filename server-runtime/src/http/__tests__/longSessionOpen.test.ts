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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactLongSessionHandlersGroup } from '../../../../src/lib/compact/longSession/group';
import { LongSessionHandlersGroup } from '../../../../src/lib/handlers/groups/LongSessionHandlersGroup';
import { type HttpStand, httpStand, turns, until } from './shutdown/harness';

const placeholder = { connection: undefined } as unknown as HandlerContext;

let s: HttpStand;

const poolSize = () =>
  (s.mcp as unknown as { pool: { size(): number } }).pool.size();
const isSystemInformation = (url: string) =>
  url.startsWith('/sap/bc/adt/core/http/systeminformation');
const probes = () =>
  s.standIn.requests.filter((r) => r.url.startsWith('/sap/bc/adt/probe/'));

beforeEach(async () => {
  mock.method(console, 'error', () => {});
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
  mock.restoreAll();
});

const handleOf = (text: string): string =>
  (JSON.parse(text) as { state_handle: string }).state_handle;

it('SessionOpen on a new instance answers its state_handle, sends nothing to SAP, and the pool keeps the instance', async () => {
  const opened = await s.call('SessionOpen', {});
  assert.equal(opened.status, 200);
  assert.equal(opened.isError, false);
  const handle = handleOf(opened.text);
  assert.match(handle, /^[0-9A-F]{32}$/);
  assert.deepStrictEqual(s.standIn.requests, []);
  await turns(10);
  assert.equal(poolSize(), 1);
});

it('two calls carrying the handle run on the session instance: one SAP connection, one systeminformation, no logoff', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);

  const first = await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  assert.equal(first.isError, false);
  const second = await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  assert.equal(second.isError, false);

  assert.equal(probes().length, 2);
  const sessions = new Set(s.standIn.requests.map((r) => r.session));
  assert.equal(sessions.size, 1);
  assert.equal(
    s.standIn.requests.filter((r) => isSystemInformation(r.url)).length,
    1,
  );
  assert.equal(s.standIn.logoffs(), 0);
  assert.equal(poolSize(), 1);
});

it('the compact HandlerSession open answers the handle; calls carrying it share one SAP session', async () => {
  const opened = await s.call('HandlerSession', { action: 'open' });
  assert.equal(opened.isError, false);
  const handle = handleOf(opened.text);
  await s.call('ProbeAdt', { id: 'one', state_handle: handle });
  await s.call('ProbeAdt', { id: 'two', state_handle: handle });
  assert.equal(new Set(probes().map((r) => r.session)).size, 1);
  assert.equal(
    s.standIn.requests.filter((r) => isSystemInformation(r.url)).length,
    1,
  );
  assert.equal(s.standIn.logoffs(), 0);
  assert.equal(poolSize(), 1);
});

it('opening an open session answers its handle again', async () => {
  const handle = handleOf((await s.call('SessionOpen', {})).text);
  const again = await s.call('SessionOpen', { state_handle: handle });
  assert.equal(again.isError, false);
  assert.equal(handleOf(again.text), handle);
  const compact = await s.call('HandlerSession', {
    action: 'open',
    state_handle: handle,
  });
  assert.equal(handleOf(compact.text), handle);
  assert.equal(poolSize(), 1);
});

const LOCK = { object_type: 'CLASS', object_name: 'ZCL_LOCKED' };

it('SessionOpen carrying the handle of an instance holding a lock answers that handle and keeps the lock; the session outlives the UNLOCK', async () => {
  const locked = await s.call('HandlerLock', LOCK);
  assert.equal(locked.isError, false);
  const { lock_handle: lockHandle, state_handle: stateHandle } = JSON.parse(
    locked.text,
  ) as { lock_handle: string; state_handle: string };

  const opened = await s.call('SessionOpen', { state_handle: stateHandle });
  assert.equal(opened.isError, false);
  assert.equal(handleOf(opened.text), stateHandle);
  assert.equal(poolSize(), 1);

  const unlocked = await s.call('HandlerLock', {
    action: 'unlock',
    ...LOCK,
    lock_handle: lockHandle,
    state_handle: stateHandle,
  });
  assert.equal(unlocked.isError, false);
  const lockSession = s.standIn.requests.find((r) =>
    r.url.includes('_action=LOCK'),
  )?.session;
  const unlockSession = s.standIn.requests.find((r) =>
    r.url.includes('_action=UNLOCK'),
  )?.session;
  assert.equal(unlockSession, lockSession);

  // The lock is gone, the long session is not: the instance stays.
  await turns(20);
  assert.equal(poolSize(), 1);
  const after = await s.call('ProbeAdt', {
    id: 'x',
    state_handle: stateHandle,
  });
  assert.equal(after.isError, false);
  assert.equal(probes()[0]?.session, lockSession);
  assert.equal(s.standIn.logoffs(), 0);
  await until(() => poolSize() === 1);
});
