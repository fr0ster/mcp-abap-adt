/**
 * An SSE close disposes its instance (spec §6.4, D51), beside main's
 * `sseDispose.test.ts`:
 *
 * - a connection with no tool in flight closes → the instance close ran once
 *   (one `shutdownState()`, its connections disconnected, its MCP server
 *   closed), the session left the map, a later `POST` for its `sessionId`
 *   is answered as an unknown session;
 * - a connection closed while a tool holds a lock (the update held) → the
 *   tool runs to its end (the update, the `UNLOCK`), then the state is shut
 *   down and the connection logged off;
 * - another open connection's tool and instance are untouched.
 */

import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { isLogoff } from '../../../src/__tests__/helpers/adtStandIn';
import {
  isUnlockOf,
  isUpdateOf,
} from '../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './shutdown/harness';

jest.setTimeout(30_000);

let s: SseStand;
let shutdownState: jest.SpyInstance;
let mcpClose: jest.SpyInstance;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  shutdownState = jest.spyOn(BaseMcpServer.prototype, 'shutdownState');
  mcpClose = jest.spyOn(BaseMcpServer.prototype, 'close');
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

const sessions = () =>
  (s.sse as unknown as { sessions: Map<string, unknown> }).sessions;

it('a connection with no tool in flight: the instance close ran once, the session is gone', async () => {
  const connection = await s.open();
  await connection.call('ProbeAdt', { id: 'p1' }, 1);
  await connection.answer(1);
  expect(sessions().has(connection.sessionId)).toBe(true);

  connection.close();
  await until(() => s.standIn.logoffs() === s.connects());
  await until(() => mcpClose.mock.calls.length === 1);
  expect(shutdownState).toHaveBeenCalledTimes(1);
  expect(sessions().has(connection.sessionId)).toBe(false);
  expect(ownedConnections()).toEqual([]);

  const late = await fetch(`http://127.0.0.1:${s.port}${connection.postPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  });
  expect(late.status).toBe(400);
  expect(await late.text()).toBe('Invalid session');
  await turns(10);
  expect(shutdownState).toHaveBeenCalledTimes(1);
});

it('a connection closed while a tool holds a lock: the tool runs to its end, then the state is shut down and the session logged off; another connection is untouched', async () => {
  const closing = await s.open();
  const other = await s.open();
  const holdA = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  const holdB = s.standIn.hold((r) => isUpdateOf('B')(r.url));
  await closing.call('LockedUpdate', { id: 'A' }, 1);
  await other.call('LockedUpdate', { id: 'B' }, 1);
  await Promise.all([holdA.arrived, holdB.arrived]);

  closing.close();
  await turns(20);
  // Its tool still runs: nothing shut down, no logoff.
  expect(shutdownState).not.toHaveBeenCalled();
  expect(s.standIn.logoffs()).toBe(0);

  holdA.release();
  await until(() => shutdownState.mock.calls.length === 1);
  await until(() => s.standIn.logoffs() === 1);
  const unlockA = s.indexOf(isUnlockOf('A'));
  expect(unlockA).toBeGreaterThan(s.indexOf(isUpdateOf('A')));
  expect(s.standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
    unlockA,
  );

  // The other connection: its tool still held, its instance alive.
  expect(s.indexOf(isUnlockOf('B'))).toBe(-1);
  expect(sessions().has(other.sessionId)).toBe(true);
  holdB.release();
  expect(await other.answer(1)).toEqual({ text: 'B', isError: false });
  expect(shutdownState).toHaveBeenCalledTimes(1);
});
