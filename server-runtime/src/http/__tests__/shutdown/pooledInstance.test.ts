/**
 * The pool's eviction: a tool on
 * a pooled instance (held state, `state_handle`) has its update held at the
 * stand-in when `SIGTERM` arrives — the instance's connections, its own and
 * its held state's, are logged off at once, the tool is not awaited, no
 * state undo is sent (the logoff ends the state), exit `0`; a `tools/call`
 * with that handle arriving after the latch reaches no tool. An instance
 * emptied by its stop tool, or evicted by the idle bound (fake time), has
 * its connections disconnected — the bound's stop also when its undo fails.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import {
  advanceWithRealTime,
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import {
  isUnlockOf,
  isUpdateOf,
  listenUrl,
  stopUrl,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import {
  basicHeaders,
  type HttpStand,
  halfPost,
  httpStand,
  turns,
  until,
} from './harness';

let s: HttpStand;
let restoreError: () => void;

beforeEach(() => {
  const errorSpy = mock.method(console, 'error', () => {});
  restoreError = () => errorSpy.mock.restore();
});

afterEach(async () => {
  useRealTimers();
  await s.close();
  restoreError();
});

/** The idle bound's 30 minutes plus one minute of margin: the fake-time horizon of a call. */
const IDLE_HORIZON = 30 * 60_000 + 60_000;

const connects = () =>
  // The connect's own request, not the keep-alive's discovery ping.
  s.standIn.requests.filter((r) =>
    r.url.startsWith('/sap/bc/adt/core/discovery'),
  ).length;
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
  assert.equal(await s.exited, 0);
  assert.equal((await finished).status, 503);
  assert.deepStrictEqual(ownedConnections(), []);
  // Every connection opened (the request's own and its state's): logged off.
  await until(() => s.standIn.logoffs() === connects());
  assert.ok(s.standIn.logoffs() >= 2);
  // The logoff ended the state: no debugger stop, no state line.
  assert.equal(indexOfStop('P'), -1);
  assert.deepStrictEqual(s.stderr, []);
  assert.ok(!s.stderr.join('\n').includes(handle));

  hold.release();
  await turns(20);
  assert.equal(s.indexOf(isUnlockOf('P1')), -1);
  assert.equal(
    s.standIn.requests.some((r) => r.url.includes('LATE')),
    false,
  );
});

it('an instance emptied by its stop tool leaves the pool with its connections disconnected', async () => {
  s = await httpStand();
  const held = await s.call('HoldState', { id: 'P' });
  const stopped = await s.call('StopState', { state_handle: held.text });
  assertMatchObject(stopped, { text: 'stopped', isError: false });
  await until(() => ownedConnections().length === 0);
  await until(() => s.standIn.logoffs() === connects());
  // The state's own connection and the instance's: the stop's request, of
  // the same credential headers, works on the connection the first built.
  assert.ok(s.standIn.logoffs() >= 2);
});

describe('the idle bound (fake time)', () => {
  it('an instance evicted by the idle bound has its connections disconnected and leaves the pool: its handle reaches it no more', async () => {
    s = await httpStand({ stateIdleMinutes: 30 });
    // Jest's `advanceTimers: true` with setImmediate left real: the call runs
    // over the real HTTP stand while fake time follows it, 1 fake ms per real
    // turn, up to IDLE_HORIZON — past it, an unsettled call fails naming it.
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const held = await advanceWithRealTime(
      s.call('HoldState', { id: 'P' }),
      IDLE_HORIZON,
      1,
    );
    assert.equal(poolSize(), 1);
    mock.timers.tick(30 * 60_000);
    useRealTimers();
    await until(() => indexOfStop('P') >= 0);
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connects());
    await until(() => poolSize() === 0);
    // The handle now reaches a new instance, which holds no such state.
    const stopped = await s.call('StopState', { state_handle: held.text });
    assert.equal(stopped.isError, true);
    assert.notEqual(stopped.text, 'stopped');
    // No second stop: the evicted instance's state was not reached again.
    assert.equal(
      s.standIn.requests.filter((r) => r.url.startsWith(stopUrl('P'))).length,
      1,
    );
  });

  it("the bound's stop whose undo fails: reported on the state logger, every connection still logged off", async () => {
    s = await httpStand({ stateIdleMinutes: 30 });
    // As above: fake time follows the call, up to IDLE_HORIZON.
    useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
    await advanceWithRealTime(
      s.call('HoldState', { id: 'P' }),
      IDLE_HORIZON,
      1,
    );
    s.standIn.answer((r) => r.url.startsWith(stopUrl('P')), 500);
    mock.timers.tick(30 * 60_000);
    useRealTimers();
    await until(() => s.stateErrors.length > 0);
    assert.ok(
      s.stateErrors.join('\n').includes('the debugger stop was refused'),
    );
    await until(() => ownedConnections().length === 0);
    await until(() => s.standIn.logoffs() === connects());
    // The listen went out on the state's own connection, which is logged off too.
    assert.equal(
      s.standIn.requests.some((r) => r.url.startsWith(listenUrl('P'))),
      true,
    );
  });
});
