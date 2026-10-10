import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebugCleanupError } from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
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
  const run = deferred<any>();
  let syncN = 0;
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
      return okResponse({ headers: { location: `/x/Q${++syncN}` } });
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
      return okResponse({});
    },
    getDataPreview: async (o: any) => {
      calls.push(`preview:${o.variableName}:${o.debuggeeId}`);
      return okResponse('<dataPreview:tableData xmlns:dataPreview="z"/>');
    },
  };
  let opened = 0;
  const session = new AmdpSession({
    openConnection: async () => ({ n: opened++ }) as any,
    closeConnection: async (c) => {
      closed.push(c);
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
  return { session, reads, calls, closed, dbg, run, nextSync };
}

describe('AmdpSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
    expect(w.calls).not.toContain('run');
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await expect(s).resolves.toMatchObject({
      mainId: '0123456789ABCDEF0123456789ABCDEF',
      breakpoints: ['PENDING'],
    });
    await until(() => w.calls.includes('run'));
  });

  it('an ON_BREAK arrives through wait; a step addresses its debuggee, then the debuggee is moving', async () => {
    const w = await started();
    const waiting = w.session.wait(30);
    w.reads[1].resolve(okResponse(BREAK));
    await expect(waiting).resolves.toMatchObject({
      state: 'event',
      events: [{ kind: 'ON_BREAK', line: 14 }],
    });
    await w.session.step('continue');
    expect(w.calls).toContain('step:D1:continue');
    await expect(w.session.step('over')).rejects.toThrow(
      /no AMDP debuggee is stopped/,
    );
  });

  it('ON_EXECUTION_END clears the debuggee', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.reads[2].resolve(okResponse(END));
    await until(() => w.reads.length === 4);
    await expect(w.session.getTable('LT_ROWS')).rejects.toThrow(
      /no AMDP debuggee/,
    );
  });

  it('stop releases a suspended debuggee before the stop, returns without waiting for the poll, and the last batch closes everything', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    await w.session.stop(); // returns while reads[2] is still open
    expect(w.calls.indexOf('delete:D1')).toBeGreaterThan(-1);
    expect(w.calls.indexOf('delete:D1')).toBeLessThan(w.calls.indexOf('stop'));
    expect(w.session.holdsState()).toBe(true); // closing
    w.reads[2].resolve(okResponse(BREAK.replace('D1', 'D2')));
    await until(() => w.closed.length === 2);
    expect(w.calls).toContain('delete:D2');
    expect(w.session.holdsState()).toBe(false);
  });

  it('a break that arrives while a step is answered is not lost', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const real = w.dbg.step;
    w.dbg.step = async (...a: any[]) => {
      w.reads[2].resolve(okResponse(BREAK.replace('D1', 'D3')));
      await until(() => w.reads.length === 4);
      return real(...(a as [any, any, any]));
    };
    await w.session.step('continue');
    await expect(w.session.getTable('LT_ROWS')).resolves.toBeDefined();
    expect(w.calls).toContain('preview:LT_ROWS:D3'); // D3 is the stopped debuggee
  });

  it('a wait does not take the sync confirmation away from the start', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    await until(() => w.reads.length === 1);
    const waiting = w.session.wait(30);
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await expect(s).resolves.toMatchObject({ breakpoints: ['PENDING'] });
    await jest.advanceTimersByTimeAsync(30_000);
    expect((await waiting).state).toBe('waiting');
  });

  it('a failed event read fails the next wait once, closes the session, and allows a new start', async () => {
    const w = await started();
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.closed.length === 2);
    await expect(w.session.wait(0)).rejects.toThrow(/session gone/);
    expect((await w.session.wait(0)).state).toBe('idle');
    const before = w.reads.length;
    const expected = w.nextSync(); // ask the fake, never count by hand
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    await until(() => w.reads.length === before + 1);
    w.reads[before].resolve(okResponse(SYNCED(expected)));
    await expect(s).resolves.toMatchObject({
      mainId: '0123456789ABCDEF0123456789ABCDEF',
    });
  });

  it('a breakpoint clear that fails survives the last batch and is retried by the next stop', async () => {
    const w = await started();
    const realSync = w.dbg.syncBreakpoints;
    let refusedClears = 0;
    w.dbg.syncBreakpoints = async (m: string, b: any[]) => {
      if (b.length) return realSync(m, b);
      refusedClears++;
      return refusedResponse('clear refused');
    };
    await expect(w.session.stop()).rejects.toThrow(/clear refused/);
    expect(refusedClears).toBe(1);
    w.reads[1].resolve(okResponse('<amdpdbg:events xmlns:amdpdbg="x"/>')); // the last batch arrives
    await until(() => refusedClears === 2); // its own attempt failed too
    await until(() => !w.session.pending());
    expect(w.session.holdsState()).toBe(true); // not closed: the clear is still owed
    expect(w.closed).toHaveLength(0);
    w.dbg.syncBreakpoints = realSync;
    await w.session.stop();
    expect(w.session.holdsState()).toBe(false);
    expect(w.closed).toHaveLength(2);
  });

  it('a release that fails in the last batch is retried by the next stop', async () => {
    const w = await started();
    await w.session.stop();
    const realDelete = w.dbg.deleteDebuggee;
    let refusedDeletes = 0;
    w.dbg.deleteDebuggee = async () => {
      refusedDeletes++;
      return refusedResponse('busy');
    };
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => refusedDeletes === 1); // the last batch's release was attempted and failed
    await until(() => !w.session.pending());
    expect(w.session.failures()).toEqual(['release debuggee D1: busy']);
    expect(w.closed).toHaveLength(0);
    w.dbg.deleteDebuggee = realDelete;
    await w.session.stop();
    expect(w.calls).toContain('delete:D1');
    expect(w.session.holdsState()).toBe(false);
    expect(w.closed).toHaveLength(2);
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
      await expect(
        w.session.start({
          stopExisting: true,
          breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
        }),
      ).rejects.toThrow();
      expect(w.closed).toHaveLength(failure === 'second open' ? 1 : 2);
      expect(w.session.holdsState()).toBe(false);
    }
  });

  it('a cleanup that fails is reported', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    await expect(w.session.stop()).rejects.toThrow(DebugCleanupError);
    expect(w.session.holdsState()).toBe(true); // kept for a retry
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
    await expect(
      w.session.start({ stopExisting: true, breakpoints: [] }),
    ).rejects.toThrow(
      /socket hang up; not undone: the events' connection was not closed: logoff failed/,
    );
    expect(w.session.holdsState()).toBe(true);
    refuse = false;
    await w.session.stop();
    expect(w.session.holdsState()).toBe(false);
    expect(w.closed).toHaveLength(2);
  });

  it('a start whose sync is refused after the session is recorded rolls the session back', async () => {
    const w = world();
    w.dbg.syncBreakpoints = async (_m: string, b: any[]) =>
      b.length
        ? refusedResponse('bad uri')
        : okResponse({ headers: { location: '/x/C' } });
    await expect(
      w.session.start({
        stopExisting: true,
        breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
        run: { kind: 'class', name: 'ZCL_A' },
      }),
    ).rejects.toThrow(/bad uri/);
    expect(w.calls).toContain('stop');
    expect(w.calls).not.toContain('run');
    expect(w.session.describe().state).toBe('closing');
    w.reads[0].resolve(okResponse('')); // the last batch
    await until(() => w.closed.length === 2);
    expect(w.session.holdsState()).toBe(false);
  });

  it('a sync never confirmed fails within WAIT_MAX_SECONDS and runs nothing', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
      run: { kind: 'class', name: 'ZCL_A' },
    });
    const failed = expect(s).rejects.toThrow(/did not confirm them/);
    await until(() => w.reads.length === 1);
    await jest.advanceTimersByTimeAsync(30_000);
    await failed;
    expect(w.calls).not.toContain('run');
  });

  it('a failed event read while a sync waits fails the start at once, and is not reported twice', async () => {
    const w = world();
    const s = w.session.start({
      stopExisting: true,
      breakpoints: [{ class_name: 'ZCL_A', line: 14 }],
    });
    const failed = expect(s).rejects.toThrow(/session gone/);
    await until(() => w.reads.length === 1);
    w.reads[0].resolve(refusedResponse('session gone'));
    await failed;
    await until(() => w.closed.length === 2);
    expect((await w.session.wait(0)).state).toBe('idle');
    expect(w.session.holdsState()).toBe(false);
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
    await w.session.stop();
    w.reads[1].resolve(okResponse(''));
    await until(() => !w.session.pending());
    expect(w.session.failures()).toEqual([
      "the events' connection was not closed: logoff failed",
      "the commands' connection was not closed: logoff failed",
    ]);
    expect(w.session.holdsState()).toBe(true);
    refuse = false;
    await w.session.stop();
    expect(w.closed).toHaveLength(2);
    expect(w.session.holdsState()).toBe(false);
  });

  it("a run's outcome arrives through wait; after a stop it changes nothing", async () => {
    const w = await started(world(), true);
    await until(() => w.calls.includes('run'));
    w.run.resolve({ ok: true, output: 'done' });
    await until(() => w.closed.length === 1);
    await expect(w.session.wait(0)).resolves.toEqual({
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
    expect(v.session.holdsState()).toBe(false);
    expect((await v.session.wait(0)).state).toBe('idle');
  });

  it('an event read that throws outside its answer ends the session like a failed read', async () => {
    const w = await started();
    w.dbg.getEvents = () => {
      throw new Error('socket closed');
    };
    w.reads[1].resolve(okResponse('')); // the loop asks again, and the ask throws
    await until(() => w.closed.length === 2);
    expect(w.calls).toContain('stop');
    await expect(w.session.wait(0)).rejects.toThrow(/socket closed/);
    expect((await w.session.wait(0)).state).toBe('idle');
    expect(w.session.holdsState()).toBe(false);
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
    await expect(w.session.wait(0)).resolves.toMatchObject({
      state: 'ended',
      run: { output: 'first' },
    });
    runs[1].resolve({ ok: true, output: 'second' });
    await until(() => w.closed.length === 2);
    await expect(w.session.wait(0)).resolves.toMatchObject({
      state: 'ended',
      run: { output: 'second' },
    });

    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    w.session.startRun({ kind: 'class', name: 'ZCL_A' });
    await until(() => n === 4);
    runs[2].resolve({ ok: true, output: 'third' }); // the fourth run stays in flight
    await until(() => w.closed.length === 3);
    await w.session.stop();
    expect(w.closed).toContainEqual({ n: 5 }); // the fourth run's connection, still tracked
  });

  it('a read failure whose cleanup fails names what it could not undo', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.session.describe().state === 'closing'); // retired, the stop still owed
    expect(w.session.pending()).toBe(false);
    await expect(w.session.wait(0)).rejects.toThrow(
      /session gone; not undone: stop: not stopped/,
    );
    expect(w.session.failures()).toEqual(['stop: not stopped']);
  });

  it('observers hear of changes the read loop makes', async () => {
    const w = await started();
    const heard = jest.fn();
    w.session.observe(heard);
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => heard.mock.calls.length > 0);
    expect(w.session.describe()).toEqual({
      kind: 'amdp',
      state: 'stopped',
      debuggee: 'D1',
    });
  });
});
