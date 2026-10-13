/**
 * RF6 (spec §6.4, D51): an SSE connection closes while a `POST` for it was
 * already admitted and its body is still arriving. The late call reaches no
 * tool — no request of it reaches the stand-in — and is refused (the
 * session is already gone from the routing map: an unknown session); the
 * instance close ran once and no entry of that instance is left in the
 * registry.
 */

import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import {
  isLockOf,
  isUpdateOf,
} from '../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../src/lib/activeTools';
import {
  halfPost,
  type SseStand,
  sseStand,
  turns,
  until,
} from './shutdown/harness';

jest.setTimeout(30_000);

let s: SseStand;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

it('the POST body completes after the close: refused, nothing sent, one instance close, no registry entry left', async () => {
  const shutdownState = jest.spyOn(BaseMcpServer.prototype, 'shutdownState');
  const connection = await s.open();
  const late = halfPost(
    s.port,
    connection.postPath,
    'LockedUpdate',
    { id: 'LATE' },
    1,
  );
  await late.sent;
  await new Promise((r) => setTimeout(r, 100));
  connection.close();
  await until(() => shutdownState.mock.calls.length === 1);
  const answered = await late.finish();
  expect(answered.status).toBe(400);
  await turns(20);
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
  expect(shutdownState).toHaveBeenCalledTimes(1);
  expect(activeTools()).toEqual([]);
});

it('a message parsed before the close and dispatched after it: refused by the instance latch, before any connection', async () => {
  const connection = await s.open();
  const entry = (
    s.sse as unknown as {
      sessions: Map<
        string,
        {
          transport: { onmessage?: (message: unknown) => void };
        }
      >;
    }
  ).sessions.get(connection.sessionId);
  expect(entry).toBeDefined();
  // A tool runs, so the instance close waits for it: the stream is still open.
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  await connection.call('LockedUpdate', { id: 'A' }, 1);
  await hold.arrived;

  connection.close();
  await turns(10);
  // A message the transport parsed before its stream closed reaches the
  // instance now (the SDK's own POST check refuses once the stream is gone;
  // this is the message already past it).
  entry?.transport.onmessage?.({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'LockedUpdate', arguments: { id: 'LATE' } },
  });
  await turns(20);
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
  hold.release();
  await until(() => activeTools().length === 0);
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
});
