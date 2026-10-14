/**
 * Held state and its logoff (spec §6.4, §14.5): a held state whose undo
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

import { httpStand } from '../../../../http/src/__tests__/shutdown/harness';
import { stand as coreStand } from '../../../../server/src/__tests__/helpers/loginStand';
import { sseStand } from '../../../../sse/src/__tests__/shutdown/harness';
import { ownedConnections } from '../../../lib/ownedConnections';
import { stopUrl } from '../../helpers/shutdownTools';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

jest.setTimeout(30_000);

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
  requests.filter((r) => r.url.includes('discovery')).length;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('core, at shutdown: no undo sent, every connection logged off, exit 0', async () => {
  const s = await coreStand({ shutdown: {} });
  try {
    expect(await s.callTool('HoldState', { id: 'S' })).toMatchObject({
      isError: false,
    });
    refusesStop(s.adt);
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    expect(s.shutdownLines).toEqual([]);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.adt.logoffs() === connectsOf(s.adt.requests));
    expect(s.adt.logoffs()).toBe(2);
    expect(stopSent(s.adt.requests)).toBe(false);
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
    expect(await s.exited).toBe(0);
    expect(s.stderr).toEqual([]);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === connectsOf(s.standIn.requests));
    expect(stopSent(s.standIn.requests)).toBe(false);
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
    expect(stopped.isError).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(ownedConnections().length).toBeGreaterThan(0);
    const before = s.standIn.logoffs();
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === connectsOf(s.standIn.requests));
    expect(s.standIn.logoffs()).toBeGreaterThan(before);
  } finally {
    await s.close();
  }
});

it("http, at the idle bound's stop: a state-logger line, every connection logged off", async () => {
  const s = await httpStand({ stateIdleMinutes: 30 });
  try {
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    await s.call('HoldState', { id: 'S' });
    refusesStop(s.standIn);
    jest.advanceTimersByTime(30 * 60_000);
    jest.useRealTimers();
    await until(() => s.stateErrors.length > 0);
    expect(s.stateErrors.join('\n')).toContain('the debugger stop was refused');
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
    expect(await s.exited).toBe(0);
    expect(s.stderr).toEqual([]);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === s.connects());
    expect(s.standIn.logoffs()).toBe(2);
    expect(stopSent(s.standIn.requests)).toBe(false);
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
    expect(s.standIn.logoffs()).toBe(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.stateErrors).toEqual([]);
    expect(stopSent(s.standIn.requests)).toBe(false);
  } finally {
    await s.close();
  }
});
