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

  it('a catch arriving after stop is not attached and no poll follows', async () => {
    const { session, world } = await started();
    const stopping = session.stop();
    world.polls[1].resolve(LISTEN_CATCH());
    await stopping;
    await jest.advanceTimersByTimeAsync(0);
    expect(world.calls.some((c) => c.startsWith('attach:'))).toBe(false);
    expect(world.polls).toHaveLength(2);
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
