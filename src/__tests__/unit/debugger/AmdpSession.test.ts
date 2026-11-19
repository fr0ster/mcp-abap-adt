import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugCleanupError } from '../../../lib/debugger/DebugSession';
import { runWithRequestSignal } from '../../../lib/requestSignal';
import { payloadCarriedBy } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  advanceTimersByTimeAsync,
  track,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import {
  AMDP_BREAK_LINE,
  AMDP_MAIN_ID,
  AMDP_STOPPED,
  amdpBreak,
  AMDP_BREAK as BREAK,
  deferred,
  AMDP_END as END,
  AMDP_START as START,
  AMDP_SYNCED as SYNCED,
  until,
} from './fakes';

function world() {
  const reads: Array<ReturnType<typeof deferred<any>>> = [];
  const calls: string[] = [];
  const closed: unknown[] = [];
  const dropped: unknown[] = [];
  const run = deferred<any>();
  let syncN = 0;
  /** The system's answer to an accepted stop: the open event read ends with STOP. Off, a test answers it. */
  const sim = { stopAnswersRead: true };
  const dbg = {
    start: async (u: string, o: any) => {
      calls.push(`start:${u}:${o.stopExisting}`);
      return okResponse(START);
    },
    getEvents: () => {
      const d = deferred<any>();
      reads.push(d);
      return d.promise;
    },
    syncBreakpoints: async (_m: string, b: any[]) => {
      calls.push(`sync:${b.length}`);
      return okResponse({ headers: { location: `Q${++syncN}` } }); // a bare id, as the system answers a sync
    },
    step: async (_m: string, d: string, s: string) => {
      calls.push(`step:${d}:${s}`);
      return okResponse({ headers: {} });
    },
    deleteDebuggee: async (_m: string, d: string) => {
      calls.push(`delete:${d}`);
      return okResponse({});
    },
    stop: async () => {
      calls.push('stop');
      // As the system does: an accepted stop answers the open event read with STOP.
      if (sim.stopAnswersRead)
        for (const r of reads) r.resolve(okResponse(AMDP_STOPPED));
      return okResponse({});
    },
    getDataPreview: async (o: any) => {
      calls.push(`preview:${o.variableName}:${o.debuggeeId}`);
      return okResponse(corpusBody('amdp-debugger--08-data-preview-table'));
    },
  };
  let opened = 0;
  const session = new AmdpSession<string>({
    openConnection: async () => ({ n: opened++ }) as any,
    closeConnection: async (c) => {
      closed.push(c);
    },
    dropConnection: (c) => {
      dropped.push(c);
    },
    amdpDebugger: () => dbg as any,
    requestUser: async () => 'SAPUSER01',
    run: async () => {
      calls.push('run');
      return run.promise;
    },
  }).bind('origin');
  /** The request id the next sync will be answered with. */
  const nextSync = () => `Q${syncN + 1}`;
  return { session, reads, calls, closed, dropped, dbg, run, nextSync, sim };
}

/** An ABAP side that holds nothing, for a DebuggerInstance around the AMDP session. */
function idleAbap() {
  return {
    holdsState: () => false,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    observe() {},
    stop: async () => [],
  } as never;
}

