/**
 * The forced close, core: the logoffs went out at the
 * start — a tool's update held at the stand-in for ever, interrupted, its
 * connections logged off — and the session writes are held; then a second
 * `SIGTERM` (and separately `--shutdown-timeout=1`): no further wait, every
 * owned connection logged off once — the instance's own and its held
 * state's — and the process exits `1` naming the tool still running and the
 * step it cut short.
 *
 * The shutdown timeout's timer is the test's to fire, not the clock's: the
 * timer the shutdown sets with the timeout's delay is taken (the real
 * `setTimeout` answers every other call), and the test fires it once it has
 * seen that nothing exited before it. On real time a slow runner let the
 * timeout fire before that check (CI, ubuntu / Node 24, measured once).
 */

import { isUpdateOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import {
  type Deferred,
  deferred,
  type Stand,
  stand,
  turns,
  until,
} from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;
let written: Deferred<void>;

beforeEach(() => {
  written = deferred<void>();
});

afterEach(async () => {
  written.resolve();
  jest.restoreAllMocks();
  await s.close();
});

it.each([
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
])(
  '%s: every owned connection logged off once, exit 1 naming the request and the step',
  async (_name, timeoutMs) => {
    s = await stand({
      kind: 'onprem',
      shutdown: timeoutMs === undefined ? {} : { timeoutMs },
    });
    expect(await s.callTool('HoldState', { id: 'S' })).toMatchObject({
      isError: false,
    });
    // The session writes never finish on their own.
    const broker = await s.factory.getBroker('default');
    jest.spyOn(broker, 'flush').mockImplementation(() => written.promise);
    s.adt.hold((r) => isUpdateOf('A')(r.url));
    void s.callTool('LockedUpdate', { id: 'A' });
    await until(() => s.adt.requests.some((r) => isUpdateOf('A')(r.url)));

    // The shutdown's own timer, taken when it is set, fired by the test.
    let fire: (() => void) | undefined;
    if (timeoutMs !== undefined) {
      const real = globalThis.setTimeout;
      const timers = jest
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback, ms) => {
          if (ms !== timeoutMs || fire !== undefined) return real(callback, ms);
          fire = () => callback();
          timers.mockRestore();
          // A handle the shutdown may clear; it fires nothing of its own.
          return real(() => undefined, 0);
        });
    }
    s.processLike.emit('SIGTERM');
    await until(() => s.adt.logoffs() === 2);
    await turns(20);
    expect(s.exits).toEqual([]);
    if (timeoutMs === undefined) s.processLike.emit('SIGTERM');
    else {
      expect(fire).toBeDefined();
      fire?.();
    }
    expect(await s.exited).toBe(1);
    expect(s.shutdownLines).toEqual([
      '[MCP] Still running at the forced close: LockedUpdate',
      '[MCP] Not finished at the forced close: the session writes',
    ]);
    expect(ownedConnections()).toEqual([]);
    const connects = () =>
      s.adt.requests.filter((r) => r.url.includes('discovery')).length;
    // The instance's connection and the state's own: two logoffs, once each.
    expect(s.adt.logoffs()).toBe(connects());
    expect(s.adt.logoffs()).toBe(2);
  },
);
