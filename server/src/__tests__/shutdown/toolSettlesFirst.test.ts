/**
 * RF4, stdio (spec §6.4, §14.5, D55): a tool whose `UNLOCK` is still to come
 * — its update held at the stand-in, no provider call in flight — and a store
 * whose flush completes at once. On `SIGTERM` (and on stdin's `end`: the
 * consumer closed the transport) the tool is not aborted: the `UNLOCK` is
 * authorized and lands before exit, exit `0`, in this order — settlement,
 * the instance close with its logoff, the gate closed, the drain, the flush.
 * A release that needs a refresh during the wait is authorized; one that
 * would need an interactive login is refused with the shutdown sentence.
 * (The full and the compact tool set: the A7 parity suite.)
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { ProviderGate } from '../../auth/countedProvider';
import { SHUTDOWN_SENTENCE } from '../../auth/serverSentences';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

/** What happened, in order: the tool's end, the logoff, the gate, the drain, the flush. */
async function observe(stand_: Stand) {
  const order: string[] = [];
  const close = ProviderGate.prototype.close;
  jest.spyOn(ProviderGate.prototype, 'close').mockImplementation(function (
    this: ProviderGate,
  ) {
    // The terminal close ran before: no connection the server owns is left.
    if (ownedConnections().length === 0) order.push('logged off');
    order.push('gate closed');
    close.call(this);
  });
  const drained = ProviderGate.prototype.drained;
  jest.spyOn(ProviderGate.prototype, 'drained').mockImplementation(function (
    this: ProviderGate,
    signal?: AbortSignal,
  ) {
    order.push('drain');
    return drained.call(this, signal);
  });
  const broker = await stand_.factory.getBroker('default');
  jest.spyOn(broker, 'flush').mockImplementation(async () => {
    order.push('flush');
  });
  return order;
}

it.each([
  ['SIGTERM', (st: Stand) => st.processLike.emit('SIGTERM')],
  ['stdin end', (st: Stand) => st.processLike.stdin.emit('end')],
])(
  '%s: the UNLOCK lands before exit 0; settlement, logoff, gate, drain, flush',
  async (_name, trigger) => {
    s = await stand({ shutdown: {} });
    const order = await observe(s);
    const hold = s.adt.hold((r) => isUpdateOf('A')(r.url));
    const answered = s.callTool('LockedUpdate', { id: 'A' }).then((r) => {
      order.push('settled');
      return r;
    });
    await hold.arrived;
    trigger(s);
    await turns(20);
    expect(s.exits).toEqual([]);

    hold.release();
    expect(await s.exited).toBe(0);
    expect(await answered).toEqual({ text: 'A', isError: false });
    const unlock = s.adt.requests.findIndex((r) => isUnlockOf('A')(r.url));
    expect(unlock).toBeGreaterThan(0);
    await until(() => s.adt.logoffs() === 1);
    expect(s.adt.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
      unlock,
    );
    expect(order).toEqual([
      'settled',
      'logged off',
      'gate closed',
      'drain',
      'flush',
    ]);
    expect(s.shutdownLines).toEqual([]);
  },
);

it('a release that needs a refresh during the wait is authorized', async () => {
  s = await stand({ auth: 'jwt', shutdown: {} });
  // A first call logs in.
  expect(await s.callTool('ProbeAdt', { id: 'login' })).toMatchObject({
    isError: false,
  });
  const hold = s.adt.hold((r) => isUpdateOf('A')(r.url));
  const answered = s.callTool('LockedUpdate', { id: 'A' });
  await hold.arrived;
  // The UNLOCK meets a 401 once: the provider refreshes, the UNLOCK is resent.
  s.adt.answerOnce((r) => isUnlockOf('A')(r.url), 401);
  s.processLike.emit('SIGTERM');
  hold.release();
  expect(await s.exited).toBe(0);
  expect(await answered).toEqual({ text: 'A', isError: false });
  expect(s.tokens.grants).toEqual(['authorization_code', 'refresh_token']);
  expect(s.adt.requests.filter((r) => isUnlockOf('A')(r.url)).length).toBe(2);
});

it('a release that would need an interactive login is refused with the shutdown sentence', async () => {
  s = await stand({ auth: 'jwt', shutdown: {} });
  expect(await s.callTool('ProbeAdt', { id: 'login' })).toMatchObject({
    isError: false,
  });
  s.tokens.refuseRefresh(true);
  const logins = s.browser.ports.length;
  // The probe sends after a pause: by then the shutdown began.
  const answered = s.callTool('ProbeAdt', { id: 'late', delayMs: 200 });
  await until(() => s.active() === 1);
  s.adt.answer((r) => r.url.includes('/probe/late'), 401);
  s.processLike.emit('SIGTERM');
  const result = await answered;
  expect(result).not.toBe('cancelled');
  const { text, isError } = result as { text: string; isError: boolean };
  expect(isError).toBe(true);
  expect(JSON.parse(text)).toMatchObject({
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  // No login was started: the browser never opened again.
  expect(s.browser.ports).toHaveLength(logins);
  expect(await s.exited).toBe(0);
});
