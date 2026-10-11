import {
  DebugCleanupError,
  DebugSession,
  type RunTarget,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  deferred,
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  until,
} from './fakes';

describe('DebugSession lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function started(
    run?: { kind: 'class' | 'program'; name: string },
    ids: any = IDS,
    world = fakeWorld(),
  ) {
    const session = new DebugSession(world.ports, ids).bind('origin');
    const s = session.start('refuse', run ? { run } : {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  it('a background run starts only after the first poll, and ends as ended with its output', async () => {
    const { session, world } = await started({ kind: 'class', name: 'ZCL_X' });
    world.run.resolve({ ok: true, output: 'total 6' });
    await until(() => session.holdsState() && world.closed.length === 1);
    expect(await session.wait(0)).toEqual({
      state: 'ended',
      reason: 'run_finished',
      run: { ok: true, output: 'total 6' },
    });
  });

  it('stop releases the debuggee, deletes breakpoints, stops the listener, closes every connection once', async () => {
    const { session, world } = await started();
    await session.setBreakpoints([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
      },
    ]);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    await session.stop();
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:KIND=0.')),
    ).toBe(true);
    expect(world.calls).toContain('stopListener');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(world.closed.length).toBe(world.opened.length);
    expect(session.holdsState()).toBe(false);
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('stop during an attach waits for it and leaves no stop behind (no resurrection)', async () => {
    const world = fakeWorld();
    const attach = deferred<any>();
    world.attachAnswers.push(() => attach.promise);
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.some((c) => c.startsWith('attach:')));
    const stopping = session.stop();
    attach.resolve(okResponse('<dbg:attach xmlns:dbg="x"/>'));
    await stopping;
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a catch in the poll a stop ends is attached and released at once, on a connection of its own; no poll follows', async () => {
    const { session, world } = await started();
    // The system answers the open poll with a catch while the stop is running.
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await session.stop();
    await jest.advanceTimersByTimeAsync(0);
    const attach = world.calls.findIndex((c) => c.startsWith('attach:'));
    expect(attach).toBeGreaterThan(world.calls.indexOf('stopListener'));
    expect(world.calls[attach + 1]).toBe('step:stepContinue:analysed');
    expect(world.polls).toHaveLength(2);
    expect(session.holdsState()).toBe(false);
    expect((await session.wait(0)).state).toBe('idle');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a catch answered just before the stop, its answer not yet handled, is released by the stop', async () => {
    const { session, world } = await started();
    world.polls[1].resolve(LISTEN_CATCH()); // answered; its handling waits behind the stop
    await session.stop();
    await jest.advanceTimersByTimeAsync(0);
    expect(world.calls.filter((c) => c.startsWith('attach:'))).toHaveLength(1);
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a caught debuggee the stop cannot attach is named in its failures, and kept to report', async () => {
    const { session, world } = await started();
    world.attachAnswers.push(async () => refusedResponse('debuggee gone'));
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await expect(session.stop()).rejects.toThrow(
      /a debuggee caught during the stop .* was not attached: .*debuggee gone/,
    );
    expect(session.failures()).toEqual([
      expect.stringMatching(/was not attached/),
    ]);
    expect(session.holdsState()).toBe(true);
    expect((await session.wait(0)).state).toBe('idle'); // not a notice: the failure is the stop's
  });

  it('a caught debuggee the stop attached but could not release is named in its failures', async () => {
    const { session, world } = await started();
    world.stepAnswers.push(refusedResponse('release refused'));
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await expect(session.stop()).rejects.toThrow(
      /a debuggee caught during the stop .*: the debuggee was not released: .*release refused/,
    );
    expect(world.calls.some((c) => c.startsWith('attach:'))).toBe(true);
    expect(session.holdsState()).toBe(true);
  });

  it('a caught debuggee whose release failed is kept with its connection, and the next stop retries the release before closing it', async () => {
    const { session, world } = await started();
    world.stepAnswers.push(refusedResponse('release refused'));
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    const releases = () =>
      world.calls.filter((c) => c === 'step:stepContinue:analysed').length;
    await expect(session.stop()).rejects.toThrow(/release refused/);
    expect(releases()).toBe(1);
    const attaching = world.opened[world.opened.length - 1];
    expect(world.closed).not.toContain(attaching); // only the attaching session can release it
    expect(session.holdsState()).toBe(true);
    delete world.override.stopListener;
    await expect(session.stop()).resolves.toBeUndefined();
    expect(releases()).toBe(2); // retried on the session that attached it
    expect(world.closed).toContain(attaching);
    expect(world.calls.filter((c) => c.startsWith('attach:'))).toHaveLength(1);
    expect(session.holdsState()).toBe(false);
    expect(session.failures()).toEqual([]);
  });

  it('a caught debuggee whose release fails again stays owed, and is named by each stop', async () => {
    const { session, world } = await started();
    world.override.step = async () => refusedResponse('release refused');
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await expect(session.stop()).rejects.toThrow(/release refused/);
    await expect(session.stop()).rejects.toThrow(
      /a debuggee caught during the stop .*: the debuggee was not released: .*release refused/,
    );
    expect(session.holdsState()).toBe(true);
    delete world.override.step;
    await expect(session.stop()).resolves.toBeUndefined();
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a run finishing after stop reports nothing and its connection closes once', async () => {
    const { session, world } = await started({ kind: 'class', name: 'ZCL_X' });
    await session.stop();
    world.run.resolve({ ok: true, output: 'late' });
    await jest.advanceTimersByTimeAsync(0);
    expect((await session.wait(0)).state).toBe('idle');
    expect(world.closed.length).toBe(new Set(world.closed).size);
  });

  it('a cleanup that fails is reported, and what failed stays to retry', async () => {
    const world = fakeWorld();
    const { session } = await started(undefined, IDS, world);
    await session.setBreakpoints([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
      },
    ]);
    world.override.deleteBreakpoint = async () =>
      refusedResponse('not authorised');
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    expect(session.listBreakpoints()).toHaveLength(1);
    expect(session.holdsState()).toBe(true);
    delete world.override.deleteBreakpoint;
    await expect(session.stop()).resolves.toBeUndefined(); // the retry undoes what was left
    expect(session.holdsState()).toBe(false);
  });

  it('a release that fails keeps the stop for a retry', async () => {
    const world = fakeWorld();
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.step = async () => refusedResponse('work process busy');
    await expect(session.stop()).rejects.toThrow(/work process busy/);
    expect((await session.wait(0)).state).toBe('stopped');
    delete world.override.step;
    await session.stop();
    expect(session.holdsState()).toBe(false);
  });

  it('stated ids: the first start stops a predecessor listener under those ids', async () => {
    const world = fakeWorld();
    await started(undefined, { ...IDS, stated: true }, world);
    expect(world.calls).toContain('stopListener');
    expect(world.calls.indexOf('stopListener')).toBeLessThan(
      world.calls.findIndex((c) => c.startsWith('listen:')),
    );
  });

  describe('a close that throws during stop', () => {
    function closeFailsOnce(world: ReturnType<typeof fakeWorld>) {
      const realClose = world.ports.closeConnection;
      let once = true;
      world.ports.closeConnection = async (c) => {
        if (once) {
          once = false;
          throw new Error('close refused');
        }
        return realClose(c);
      };
    }

    it("the listener's connection is kept, named, and closed by the next stop", async () => {
      const world = fakeWorld();
      const { session } = await started(undefined, IDS, world);
      closeFailsOnce(world);
      const failed = session.stop();
      await expect(failed).rejects.toThrow(DebugCleanupError);
      await expect(failed).rejects.toThrow(/close refused/);
      expect(session.holdsState()).toBe(true);
      expect(session.failures().join()).toMatch(/close refused/);
      await expect(session.stop()).resolves.toBeUndefined();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it("the debuggee's connection is kept without a second release", async () => {
      const world = fakeWorld();
      const { session } = await started(undefined, IDS, world);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.includes('getStack'));
      closeFailsOnce(world);
      await expect(session.stop()).rejects.toThrow(DebugCleanupError);
      expect(session.holdsState()).toBe(true);
      await expect(session.stop()).resolves.toBeUndefined();
      expect(
        world.calls.filter((c) => c === 'step:stepContinue:analysed'),
      ).toHaveLength(1);
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it("the run's connection is fenced, kept and named; a late run reports nothing", async () => {
      const world = fakeWorld();
      const { session } = await started(
        { kind: 'class', name: 'ZCL_X' },
        IDS,
        world,
      );
      const runConnection = world.opened[1];
      const realClose = world.ports.closeConnection;
      let once = true;
      world.ports.closeConnection = async (c) => {
        if (c === runConnection && once) {
          once = false;
          throw new Error('close refused');
        }
        return realClose(c);
      };
      await expect(session.stop()).rejects.toThrow(DebugCleanupError);
      expect(session.holdsState()).toBe(true);
      world.run.resolve({ ok: true, output: 'late' });
      await jest.advanceTimersByTimeAsync(0);
      expect((await session.wait(0)).state).toBe('idle');
      await expect(session.stop()).resolves.toBeUndefined();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });
  });

  describe('a close that throws outside a stop is kept for the next stop and recorded', () => {
    function closeFails(world: ReturnType<typeof fakeWorld>) {
      const realClose = world.ports.closeConnection;
      const gate = { refuse: true };
      world.ports.closeConnection = async (c) => {
        if (gate.refuse) throw new Error('close refused');
        return realClose(c);
      };
      return gate;
    }
    function noUnhandled() {
      const seen: unknown[] = [];
      const on = (e: unknown) => seen.push(e);
      process.on('unhandledRejection', on);
      return {
        seen,
        off: () => process.off('unhandledRejection', on),
      };
    }

    it("the run's close: no unhandled rejection; the run still reports; the connection is kept and named", async () => {
      const watch = noUnhandled();
      try {
        const world = fakeWorld();
        const { session } = await started(
          { kind: 'class', name: 'ZCL_X' },
          IDS,
          world,
        );
        const gate = closeFails(world);
        world.run.resolve({ ok: true, output: 'total 6' });
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(0);
        expect(watch.seen).toEqual([]);
        expect(await session.wait(0)).toMatchObject({
          state: 'ended',
          reason: 'run_finished',
        });
        expect(session.failures().join()).toMatch(
          /the run's connection was not closed: close refused/,
        );
        expect(session.holdsState()).toBe(true);
        gate.refuse = false;
        await expect(session.stop()).resolves.toBeUndefined();
        expect(session.holdsState()).toBe(false);
        expect(new Set(world.closed)).toEqual(new Set(world.opened));
      } finally {
        watch.off();
      }
    });

    it('a listener dropped on a failed poll: its connection is kept and named', async () => {
      const world = fakeWorld();
      const { session } = await started(undefined, IDS, world);
      const gate = closeFails(world);
      world.polls[1].resolve(refusedResponse('session gone'));
      await jest.advanceTimersByTimeAsync(0);
      await expect(session.wait(0)).rejects.toThrow(/session gone/);
      expect(session.failures().join()).toMatch(
        /the listener's connection was not closed: close refused/,
      );
      expect(session.holdsState()).toBe(true);
      gate.refuse = false;
      await expect(session.stop()).resolves.toBeUndefined();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it('an attach that throws: the attach connection is kept and named', async () => {
      const world = fakeWorld();
      world.attachAnswers.push(async () => {
        throw new Error('attach broke');
      });
      const { session } = await started(undefined, IDS, world);
      const gate = closeFails(world);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.some((c) => c.startsWith('attach:')));
      await jest.advanceTimersByTimeAsync(0);
      await expect(session.wait(0)).rejects.toThrow(/attach broke/);
      expect(session.failures().join()).toMatch(
        /the debuggee's connection was not closed: close refused/,
      );
      gate.refuse = false;
      await expect(session.stop()).resolves.toBeUndefined();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it('an attach overtaken by a newer generation whose release fails: the failed release is recorded', async () => {
      const world = fakeWorld();
      const attach = deferred<any>();
      world.attachAnswers.push(() => attach.promise);
      const { session } = await started(undefined, IDS, world);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.some((c) => c.startsWith('attach:')));
      (session as any).generation++; // the listener moved on while the attach ran
      world.override.step = async () => refusedResponse('work process busy');
      attach.resolve(okResponse('<dbg:attach xmlns:dbg="x"/>'));
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);
      expect(session.failures().join()).toMatch(
        /the debuggee was not released: work process busy/,
      );
      expect(session.holdsState()).toBe(true);
      const attaching = world.opened[world.opened.length - 1];
      expect(world.closed).not.toContain(attaching); // kept: only it can release the debuggee
      delete world.override.step;
      await expect(session.stop()).resolves.toBeUndefined();
      expect(world.calls).toContain('step:stepContinue:analysed'); // the retried release
      expect(world.closed).toContain(attaching);
      expect(session.holdsState()).toBe(false);
    });
  });

  it('stated ids: a start that failed before reconciling reconciles on the next start', async () => {
    const world = fakeWorld();
    const realOpen = world.ports.openConnection;
    let once = true;
    world.ports.openConnection = async (o) => {
      if (once) {
        once = false;
        throw new Error('no route to host');
      }
      return realOpen(o);
    };
    const session = new DebugSession(world.ports, {
      ...IDS,
      stated: true,
    }).bind('origin');
    await expect(session.start('refuse')).rejects.toThrow(/no route to host/);
    expect(world.calls).not.toContain('stopListener');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    expect(world.calls).toContain('stopListener');
    expect(world.calls.indexOf('stopListener')).toBeLessThan(
      world.calls.findIndex((c) => c.startsWith('listen:')),
    );
  });

  it('stop returns only once the open poll has answered: the system has let go of the listener', async () => {
    const { session, world } = await started();
    // The system accepts the stop but has not answered the open poll yet.
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      return okResponse(undefined);
    };
    let done = false;
    const stopping = session.stop().then(() => {
      done = true;
    });
    await until(() => world.calls.includes('stopListener'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    const listenerConnection = world.opened[1];
    expect(world.closed).not.toContain(listenerConnection);
    world.polls[1].resolve(LISTEN_NOTHING());
    await stopping;
    expect(world.closed).toContain(listenerConnection);
    expect(session.holdsState()).toBe(false);
  });

  it('a failed answer of the stopped poll is a cleanup failure, named, kept for the next stop', async () => {
    const { session, world } = await started();
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(refusedResponse('poll broke'));
      return okResponse(undefined);
    };
    await expect(session.stop()).rejects.toThrow(
      /the listener's last poll: .*poll broke/,
    );
    expect(session.failures()).toEqual([
      expect.stringMatching(/the listener's last poll/),
    ]);
    expect(session.holdsState()).toBe(true);
    delete world.override.stopListener;
    await session.stop();
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a stale loop that throws after stop records no failure', async () => {
    const { session, world } = await started();
    await session.stop();
    let late = true;
    session.observe(() => {
      if (late) {
        late = false;
        throw new Error('late exception');
      }
    });
    world.polls[1].resolve(LISTEN_NOTHING());
    await jest.advanceTimersByTimeAsync(0);
    expect(late).toBe(false); // the stale loop did throw
    expect(session.holdsState()).toBe(false);
    expect((await session.wait(0)).state).toBe('idle');
  });

  describe('a start that fails after attaching on the first poll', () => {
    class RunRefused extends DebugSession<string> {
      protected startRun(_run: RunTarget, _generation: number): void {
        throw new Error('run refused');
      }
    }
    async function failedStart(world = fakeWorld()) {
      const session = new RunRefused(world.ports, IDS).bind('origin');
      const s = session.start('refuse', {
        run: { kind: 'class', name: 'ZCL_X' },
      });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_CATCH());
      return { session, world, s };
    }

    it('releases the stop it attached', async () => {
      const { session, world, s } = await failedStart();
      await expect(s).rejects.toThrow(/^run refused$/);
      expect(world.calls).toContain('step:stepContinue:analysed');
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it('names a release that failed, and keeps the stop for DebugStop', async () => {
      const world = fakeWorld();
      world.override.step = async () => refusedResponse('work process busy');
      const { session, s } = await failedStart(world);
      await expect(s).rejects.toThrow(
        /run refused; not undone: .*work process busy/,
      );
      expect((await session.wait(0)).state).toBe('stopped');
      delete world.override.step;
      await session.stop();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });
  });
});
