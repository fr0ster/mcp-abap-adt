/**
 * Every connection an AMDP session opens — the events and the commands
 * connection, a run's — is closed (its logoff) exactly once, on every way the
 * session ends: a stop at a break with a run in flight, a start that fails, a
 * failed event read, a cleanup that fails and is retried, the one-request
 * session's end and stop, the debugger's dispose and the instance's shutdown.
 * Each case counts the connections the ports opened and closed and fails on
 * any difference.
 */
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { InstanceState } from '../../../lib/state/InstanceState';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  AMDP_BREAK,
  AMDP_START,
  AMDP_STOPPED,
  AMDP_SYNCED,
  amdpEnd,
  deferred,
} from './fakes';

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !cond(); i += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
  if (!cond()) throw new Error('condition never held');
}

function world() {
  const reads: Array<ReturnType<typeof deferred<any>>> = [];
  const opened: object[] = [];
  const closed: object[] = [];
  const run = deferred<any>();
  let syncN = 0;
  const dbg: Record<string, any> = {
    start: async () => okResponse(AMDP_START),
    getEvents: () => {
      const d = deferred<any>();
      reads.push(d);
      return d.promise;
    },
    syncBreakpoints: async () =>
      okResponse({ headers: { location: `Q${++syncN}` } }),
    step: async () => okResponse({ headers: {} }),
    // As the system does: a cancel ends the debuggee — its end event on the
    // open read — and the run that called it returns.
    deleteDebuggee: async (_m: string, d: string) => {
      for (const r of reads) r.resolve(okResponse(amdpEnd(d)));
      run.resolve({ ok: false, message: 'cancelled' });
      return okResponse({});
    },
    stop: async () => {
      for (const r of reads) r.resolve(okResponse(AMDP_STOPPED));
      return okResponse({});
    },
    getDataPreview: async () => okResponse(''),
  };
  const session = new AmdpSession({
    openConnection: async () => {
      const c = { n: opened.length };
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
  /** Each connection opened is closed, once. */
  const balanced = () =>
    closed.length === opened.length &&
    opened.every((c) => closed.filter((d) => d === c).length === 1);
  return { session, reads, opened, closed, dbg, run, balanced };
}

/** Started, stopped at a break, its run in flight. */
async function atBreak(w = world()) {
  const s = w.session.start({
    stopExisting: false,
    breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    run: { kind: 'class', name: 'ZCL_A' },
  });
  await until(() => w.reads.length === 1);
  w.reads[0]?.resolve(okResponse(AMDP_SYNCED('Q1')));
  await s;
  await until(() => w.reads.length === 2 && w.opened.length === 3);
  w.reads[1]?.resolve(okResponse(AMDP_BREAK));
  await until(() => w.reads.length === 3);
  return w;
}

describe('every connection an AMDP session opens is closed once', () => {
  it('a stop at a break with a run in flight: events, commands and the run', async () => {
    const w = await atBreak();
    await w.session.stop();
    expect(w.opened).toHaveLength(3);
    expect(w.balanced()).toBe(true);
    expect(w.session.holdsState()).toBe(false);
  });

  it('a run that ends after the stop closes nothing twice', async () => {
    const w = await atBreak();
    await w.session.stop();
    w.run.resolve({ ok: true, output: '' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(w.balanced()).toBe(true);
  });

  it('a start whose breakpoint sync fails', async () => {
    const w = world();
    // The start's sync refused; the cleanup's clear (an empty list) answered.
    w.dbg.syncBreakpoints = async (_m: string, b: unknown[]) =>
      b.length ? refusedResponse('no sync') : okResponse({});
    await expect(
      w.session.start({
        stopExisting: false,
        breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      }),
    ).rejects.toThrow();
    await until(() => w.balanced());
    expect(w.opened).toHaveLength(2);
    expect(w.session.holdsState()).toBe(false);
  });

  it('a start whose start request fails', async () => {
    const w = world();
    w.dbg.start = async () => refusedResponse('DEBUGGEE_CONTEXT_LOCKED_BY_ME');
    await expect(
      w.session.start({ stopExisting: false, breakpoints: [] }),
    ).rejects.toThrow();
    expect(w.opened).toHaveLength(2);
    expect(w.balanced()).toBe(true);
  });

  it('a failed event read, then the stop', async () => {
    const w = await atBreak();
    w.reads[2]?.resolve(refusedResponse('read broke'));
    await until(() => w.closed.length >= 2);
    await w.session.wait(0).catch(() => undefined);
    await w.session.stop().catch(() => undefined);
    expect(w.balanced()).toBe(true);
  });

  it('a cleanup that fails keeps the connections, and the next stop closes them', async () => {
    const w = await atBreak();
    const stop = w.dbg.stop;
    w.dbg.stop = async () => refusedResponse('not stopped');
    await expect(w.session.stop()).rejects.toThrow();
    expect(w.closed.filter((c) => c !== w.opened[2])).toHaveLength(0);
    w.dbg.stop = stop;
    await w.session.stop();
    expect(w.balanced()).toBe(true);
  });

  it('the one-request session: its end, and its stop', async () => {
    const ended = world();
    await ended.session.startOnce(false);
    await ended.session.endOnce();
    expect(ended.opened).toHaveLength(2);
    expect(ended.balanced()).toBe(true);

    const stopped = world();
    await stopped.session.startOnce(false);
    await stopped.session.stop();
    expect(stopped.opened).toHaveLength(2);
    expect(stopped.balanced()).toBe(true);
  });

  it("the debugger's dispose and the instance's shutdown", async () => {
    for (const end of ['dispose', 'shutdown'] as const) {
      const w = await atBreak();
      const abap = {
        holdsState: () => false,
        pending: () => false,
        failures: () => [],
        bind() {
          return this;
        },
        observe() {},
        stop: async () => undefined,
      } as never;
      const instance = new DebuggerInstance({
        abap,
        amdp: w.session as never,
      });
      if (end === 'dispose') {
        await instance.dispose();
      } else {
        const state = new InstanceState();
        state.attach(instance);
        expect(await state.shutdown()).toEqual([]);
      }
      expect(w.balanced()).toBe(true);
    }
  });
});
