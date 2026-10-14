/**
 * RF9 and the pool's eviction (spec §3.8, §6.4, §14.5, ruling 16): a tool on
 * a pooled instance (held state, `state_handle`) has its update held at the
 * stand-in when `SIGTERM` arrives — the instance's connections, its own and
 * its held state's, are logged off at once, the tool is not awaited, no
 * state undo is sent (the logoff ends the state), exit `0`; a `tools/call`
 * with that handle arriving after the latch reaches no tool. An instance
 * emptied by its stop tool, or evicted by the idle bound (fake time), has
 * its connections disconnected — the bound's stop also when its undo fails.
 */

import {
  isUnlockOf,
  isUpdateOf,
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
/** How many instances the server's pool holds. */
const poolSize = () =>
  (s.mcp as unknown as { pool: { size(): number } }).pool.size();
const indexOfStop = (id: string) =>
  s.standIn.requests.findIndex((r) => r.url.startsWith(stopUrl(id)));

it("SIGTERM: a pooled instance's connections — its own and its held state's — are logged off at once under its held tool; no undo is sent; a late call with its handle reaches no tool", async () => {
  s = await httpStand();
  const held = await s.call('HoldState', { id: 'P' });
  const handle = held.text;
  const hold = s.standIn.hold((r) => isUpdateOf('P1')(r.url));
  void s
    .call('LockedUpdate', { id: 'P1', state_handle: handle })
    .catch(() => undefined);
  await hold.arrived;

  // A call with the handle, accepted before the latch, its body after it.
  const late = halfPost(s.port, basicHeaders(s.standIn.url), 'LockedUpdate', {
    id: 'LATE',
    state_handle: handle,
  });
  await late.sent;
  await new Promise((r) => setTimeout(r, 100));
  s.processLike.emit('SIGTERM');
  const finished = late.finish();
  expect(await s.exited).toBe(0);
  expect((await finished).status).toBe(503);
  expect(ownedConnections()).toEqual([]);
  // Every connection opened (the request's own and its state's): logged off.
  await until(() => s.standIn.logoffs() === connects());
  expect(s.standIn.logoffs()).toBeGreaterThanOrEqual(2);
  // The logoff ended the state: no debugger stop, no state line.
  expect(indexOfStop('P')).toBe(-1);
  expect(s.stderr).toEqual([]);
  expect(s.stderr.join('\n')).not.toContain(handle);

  hold.release();
  await turns(20);
  expect(s.indexOf(isUnlockOf('P1'))).toBe(-1);
  expect(s.standIn.requests.some((r) => r.url.includes('LATE'))).toBe(false);
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
  it('an instance evicted by the idle bound has its connections disconnected and leaves the pool: its handle reaches it no more', async () => {
    s = await httpStand({ stateIdleMinutes: 30 });
    jest.useFakeTimers({
      advanceTimers: true,
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    const held = await s.call('HoldState', { id: 'P' });
    expect(poolSize()).toBe(1);
    jest.advanceTimersByTime(30 * 60_000);
    jest.useRealTimers();
    await until(() => indexOfStop('P') >= 0);
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connects());
    await until(() => poolSize() === 0);
    // The handle now reaches a new instance, which holds no such state.
    const stopped = await s.call('StopState', { state_handle: held.text });
    expect(stopped.isError).toBe(true);
    expect(stopped.text).not.toBe('stopped');
    // No second stop: the evicted instance's state was not reached again.
    expect(
      s.standIn.requests.filter((r) => r.url.startsWith(stopUrl('P'))),
    ).toHaveLength(1);
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