describe('AmdpSession', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function started(w = world(), withRun = false) {
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      ...(withRun ? { run: { kind: 'class', name: 'ZCL_A' } as const } : {}),
    });
    await until(() => w.reads.length === 1);
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await s;
    await until(() => w.reads.length === 2);
    return w;
  }

  it('the run starts only after the SYNC_BREAKPOINTS of its sync arrived', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      run: { kind: 'class', name: 'ZCL_A' },
    });
    await until(() => w.reads.length === 1);
    assert.ok(!w.calls.includes('run'));
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    assertMatchObject(await s, {
      mainId: AMDP_MAIN_ID,
      breakpoints: [
        { class_name: 'ZMCP_DBG_AMDP', line: 27, state: 'PENDING' },
        { class_name: 'ZMCP_DBG_AMDP', line: 37, state: 'PENDING' },
      ],
    });
    await until(() => w.calls.includes('run'));
  });

  it("the start answers each breakpoint's state and the system's reason for one it refused", async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [
        { class_name: 'ZMCP_DBG_AMDP', line: 27 },
        { class_name: 'ZMCP_DBG_AMDP', line: 37 },
      ],
    });
    await until(() => w.reads.length === 1);
    const recorded = corpusBody('amdp-debugger--03-events-sync-breakpoints');
    const requestId = /amdpdbg:requestId="([^"]+)"/.exec(recorded)![1];
    w.reads[0].resolve(
      okResponse(
        recorded
          .replace(requestId, 'Q1')
          .replace('amdpdbg:state="PENDING"', 'amdpdbg:state="INVALID"')
          .replace(
            'amdpdbg:errorMessage=""',
            'amdpdbg:errorMessage="No executable statement at this line"',
          ),
      ),
    );
    assertMatchObject(await s, {
      breakpoints: [
        {
          class_name: 'ZMCP_DBG_AMDP',
          line: 27,
          state: 'INVALID',
          errorMessage: 'No executable statement at this line',
        },
        { class_name: 'ZMCP_DBG_AMDP', line: 37, state: 'PENDING' },
      ],
    });
  });

  it('an ON_BREAK arrives through wait; a step addresses its debuggee, then the debuggee is moving', async () => {
    const w = await started();
    const waiting = w.session.wait(30);
    w.reads[1].resolve(okResponse(BREAK));
    assertMatchObject(await waiting, {
      state: 'event',
      events: [{ kind: 'ON_BREAK', line: AMDP_BREAK_LINE }],
    });
    await w.session.step('continue');
    assert.ok(w.calls.includes('step:D1:continue'));
    await assertRejects(w.session.step('over'), /no AMDP debuggee is stopped/);
  });

  it('ON_EXECUTION_END clears the debuggee', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.reads[2].resolve(okResponse(END));
    await until(() => w.reads.length === 4);
    await assertRejects(w.session.getTable('LT_ROWS'), /no AMDP debuggee/);
  });

  it('stop cancels a suspended debuggee and sends the stop only once the debuggee ended — its end event and the run returned — then logs off', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    let done = false;
    const stopping = w.session.stop().then(() => {
      done = true;
    });
    await until(() => w.calls.includes('delete:D1'));
    await advanceTimersByTimeAsync(1000);
    assert.ok(!w.calls.includes('stop')); // the debuggee has not ended yet
    w.reads[2].resolve(okResponse(END)); // ON_EXECUTION_END of D1
    await until(() => w.reads.length === 4);
    await advanceTimersByTimeAsync(1000);
    assert.ok(!w.calls.includes('stop')); // the run has not returned yet
    w.run.resolve({ ok: false, message: 'cancelled' });
    await until(() => w.calls.includes('stop'));
    await stopping;
    assert.equal(done, true);
    const order = ['delete:D1', 'stop'].map((c) => w.calls.indexOf(c));
    assert.ok(order[0] < (order[1] as number));
    assert.equal(w.calls.filter((c) => c === 'delete:D1').length, 1);
    assert.equal(w.closed.length, 3); // events, commands and the run, after the stop
    assert.equal(w.session.holdsState(), false);
  });

  it('a stop whose debuggee never ends holds no other call: a dispose ends the wait, and every connection is logged off', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const first = w.session.stop();
    const firstFailed = assertRejects(
      first,
      /the debuggee D1 had not ended when the stop was sent/,
    );
    await until(() => w.calls.includes('delete:D1'));
    // No end event, no run's return: the session's end is the escape.
    const disposed = new DebuggerInstance({
      abap: idleAbap(),
      amdp: w.session as never,
    }).dispose();
    await until(() => w.calls.includes('stop'));
    await firstFailed;
    await disposed.catch(() => undefined);
    await until(() => w.closed.length === 3); // events, commands, the run
    assert.equal(w.calls.filter((c) => c === 'stop').length, 1);
  });

  it('a dispose at a break whose debuggee never ends: it cancels, waits for nothing, stops, and logs off every connection', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const disposed = new DebuggerInstance({
      abap: idleAbap(),
      amdp: w.session as never,
    })
      .dispose()
      .catch((e: unknown) => e);
    await until(() => w.calls.includes('stop'));
    assert.ok(w.calls.indexOf('delete:D1') < w.calls.indexOf('stop'));
    assert.match(String(await disposed), /the debuggee D1 had not ended/);
    await until(() => w.closed.length === 3);
  });

  it('a second stop while the first waits for the debuggee does not hang: it stops, and both settle', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const first = w.session.stop().catch((e: unknown) => e);
    await until(() => w.calls.includes('delete:D1'));
    const second = w.session.stop().catch((e: unknown) => e);
    await until(() => w.calls.includes('stop'));
    await first;
    await second;
    await until(() => w.closed.length >= 2);
    assert.equal(w.calls.filter((c) => c === 'delete:D1').length, 1);
  });

  it('a refused cancel sends no stop: the stop fails naming the refusal, the session stays, and the next stop cancels, waits for the end, then stops', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const realDelete = w.dbg.deleteDebuggee;
    w.dbg.deleteDebuggee = async (_m: string, d: string) => {
      w.calls.push(`refused-delete:${d}`);
      return refusedResponse('busy');
    };
    await assertRejects(w.session.stop(), /release debuggee D1: busy/);
    assert.ok(!w.calls.includes('stop'));
    assert.equal(w.closed.length, 0);
    assert.equal(w.session.holdsState(), true);
    w.dbg.deleteDebuggee = realDelete;
    const again = w.session.stop();
    await until(() => w.calls.includes('delete:D1'));
    await advanceTimersByTimeAsync(1000);
    assert.ok(!w.calls.includes('stop')); // waits for the end
    w.reads[2].resolve(okResponse(END));
    await until(() => w.reads.length === 4);
    w.run.resolve({ ok: false, message: 'cancelled' });
    await until(() => w.calls.includes('stop'));
    await again;
    assert.equal(w.closed.length, 3);
  });

  it('a stop with no session, then a start queued right behind it: the new session survives the stop', async () => {
    const w = world();
    const stopping = w.session.stop();
    const starting = w.session.start({
      stopExisting: false,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    await until(() => w.reads.length === 1);
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await starting;
    await stopping;
    await advanceTimersByTimeAsync(10);
    assert.ok(!w.calls.includes('stop'));
    assert.equal(w.closed.length, 0);
    assert.equal(w.session.holdsState(), true);
    assertMatchObject(await w.session.wait(0), {
      state: 'waiting',
    });
  });

  it("the stop call's own signal ends the wait for the debuggee: the stop is sent and the answer says the debuggee had not ended", async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const call = new AbortController();
    const stopping = runWithRequestSignal(call.signal, () => w.session.stop());
    const failed = assertRejects(
      stopping,
      /the debuggee D1 had not ended when the stop was sent/,
    );
    await until(() => w.calls.includes('delete:D1'));
    assert.ok(!w.calls.includes('stop'));
    call.abort();
    await until(() => w.calls.includes('stop'));
    await failed;
  });

  it('stop releases a suspended debuggee, waits for its end, then stops, and returns only once the open read answered and its last batch closed everything', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.sim.stopAnswersRead = false;
    let done = false;
    const stopping = w.session.stop().then(() => {
      done = true;
    });
    await until(() => w.calls.includes('delete:D1'));
    w.reads[2].resolve(okResponse(END)); // the cancelled debuggee ended
    await until(() => w.calls.includes('stop'));
    await advanceTimersByTimeAsync(1000);
    assert.equal(done, false); // the system has not answered the read yet
    assert.ok(w.calls.indexOf('delete:D1') < w.calls.indexOf('stop'));
    await until(() => w.reads.length === 4);
    w.reads[3].resolve(okResponse(amdpBreak('D2'))); // a break in the last batch
    await stopping;
    assert.ok(w.calls.includes('delete:D2'));
    assert.equal(w.closed.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  it('a stop the system refused does not wait for the read: it fails at once and is kept for the next stop', async () => {
    const w = await started();
    const realStop = w.dbg.stop;
    w.dbg.stop = async () => {
      w.calls.push('stop');
      return refusedResponse('stop refused');
    };
    await assertRejects(w.session.stop(), /stop: .*stop refused/);
    assert.equal(w.session.holdsState(), true);
    w.dbg.stop = realStop;
    await w.session.stop();
    assert.equal(w.closed.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  // The commands connection spent (the owner's decision), read from the typed
  // verdict alone: the AMDP debug session is gone with its SAP session, and
  // SAP's logoff freed it. Nothing more is sent on it; both connections are
  // dropped without a request, and the stop completes.
  for (const [_name, extra] of [
    ['sessionError ADT_NOT_CONNECTED', { sessionError: 'ADT_NOT_CONNECTED' }],
    ['sessionLost', { sessionLost: 'ADT_SESSION_REPLACED' }],
  ] as const) {
    it(
      format(
        'a stop answered %s: the session is dropped, nothing more is sent, the stop completes',
        _name,
      ),
      async () => {
        const w = await started();
        w.dbg.stop = async () => {
          w.calls.push('stop');
          return refusedResponse('words that are never read', {
            origin: 'connection',
            ...extra,
          });
        };
        assert.equal(await w.session.stop(), undefined);
        assert.equal(w.dropped.length, 2);
        assert.equal(w.closed.length, 0);
        assert.equal(w.session.holdsState(), false);
      },
    );
  }

  it('a cancel answered with a spent connection: no wait, nothing more is sent, the session is dropped', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.dbg.deleteDebuggee = async (_m: string, d: string) => {
      w.calls.push(`spent-delete:${d}`);
      return refusedResponse('words that are never read', {
        origin: 'connection',
        sessionError: 'ADT_SESSION_REPLACED',
      });
    };
    const before = w.calls.length;
    const stopped = w.session.stop();
    w.run.resolve({ ok: false, message: 'ended with its session' });
    assert.equal(await stopped, undefined);
    // The spent cancel is the last call on the commands connection: no
    // breakpoint clear, no second cancel, no stop.
    const after = w.calls.slice(before);
    assert.equal(after.length, 1);
    assert.match(after[0], /^spent-delete:/);
    assert.equal(w.dropped.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  it('a cancel answered with a spent connection while the session is ending: nothing more is sent', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.dbg.deleteDebuggee = async (_m: string, d: string) => {
      w.calls.push(`spent-delete:${d}`);
      return refusedResponse('words that are never read', {
        origin: 'connection',
        sessionError: 'ADT_SESSION_REPLACED',
      });
    };
    w.session.endWaits(); // a dispose, the instance's close
    const before = w.calls.length;
    const stopped = w.session.stop();
    w.run.resolve({ ok: false, message: 'ended with its session' });
    assert.equal(await stopped, undefined);
    const after = w.calls.slice(before);
    assert.equal(after.length, 1);
    assert.match(after[0], /^spent-delete:/);
    assert.equal(w.dropped.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  it('a stop refused with ADT_RELEASE_PENDING is no spent connection: it fails and is kept', async () => {
    const w = await started();
    w.dbg.stop = async () => {
      w.calls.push('stop');
      return refusedResponse('pending', {
        origin: 'connection',
        sessionError: 'ADT_RELEASE_PENDING',
      });
    };
    await assertRejects(w.session.stop(), /stop: .*pending/);
    assert.equal(w.dropped.length, 0);
    assert.equal(w.session.holdsState(), true);
  });

  it('a read the system never answers holds the stopping call only: a second stop, a dispose and a wait go on', async () => {
    const w = await started();
    w.sim.stopAnswersRead = false;
    let first = false;
    const stopping = w.session.stop().then(() => {
      first = true;
    });
    await until(() => w.calls.includes('stop'));
    assert.equal(await w.session.stop(), undefined); // a retried stop / a dispose
    assert.equal((await w.session.wait(0)).state, 'idle');
    assert.equal(w.calls.filter((c) => c === 'stop').length, 1); // nothing sent twice
    await advanceTimersByTimeAsync(60_000);
    assert.equal(first, false);
    assert.equal(w.session.pending(), true);
    w.reads[1].resolve(okResponse(AMDP_STOPPED));
    await stopping;
    assert.equal(w.closed.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  it('an accepted stop ends with the STOP event the system answers the read with', async () => {
    const w = await started();
    await w.session.stop();
    assert.equal(w.closed.length, 2);
    assert.equal(w.session.holdsState(), false);
    assert.equal(w.session.pending(), false);
  });

  it('a break that arrives while a step is answered is not lost', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const real = w.dbg.step;
    w.dbg.step = async (...a: any[]) => {
      w.reads[2].resolve(okResponse(amdpBreak('D3')));
      await until(() => w.reads.length === 4);
      return real(...(a as [any, any, any]));
    };
    await w.session.step('continue');
    assert.notEqual(await w.session.getTable('LT_ROWS'), undefined);
    assert.ok(w.calls.includes('preview:LT_ROWS:D3')); // D3 is the stopped debuggee
  });

  it('a wait does not take the sync confirmation away from the start', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    await until(() => w.reads.length === 1);
    // Settled by the wait's 30 s, a fake timer: tracked, not awaited.
    const waiting = track(w.session.wait(30));
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    assertMatchObject(await s, {
      breakpoints: [{ state: 'PENDING' }, { state: 'PENDING' }],
    });
    await advanceTimersByTimeAsync(30_000);
    assert.ok(waiting.settled);
    assert.equal(waiting.value.state, 'waiting');
  });

  it('a failed event read fails the next wait once, closes the session, and allows a new start', async () => {
    const w = await started();
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.closed.length === 2);
    await assertRejects(w.session.wait(0), /session gone/);
    assert.equal((await w.session.wait(0)).state, 'idle');
    const before = w.reads.length;
    const expected = w.nextSync(); // ask the fake, never count by hand
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    await until(() => w.reads.length === before + 1);
    w.reads[before].resolve(okResponse(SYNCED(expected)));
    assertMatchObject(await s, {
      mainId: AMDP_MAIN_ID,
    });
  });

  it('a breakpoint clear that fails after an accepted stop is answered, and both connections are closed: nothing is kept for it', async () => {
    const w = await started();
    const realSync = w.dbg.syncBreakpoints;
    let refusedClears = 0;
    w.dbg.syncBreakpoints = async (m: string, b: any[]) => {
      if (b.length) return realSync(m, b);
      refusedClears++;
      return refusedResponse('clear refused');
    };
    await assertRejects(w.session.stop(), /clear refused/);
    assert.ok(w.calls.includes('stop'));
    // The stop was accepted: the last batch closes both, the clear not sent again.
    await until(() => w.closed.length === 2);
    await until(() => !w.session.pending());
    assert.equal(refusedClears, 1);
    // The clear's failure is let go a turn after the close: with nextTick and
    // queueMicrotask real (node:test cannot fake them, spec §3.7) it is
    // still held when the close is seen, where Jest's faked ones had run it.
    // What is proven: the session comes to hold nothing, within until's bound.
    await until(() => !w.session.holdsState());
    await w.session.stop();
    assert.equal(refusedClears, 1);
    assert.equal(w.closed.length, 2);
  });

  it('a breakpoint clear that fails before a refused stop keeps both connections, and the next stop retries both', async () => {
    const w = await started();
    const realSync = w.dbg.syncBreakpoints;
    const realStop = w.dbg.stop;
    w.dbg.syncBreakpoints = async (m: string, b: any[]) =>
      b.length ? realSync(m, b) : refusedResponse('clear refused');
    w.dbg.stop = async () => refusedResponse('not stopped');
    await assertRejects(w.session.stop(), /clear refused/);
    assert.equal(w.closed.length, 0);
    assert.equal(w.session.holdsState(), true);
    w.dbg.syncBreakpoints = realSync;
    w.dbg.stop = realStop;
    await w.session.stop();
    assert.equal(w.session.holdsState(), false);
    assert.equal(w.closed.length, 2);
  });

  it('a release that fails in the last batch is retried by the next stop', async () => {
    const w = await started();
    w.sim.stopAnswersRead = false;
    const stopping = w.session.stop();
    await until(() => w.calls.includes('stop'));
    const realDelete = w.dbg.deleteDebuggee;
    let refusedDeletes = 0;
    w.dbg.deleteDebuggee = async () => {
      refusedDeletes++;
      return refusedResponse('busy');
    };
    w.reads[1].resolve(okResponse(BREAK)); // the last batch carries a break
    await assertRejects(stopping, /release debuggee D1: busy/);
    assert.equal(refusedDeletes, 1);
    assert.equal(w.session.pending(), false);
    assert.deepStrictEqual(w.session.failures(), [
      { message: 'busy', origin: 'refusal', step: 'release debuggee D1' },
    ]);
    assert.equal(w.closed.length, 0);
    w.dbg.deleteDebuggee = realDelete;
    await w.session.stop();
    assert.ok(w.calls.includes('delete:D1'));
    assert.equal(w.session.holdsState(), false);
    assert.equal(w.closed.length, 2);
  });

  it('a stop returns only after the last batch released its break and recorded the outcome, whatever else wakes it meanwhile', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.sim.stopAnswersRead = false;
    let settled = false;
    const stopping = w.session.stop().finally(() => {
      settled = true;
    });
    stopping.catch(() => undefined);
    await until(() => w.calls.includes('stop'));
    const release = deferred<any>();
    w.dbg.deleteDebuggee = async (_m: string, d: string) => {
      w.calls.push(`delete:${d}`);
      return release.promise;
    };
    w.reads[1].resolve(okResponse(BREAK)); // the last batch carries a break
    await until(() => w.calls.includes('delete:D1'));
    w.run.resolve({ ok: true, output: 'late' }); // a run ending now wakes the waiters
    await advanceTimersByTimeAsync(0);
    await advanceTimersByTimeAsync(0);
    assert.equal(settled, false); // the release is still unanswered
    release.resolve(refusedResponse('release failed'));
    await assertRejects(stopping, /release debuggee D1: release failed/);
    assert.deepStrictEqual(w.session.failures(), [
      {
        message: 'release failed',
        origin: 'refusal',
        step: 'release debuggee D1',
      },
    ]);
    assert.equal(w.session.holdsState(), true);
  });

  it('a second stop while the first waits does not erase what the last batch could not undo', async () => {
    const w = await started();
    w.sim.stopAnswersRead = false;
    const first = w.session.stop();
    first.catch(() => undefined);
    await until(() => w.calls.includes('stop'));
    assert.equal(await w.session.stop(), undefined); // nothing failed yet
    w.dbg.deleteDebuggee = async () => refusedResponse('busy');
    w.reads[1].resolve(okResponse(BREAK));
    await assertRejects(first, /release debuggee D1: busy/);
    assert.deepStrictEqual(w.session.failures(), [
      { message: 'busy', origin: 'refusal', step: 'release debuggee D1' },
    ]);
    assert.equal(w.session.holdsState(), true);
  });

  it('a start that fails before the session is recorded closes what it opened', async () => {
    for (const failure of ['second open', 'start request'] as const) {
      const w = world();
      let opens = 0;
      const realOpen = (w.session as any).ports.openConnection;
      (w.session as any).ports.openConnection = async (o: unknown) => {
        opens++;
        if (failure === 'second open' && opens === 2)
          throw new Error('no session left');
        return realOpen(o);
      };
      if (failure === 'start request')
        w.dbg.start = async () => {
          throw new Error('socket hang up');
        };
      await assertRejects(
        w.session.start({
          stopExisting: true,
          breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
        }),
      );
      assert.equal(w.closed.length, failure === 'second open' ? 1 : 2);
      assert.equal(w.session.holdsState(), false);
    }
  });

  it('a cleanup that fails is reported', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    await assertRejects(w.session.stop(), DebugCleanupError);
    assert.equal(w.session.holdsState(), true); // kept for a retry
  });

  // --- beyond the brief: the lessons of the ABAP sibling ----------------------

  it('a start whose close fails names what it could not undo and keeps the connection for the next stop', async () => {
    const w = world();
    w.dbg.start = async () => {
      throw new Error('socket hang up');
    };
    const ports = (w.session as any).ports;
    const realClose = ports.closeConnection;
    let refuse = true;
    ports.closeConnection = async (c: unknown) => {
      if (refuse && (c as any).n === 0) throw new Error('logoff failed');
      return realClose(c);
    };
    await assertRejects(
      w.session.start({ stopExisting: true, breakpoints: [] }),
      /socket hang up; not undone: close the events' connection: logoff failed/,
    );
    assert.equal(w.session.holdsState(), true);
    refuse = false;
    await w.session.stop();
    assert.equal(w.session.holdsState(), false);
    assert.equal(w.closed.length, 2);
  });

  it('a start whose sync is refused after the session is recorded rolls the session back', async () => {
    const w = world();
    w.dbg.syncBreakpoints = async (_m: string, b: any[]) =>
      b.length
        ? refusedResponse('bad uri')
        : okResponse({ headers: { location: 'C' } });
    await assertRejects(
      w.session.start({
        stopExisting: true,
        breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
        run: { kind: 'class', name: 'ZCL_A' },
      }),
      /bad uri/,
    );
    assert.ok(w.calls.includes('stop'));
    assert.ok(!w.calls.includes('run'));
    // The accepted stop ended the open read (STOP), and that last batch closed both sessions.
    await until(() => w.closed.length === 2);
    assert.equal(w.session.holdsState(), false);
  });

  it('a sync never confirmed fails within WAIT_MAX_SECONDS and runs nothing', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      run: { kind: 'class', name: 'ZCL_A' },
    });
    // Refused by the confirmation's 30 s bound, a fake timer: tracked.
    const failed = track(assertRejects(s, /did not confirm them/));
    await until(() => w.reads.length === 1);
    await advanceTimersByTimeAsync(30_000);
    assert.ok(failed.settled);
    assert.ok(failed.value instanceof Error);
    assert.ok(!w.calls.includes('run'));
  });

  it('a failed event read while a sync waits fails the start at once, and is not reported twice', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    const failed = assertRejects(s, /session gone/);
    await until(() => w.reads.length === 1);
    w.reads[0].resolve(refusedResponse('session gone'));
    await failed;
    await until(() => w.closed.length === 2);
    assert.equal((await w.session.wait(0)).state, 'idle');
    assert.equal(w.session.holdsState(), false);
  });

  it('a close that throws in the last batch is no unhandled rejection: it is owed to the next stop', async () => {
    const w = await started();
    const ports = (w.session as any).ports;
    const realClose = ports.closeConnection;
    let refuse = true;
    ports.closeConnection = async (c: unknown) => {
      if (refuse) throw new Error('logoff failed');
      return realClose(c);
    };
    await assertRejects(w.session.stop(), /logoff failed/);
    assert.equal(w.session.pending(), false);
    assert.deepStrictEqual(w.session.failures(), [
      {
        error: 'client_threw',
        message: 'logoff failed',
        step: "close the events' connection",
      },
      {
        error: 'client_threw',
        message: 'logoff failed',
        step: "close the commands' connection",
      },
    ]);
    assert.equal(w.session.holdsState(), true);
    refuse = false;
    await w.session.stop();
    assert.equal(w.closed.length, 2);
    assert.equal(w.session.holdsState(), false);
  });

  it("a run's outcome arrives through wait; after a stop it changes nothing", async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.run.resolve({ ok: true, output: 'done' });
    await until(() => w.closed.length === 1);
    assert.deepStrictEqual(await w.session.wait(0), {
      state: 'ended',
      reason: 'run_finished',
      run: { ok: true, output: 'done' },
    });

    const v = await started(world(), true);
    await until(() => v.calls.includes('run'));
    await v.session.stop();
    v.reads[1].resolve(okResponse(''));
    await until(() => !v.session.pending());
    v.run.resolve({ ok: true, output: 'late' });
    await until(() => v.closed.length === 3);
    assert.equal(v.session.holdsState(), false);
    assert.equal((await v.session.wait(0)).state, 'idle');
  });

  it('an event read that throws outside its answer ends the session like a failed read', async () => {
    const w = await started();
    w.dbg.getEvents = () => {
      throw new Error('socket closed');
    };
    w.reads[1].resolve(okResponse('')); // the loop asks again, and the ask throws
    await until(() => w.closed.length === 2);
    assert.ok(w.calls.includes('stop'));
    await assertRejects(w.session.wait(0), /socket closed/);
    assert.equal((await w.session.wait(0)).state, 'idle');
    assert.equal(w.session.holdsState(), false);
  });

  it('an event read that throws outside its answer carries the throw as an entry with the step read events', async () => {
    const w = await started();
    w.dbg.getEvents = () => {
      throw new Error('socket closed');
    };
    w.reads[1].resolve(okResponse(''));
    await until(() => w.closed.length === 2);
    const thrown = await w.session.wait(0).then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.deepStrictEqual(payloadCarriedBy(thrown), {
      error: 'client_threw',
      message: 'socket closed',
      step: 'read events',
    });
  });

  it('an event read that rejects carries the throw as an entry with the step read events', async () => {
    const w = await started();
    w.reads[1].reject(new Error('socket reset'));
    await until(() => w.closed.length === 2);
    const thrown = await w.session.wait(0).then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.deepStrictEqual(payloadCarriedBy(thrown), {
      error: 'client_threw',
      message: 'socket reset',
      step: 'read events',
    });
  });

  it('two runs are fenced each by its own token: both outcomes arrive, and stop closes the one in flight', async () => {
    const w = await started();
    const ports = (w.session as any).ports;
    const runs = [
      deferred<any>(),
      deferred<any>(),
      deferred<any>(),
      deferred<any>(),
    ];
    let n = 0;
    ports.run = async () => runs[n++].promise;
    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    await until(() => n === 2);
    runs[0].resolve({ ok: true, output: 'first' });
    await until(() => w.closed.length === 1);
    assertMatchObject(await w.session.wait(0), {
      state: 'ended',
      run: { output: 'first' },
    });
    runs[1].resolve({ ok: true, output: 'second' });
    await until(() => w.closed.length === 2);
    assertMatchObject(await w.session.wait(0), {
      state: 'ended',
      run: { output: 'second' },
    });

    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    await until(() => n === 4);
    runs[2].resolve({ ok: true, output: 'third' }); // the fourth run stays in flight
    await until(() => w.closed.length === 3);
    await w.session.stop();
    assert.ok(w.closed.some((e) => isDeepStrictEqual(e, { n: 5 }))); // the fourth run's connection, still tracked
  });

  it('a read failure whose cleanup fails names what it could not undo', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.session.failures().length > 0); // retired, the stop still owed
    assert.equal(w.session.pending(), false);
    await assertRejects(
      w.session.wait(0),
      /session gone; not undone: stop: not stopped/,
    );
    assert.deepStrictEqual(w.session.failures(), [
      { message: 'not stopped', origin: 'refusal', step: 'stop' },
    ]);
  });

  // The run's request is the one a suspended debuggee stands in: its logoff
  // would end that session while the debuggee is owed a release.
  it('a debuggee still owed a release keeps the run connection: the stop that releases it closes it, after the release', async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    const runConnection = { n: 2 }; // events, commands, then the run's
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const realDelete = w.dbg.deleteDebuggee;
    w.dbg.deleteDebuggee = async () => refusedResponse('busy');
    w.reads[2].resolve(refusedResponse('session gone')); // retired with D1 at its break
    await until(() => w.session.failures().length > 0);
    await assertRejects(w.session.wait(0), /session gone/);
    await assertRejects(w.session.stop(), /release debuggee D1: busy/);
    assert.ok(!w.closed.some((e) => isDeepStrictEqual(e, runConnection)));
    assert.equal(w.session.holdsState(), true);
    w.dbg.deleteDebuggee = async (m: string, d: string) => {
      const answer = await realDelete(m, d);
      assert.ok(!w.closed.some((e) => isDeepStrictEqual(e, runConnection))); // released first
      return answer;
    };
    await w.session.stop();
    assert.ok(w.calls.includes('delete:D1'));
    assert.ok(w.closed.some((e) => isDeepStrictEqual(e, runConnection)));
    assert.equal(w.session.holdsState(), false);
  });

  it('observers hear of changes the read loop makes', async () => {
    const w = await started();
    const heard = mock.fn();
    w.session.observe(heard);
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => heard.mock.calls.length > 0);
    assertMatchObject(await w.session.wait(0), { state: 'event' });
  });

  it('a breakpoint clear the credential refused (AuthRefusedError): the stop is not sent, the refusal is the answer with its step, the stop named not attempted', async () => {
    const w = await started();
    const realSync = w.dbg.syncBreakpoints;
    w.dbg.syncBreakpoints = async (m: string, b: any[]) => {
      if (b.length) return realSync(m, b);
      throw new AuthRefusedError(
        authError.connection({
          problem: 'refused-after-renewal',
          at: 'request',
        }),
        'request',
      );
    };
    w.calls.length = 0;
    const error = await w.session.stop().then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(error instanceof DebugCleanupError);
    assert.ok(!w.calls.includes('stop'));
    const payload = JSON.parse((return_error(error) as any).content[0].text);
    assertMatchObject(payload, {
      error: 'authentication_failed',
      step: 'clear breakpoints',
      not_attempted: { steps: ['stop'] },
    });
    assert.equal(w.session.holdsState(), true);
  });
});
