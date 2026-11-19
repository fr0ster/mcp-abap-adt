/**
 * Held state and its logoff: a held state whose undo
 * would fail every time — the stand-in refuses the debugger stop.
 *
 * - At shutdown (core, http, sse) and at an SSE close no undo is sent: the
 *   logoff of every connection the instance owns, the state's own included,
 *   ends the state; exit `0`, no line.
 * - When the pool would let its instance go, and at the idle bound's stop,
 *   the undo runs; its failure is reported (a state-logger line), and every
 *   connection is still logged off — a failed undo never keeps a session,
 *   or a lock, open.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { httpStand } from '../../../../server-runtime/src/http/__tests__/shutdown/harness';
import { sseStand } from '../../../../server-runtime/src/sse/__tests__/shutdown/harness';
import { stand as coreStand } from '../../../../server-runtime/src/stdio/__tests__/helpers/loginStand';
import { ownedConnections } from '../../../lib/ownedConnections';
import { assertMatchObject } from '../../helpers/assertions';
import {
  advanceWithRealTime,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import { stopUrl } from '../../helpers/shutdownTools';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

async function until(done: () => boolean, limitMs = 10_000) {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((r) => setTimeout(r, 2));
  }
}

const refusesStop = (standIn: {
  answer(m: (r: { url: string }) => boolean, s: number): void;
}) => standIn.answer((r) => r.url.includes(stopUrl('')), 500);

const stopSent = (requests: Array<{ url: string }>) =>
  requests.some((r) => r.url.includes(stopUrl('')));

const connectsOf = (requests: Array<{ url: string }>) =>
  // The connect's own request, not the keep-alive's discovery ping.
  requests.filter((r) => r.url.startsWith('/sap/bc/adt/core/discovery')).length;

beforeEach(() => {
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  useRealTimers();
  mock.restoreAll();
});

it('core, at shutdown: no undo sent, every connection logged off, exit 0', async () => {
  const s = await coreStand({ kind: 'onprem', shutdown: {} });
  try {
    assertMatchObject(await s.callTool('HoldState', { id: 'S' }), {
      isError: false,
    });
    refusesStop(s.adt);
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    assert.deepStrictEqual(s.shutdownLines, []);
    assert.deepStrictEqual(ownedConnections(), []);
    await until(() => s.adt.logoffs() === connectsOf(s.adt.requests));
    assert.equal(s.adt.logoffs(), 2);
    assert.equal(stopSent(s.adt.requests), false);
  } finally {
    await s.close();
  }
});

it('http, at shutdown: no undo sent, every connection logged off, exit 0', async () => {
  const s = await httpStand();
  try {
    await s.call('HoldState', { id: 'S' });
    refusesStop(s.standIn);
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    assert.deepStrictEqual(s.stderr, []);
    assert.deepStrictEqual(ownedConnections(), []);
    await until(() => s.standIn.logoffs() === connectsOf(s.standIn.requests));
    assert.equal(stopSent(s.standIn.requests), false);
  } finally {
    await s.close();
  }
});

it('http, a failed undo when the pool would let the instance go: kept for a retry with its sessions open, then logged off once at shutdown', async () => {
  const s = await httpStand();
  try {
    const held = await s.call('HoldState', { id: 'S' });
    refusesStop(s.standIn);
    // Its stop tool: the undo fails, so the instance has not left the pool.
    const stopped = await s.call('StopState', { state_handle: held.text });
    assert.equal(stopped.isError, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(ownedConnections().length > 0);
    const before = s.standIn.logoffs();
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    assert.deepStrictEqual(ownedConnections(), []);
    await until(() => s.standIn.logoffs() === connectsOf(s.standIn.requests));
    assert.ok(s.standIn.logoffs() > before);
  } finally {
    await s.close();
  }
});

it("http, at the idle bound's stop: a state-logger line, every connection logged off", async () => {
  const s = await httpStand({ stateIdleMinutes: 30 });
  try {
    // Jest's `advanceTimers: true` with setImmediate left real: the call runs
    // over the real HTTP stand while fake time follows it, 1 fake ms per real
    // turn, up to a horizon of the idle bound's 30 minutes plus one minute of
    // margin — past it, an unsettled call fails naming the horizon.
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
    await advanceWithRealTime(
      s.call('HoldState', { id: 'S' }),
      30 * 60_000 + 60_000,
      1,
    );
    refusesStop(s.standIn);
    mock.timers.tick(30 * 60_000);
    useRealTimers();
    await until(() => s.stateErrors.length > 0);
    assert.ok(
      s.stateErrors.join('\n').includes('the debugger stop was refused'),
    );
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connectsOf(s.standIn.requests));
  } finally {
    await s.close();
  }
});

it('sse, at shutdown: no undo sent, every connection logged off, exit 0', async () => {
  const s = await sseStand();
  try {
    const connection = await s.open();
    await connection.call('HoldState', { id: 'S' }, 1);
    await connection.answer(1);
    refusesStop(s.standIn);
    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    assert.deepStrictEqual(s.stderr, []);
    assert.deepStrictEqual(ownedConnections(), []);
    await until(() => s.standIn.logoffs() === s.connects());
    assert.equal(s.standIn.logoffs(), 2);
    assert.equal(stopSent(s.standIn.requests), false);
  } finally {
    await s.close();
  }
});

it('sse, at an SSE close: no undo sent, every connection logged off, no line', async () => {
  const s = await sseStand();
  try {
    const connection = await s.open();
    await connection.call('HoldState', { id: 'S' }, 1);
    await connection.answer(1);
    refusesStop(s.standIn);
    connection.close();
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === s.connects());
    assert.equal(s.standIn.logoffs(), 2);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(s.stateErrors, []);
    assert.equal(stopSent(s.standIn.requests), false);
  } finally {
    await s.close();
  }
});
