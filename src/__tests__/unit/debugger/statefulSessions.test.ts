/**
 * Only what needs a stateful ABAP session gets one, and each is closed once.
 * The ABAP debugger: the listener and the attach (SAP's design), and the
 * breakpoints' connection; the program's run goes on a stateless connection
 * (measured 2026-10-17: runs on a stateless connection are caught and held
 * as on a stateful one). The AMDP debugger: its events and commands
 * connections; the run stateless. A stop deletes the breakpoints — the
 * listener's stop — before it lets a held debuggee run on, so a continue
 * from a breakpoint in a loop runs to the end instead of stopping there
 * again.
 */
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { okResponse } from '../../helpers/fakeClient';
import {
  AMDP_BREAK,
  AMDP_START,
  AMDP_STOPPED,
  AMDP_SYNCED,
  amdpEnd,
  deferred,
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  START,
  until,
} from './fakes';

describe('stateful sessions of a debug run', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ABAP: the breakpoints, the listener and the attach stateful, the run stateless; each closed once; the listener stopped before the debuggee is let go', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', {
      ...START,
      run: { kind: 'class', name: 'ZCL_A' },
    });
    await until(() => world.polls.length === 1);
    world.polls[0]?.resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1]?.resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    await session.stop();

    const kinds = (kind: string) =>
      world.sessionKinds.filter((k) => k === kind).length;
    expect(kinds('stateful')).toBe(3); // breakpoints, listener, attach
    expect(kinds('stateless')).toBe(1); // the run
    expect(world.sessionKinds).toHaveLength(world.opened.length);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(world.closed).toHaveLength(world.opened.length);

    const stopAt = world.calls.indexOf('stopListener');
    const releaseAt = world.calls.lastIndexOf('step:stepContinue:analysed');
    expect(stopAt).toBeGreaterThanOrEqual(0);
    expect(releaseAt).toBeGreaterThan(stopAt);
  });

  it('AMDP: the events and the commands connection stateful, the run stateless; each closed once', async () => {
    const reads: Array<ReturnType<typeof deferred<any>>> = [];
    const opened: Array<{ session: string }> = [];
    const closed: unknown[] = [];
    const dbg = {
      start: async () => okResponse(AMDP_START),
      getEvents: () => {
        const d = deferred<any>();
        reads.push(d);
        return d.promise;
      },
      syncBreakpoints: async () => okResponse({ headers: { location: 'Q1' } }),
      // As the system does: a cancel ends the debuggee and its run.
      deleteDebuggee: async (_m: string, d: string) => {
        for (const r of reads) r.resolve(okResponse(amdpEnd(d)));
        run.resolve({ ok: false, message: 'cancelled' });
        return okResponse({});
      },
      stop: async () => {
        for (const r of reads) r.resolve(okResponse(AMDP_STOPPED));
        return okResponse({});
      },
    };
    const run = deferred<any>();
    const session = new AmdpSession({
      openConnection: async (_o, kind = 'stateful') => {
        const c = { session: kind };
        opened.push(c);
        return c as never;
      },
      closeConnection: async (c) => {
        closed.push(c);
      },
      amdpDebugger: () => dbg as never,
      requestUser: async () => 'SAPUSER01',
      run: async () => run.promise,
    }).bind('origin');
    const s = session.start({
      stopExisting: false,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      run: { kind: 'class', name: 'ZCL_A' },
    });
    await until(() => reads.length === 1);
    reads[0]?.resolve(okResponse(AMDP_SYNCED('Q1')));
    await s;
    await until(() => reads.length === 2 && opened.length === 3);
    reads[1]?.resolve(okResponse(AMDP_BREAK));
    await until(() => reads.length === 3);
    await session.stop();

    expect(opened.map((c) => c.session)).toEqual([
      'stateful',
      'stateful',
      'stateless',
    ]);
    expect(new Set(closed)).toEqual(new Set(opened));
    expect(closed).toHaveLength(opened.length);
  });
});
