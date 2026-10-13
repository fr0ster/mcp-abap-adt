/**
 * RF9 and the pool's eviction (spec §3.8, §6.4, §14.5, ruling 16): a tool on
 * a pooled instance (held state, `state_handle`) holds its `UNLOCK` at the
 * stand-in when `SIGTERM` arrives — it runs to its end, the `UNLOCK` lands,
 * and only then the pool's shutdown disposes the instance, its connections
 * logged off; a `tools/call` with that handle arriving after the latch
 * reaches no tool; a state that cannot be undone exits `1` naming the
 * instance by its ordinal, never the handle — and its connections are still
 * logged off. An instance emptied by its stop tool, or evicted by the idle
 * bound (fake time), has its connections disconnected — the bound's stop
 * also when its undo fails.
 */

import {
  isUnlockOf,
  listenUrl,
  stopUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import {
  basicHeaders,
  type HttpStand,
  halfPost,
  httpStand,
  turns,
  until,
} from './harness';

jest.setTimeout(30_000);

let s: HttpStand;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  jest.useRealTimers();
  await s.close();
  errorSpy.mockRestore();
});

const connects = () =>
  s.standIn.requests.filter((r) => r.url.includes('discovery')).length;
const indexOfStop = (id: string) =>
  s.standIn.requests.findIndex((r) => r.url.startsWith(stopUrl(id)));

it("a pooled instance's tool runs to its end before the pool's shutdown disposes it; a late call with its handle reaches no tool", async () => {
  s = await httpStand();
  const held = await s.call('HoldState', { id: 'P' });
  const handle = held.text;
  const hold = s.standIn.hold((r) => isUnlockOf('P1')(r.url));
  const running = s.call('LockedUpdate', { id: 'P1', state_handle: handle });
  await hold.arrived;

  // A call with the handle, accepted before the latch, its body after it.
  const late = halfPost(s.port, basicHeaders(s.standIn.url), 'LockedUpdate', {
    id: 'LATE',
    state_handle: handle,
  });
  await late.sent;
  await new Promise((r) => setTimeout(r, 100));
  s.processLike.emit('SIGTERM');
  expect((await late.finish()).status).toBe(503);
  await turns(20);
  // The instance is not disposed while its tool runs.
  expect(indexOfStop('P')).toBe(-1);

  hold.release();
  expect(await s.exited).toBe(0);
  expect((await running).text).toBe('P1');
  expect(indexOfStop('P')).toBeGreaterThan(s.indexOf(isUnlockOf('P1')));
  expect(s.standIn.requests.some((r) => r.url.includes('LATE'))).toBe(false);
  expect(ownedConnections()).toEqual([]);
  await until(() => s.standIn.logoffs() === connects());
});

it('a state that cannot be undone: exit 1 naming the instance by its ordinal, never the handle; its connections are still logged off', async () => {
  s = await httpStand();
  const held = await s.call('HoldState', { id: 'P' });
  s.standIn.answer((r) => r.url.startsWith(stopUrl('P')), 500);
  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(1);
  expect(s.stderr).toEqual([
    expect.stringMatching(
      /^\[MCP\] State not undone at shutdown: instance \d+: the debugger stop was refused$/,
    ),
  ]);
  expect(s.stderr.join('\n')).not.toContain(held.text);
  expect(ownedConnections()).toEqual([]);
  await until(() => s.standIn.logoffs() === connects());
});

it('an instance emptied by its stop tool leaves the pool with its connections disconnected', async () => {
  s = await httpStand();
  const held = await s.call('HoldState', { id: 'P' });
  const stopped = await s.call('StopState', { state_handle: held.text });
  expect(stopped).toMatchObject({ text: 'stopped', isError: false });
  await until(() => ownedConnections().length === 0);
  await until(() => s.standIn.logoffs() === connects());
  expect(s.standIn.logoffs()).toBeGreaterThanOrEqual(3);
});

describe('the idle bound (fake time)', () => {
  it('an instance evicted by the idle bound has its connections disconnected', async () => {
    s = await httpStand({ stateIdleMinutes: 30 });
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    await s.call('HoldState', { id: 'P' });
    jest.advanceTimersByTime(30 * 60_000);
    jest.useRealTimers();
    await until(() => indexOfStop('P') >= 0);
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connects());
  });

  it("the bound's stop whose undo fails: reported on the state logger, every connection still logged off", async () => {
    s = await httpStand({ stateIdleMinutes: 30 });
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    await s.call('HoldState', { id: 'P' });
    s.standIn.answer((r) => r.url.startsWith(stopUrl('P')), 500);
    jest.advanceTimersByTime(30 * 60_000);
    jest.useRealTimers();
    await until(() => s.stateErrors.length > 0);
    expect(s.stateErrors.join('\n')).toContain('the debugger stop was refused');
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connects());
    // The listen went out on the state's own connection, which is logged off too.
    expect(
      s.standIn.requests.some((r) => r.url.startsWith(listenUrl('P'))),
    ).toBe(true);
  });
});
