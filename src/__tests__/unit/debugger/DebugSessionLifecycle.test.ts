import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  DebugCleanupError,
  DebugSession,
  type RunTarget,
} from '../../../lib/debugger/DebugSession';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  advanceTimersByTimeAsync,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import {
  assertMessageHolding,
  deferred,
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  START,
  stringOf,
  until,
} from './fakes';

describe('DebugSession lifecycle', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function started(
    run?: { kind: 'class' | 'program'; name: string },
    ids: any = IDS,
    world = fakeWorld(),
    mode: { debuggingMode?: 'user' | 'terminal' } = {},
  ) {
    const session = new DebugSession(world.ports, ids).bind('origin');
    const s = session.start('refuse', {
      ...START,
      ...mode,
      ...(run ? { run } : {}),
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  it('a background run starts only after the first poll, and ends as ended with its output', async () => {
    const { session, world } = await started({
      kind: 'class',
      name: 'CLASS_X',
    });
    world.run.resolve({ ok: true, output: 'total 6' });
    await until(() => session.holdsState() && world.closed.length === 1);
    assert.deepStrictEqual(await session.wait(0), {
      state: 'ended',
      reason: 'run_finished',
      run: { ok: true, output: 'total 6' },
    });
  });

  // Measured on premise (2026-10-12): a terminal-mode listener catches only a run
  // that carries its terminal id and IDE id; a user-mode one keys on the request user.
  it("a run under terminal mode carries the identity's ids", async () => {
    const { session, world } = await started(
      { kind: 'class', name: 'CLASS_A' },
      IDS,
      fakeWorld(),
      { debuggingMode: 'terminal' },
    );
    const identity = session.currentIdentity()!;
    assert.deepStrictEqual(world.runs, [
      {
        target: { kind: 'class', name: 'CLASS_A' },
        debuggee: { terminalId: identity.terminalId, ideId: identity.ideId },
      },
    ]);
  });

  it('a run under user mode carries no ids', async () => {
    const { world } = await started({ kind: 'program', name: 'PROGRAM_A' });
    assert.deepStrictEqual(world.runs, [
      { target: { kind: 'program', name: 'PROGRAM_A' }, debuggee: undefined },
    ]);
  });

  it("stop releases the debuggee, stops the listener (which deletes the key's breakpoints), closes every connection once", async () => {
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
    assert.ok(world.calls.includes('step:stepContinue:analysed'));
    assert.equal(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:')),
      false,
    );
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.ok(world.calls.includes('stopListener'));
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    assert.equal(world.closed.length, world.opened.length);
    assert.equal(session.holdsState(), false);
    assert.equal((await session.wait(0)).state, 'idle');
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
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
    await advanceTimersByTimeAsync(0);
    const attach = world.calls.findIndex((c) => c.startsWith('attach:'));
    assert.ok(attach > world.calls.indexOf('stopListener'));
    assert.equal(world.calls[attach + 1], 'step:stepContinue:analysed');
    assert.equal(world.polls.length, 2);
    assert.equal(session.holdsState(), false);
    assert.equal((await session.wait(0)).state, 'idle');
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a catch answered just before the stop, its answer not yet handled, is released by the stop', async () => {
    const { session, world } = await started();
    world.polls[1].resolve(LISTEN_CATCH()); // answered; its handling waits behind the stop
    await session.stop();
    await advanceTimersByTimeAsync(0);
    assert.equal(world.calls.filter((c) => c.startsWith('attach:')).length, 1);
    assert.ok(world.calls.includes('step:stepContinue:analysed'));
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a caught debuggee the stop cannot attach is named in its failures, and kept to report', async () => {
    const { session, world } = await started();
    world.attachAnswers.push(async () => refusedResponse('debuggee gone'));
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await assertRejects(
      session.stop(),
      /attach a debuggee caught during the stop .*: debuggee gone/,
    );
    const failures = session.failures();
    assert.equal(failures.length, 1);
    assert.match(
      stringOf(failures[0]?.step),
      /^attach a debuggee caught during the stop \(/,
    );
    assert.deepStrictEqual(
      { ...failures[0], step: undefined },
      { message: 'debuggee gone', origin: 'refusal', step: undefined },
    );
    assert.equal(session.holdsState(), true);
    assert.equal((await session.wait(0)).state, 'idle'); // not a notice: the failure is the stop's
  });

  it('a caught debuggee the stop attached but could not release is named in its failures', async () => {
    const { session, world } = await started();
    world.stepAnswers.push(refusedResponse('release refused'));
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await assertRejects(
      session.stop(),
      /release a debuggee caught during the stop .*: release refused/,
    );
    assert.equal(
      world.calls.some((c) => c.startsWith('attach:')),
      true,
    );
    assert.equal(session.holdsState(), true);
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
    await assertRejects(session.stop(), /release refused/);
    assert.equal(releases(), 1);
    const attaching = world.opened[world.opened.length - 1];
    assert.ok(!world.closed.includes(attaching)); // only the attaching session can release it
    assert.equal(session.holdsState(), true);
    delete world.override.stopListener;
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(releases(), 2); // retried on the session that attached it
    assert.ok(world.closed.includes(attaching));
    assert.equal(world.calls.filter((c) => c.startsWith('attach:')).length, 1);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(session.failures(), []);
  });

  it('a caught debuggee whose release finds its connection spent is dropped without a request, reported, and nothing stays owed', async () => {
    const { session, world } = await started();
    world.stepAnswers.push(
      refusedResponse('words that are never read', {
        origin: 'connection',
        sessionError: 'ADT_SESSION_REPLACED',
      }),
    );
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    const notes = await session.stop();
    const attaching = world.opened[world.opened.length - 1];
    assert.deepStrictEqual(world.dropped, [attaching]);
    assert.ok(!world.closed.includes(attaching));
    assert.equal(notes.length, 1);
    assert.match(
      stringOf(notes[0]?.step),
      /^release a debuggee caught during the stop \(/,
    );
    assertMessageHolding(notes[0]?.cleanup, 'dropped');
    assert.equal(session.holdsState(), false);
  });

  it('a caught debuggee whose release fails again stays owed, and is named by each stop', async () => {
    const { session, world } = await started();
    world.override.step = async () => refusedResponse('release refused');
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(LISTEN_CATCH());
      return okResponse(undefined);
    };
    await assertRejects(session.stop(), /release refused/);
    await assertRejects(
      session.stop(),
      /release a debuggee caught during the stop .*: release refused/,
    );
    assert.equal(session.holdsState(), true);
    delete world.override.step;
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a run finishing after stop reports nothing and its connection closes once', async () => {
    const { session, world } = await started({
      kind: 'class',
      name: 'CLASS_X',
    });
    await session.stop();
    world.run.resolve({ ok: true, output: 'late' });
    await advanceTimersByTimeAsync(0);
    assert.equal((await session.wait(0)).state, 'idle');
    assert.equal(world.closed.length, new Set(world.closed).size);
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
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('not authorised');
    await assertRejects(session.stop(), DebugCleanupError);
    // The start's breakpoint and the one set after it.
    assert.equal(session.listBreakpoints().length, 2);
    assert.equal(session.holdsState(), true);
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    assert.deepStrictEqual(await session.stop(), []); // the retry undoes what was left
    assert.equal(session.holdsState(), false);
  });

  it('a release that fails keeps the stop for a retry', async () => {
    const world = fakeWorld();
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.step = async () => refusedResponse('work process busy');
    await assertRejects(session.stop(), /work process busy/);
    assert.equal((await session.wait(0)).state, 'stopped');
    delete world.override.step;
    await session.stop();
    assert.equal(session.holdsState(), false);
  });

  it('stated ids: the first start stops a predecessor listener under those ids', async () => {
    const world = fakeWorld();
    await started(undefined, { ...IDS, stated: true }, world);
    assert.ok(world.calls.includes('stopListener'));
    assert.ok(
      world.calls.indexOf('stopListener') <
        world.calls.findIndex((c) => c.startsWith('listen:')),
    );
  });

  for (const [_, mode, stated, reconciles] of [
    ['user mode, the IDE id alone stated', {}, { stated: true }, true],
    [
      'terminal mode, the IDE id alone stated',
      { debuggingMode: 'terminal' as const },
      { stated: true },
      false,
    ],
    [
      'terminal mode, the terminal id stated',
      { debuggingMode: 'terminal' as const },
      { stated: true, terminalStated: true },
      true,
    ],
    [
      'terminal mode, nothing stated',
      { debuggingMode: 'terminal' as const },
      {},
      false,
    ],
  ] satisfies [
    string,
    { debuggingMode?: 'terminal' },
    { stated?: boolean; terminalStated?: boolean },
    boolean,
  ][]) {
    it(
      format(
        'the first start reconciles a predecessor only under ids that can have one: %s',
        _,
      ),
      async () => {
        const world = fakeWorld();
        await started(undefined, { ...IDS, ...stated }, world, mode);
        assert.equal(world.calls.includes('stopListener'), reconciles);
      },
    );
  }

  // Measured on premise (2026-10-12): a poll sent just before the stop can reach
  // the system after the stopListener and then holds its full hold.
  it('a stop whose first stopListener left the open poll unanswered stops the listener once more, before awaiting the poll', async () => {
    const { session, world } = await started();
    const open = world.polls[1];
    let answered = false;
    let stops = 0;
    const unansweredAtSecond: boolean[] = [];
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      stops++;
      if (stops === 2) {
        unansweredAtSecond.push(!answered);
        answered = true;
        open.resolve(LISTEN_NOTHING());
      }
      return okResponse(undefined);
    };
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(world.calls.filter((c) => c === 'stopListener').length, 2);
    assert.deepStrictEqual(unansweredAtSecond, [true]);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a stop whose stopListener answered the open poll stops the listener once', async () => {
    const { session, world } = await started();
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(world.calls.filter((c) => c === 'stopListener').length, 1);
    assert.equal(session.holdsState(), false);
  });

  it('a second stopListener that fails is no failure of the stop: the first one succeeded', async () => {
    const { session, world } = await started();
    const open = world.polls[1];
    let stops = 0;
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      stops++;
      if (stops === 1) return okResponse(undefined);
      open.resolve(LISTEN_NOTHING()); // the system answers the poll at last
      return refusedResponse('listener already stopped');
    };
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(stops, 2);
    assert.equal(session.holdsState(), false);
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
      await assertRejects(failed, DebugCleanupError);
      await assertRejects(failed, /close refused/);
      assert.equal(session.holdsState(), true);
      assert.ok(session.failures().some((f) => f.message === 'close refused'));
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    });

    it("the debuggee's connection is kept without a second release", async () => {
      const world = fakeWorld();
      const { session } = await started(undefined, IDS, world);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.includes('getStack'));
      closeFailsOnce(world);
      await assertRejects(session.stop(), DebugCleanupError);
      assert.equal(session.holdsState(), true);
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(
        world.calls.filter((c) => c === 'step:stepContinue:analysed').length,
        1,
      );
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    });

    it("the run's connection is fenced, kept and named; a late run reports nothing", async () => {
      const world = fakeWorld();
      const { session } = await started(
        { kind: 'class', name: 'CLASS_X' },
        IDS,
        world,
      );
      // The start's arming opened the control connection, then the listener's.
      const runConnection = world.opened[2];
      const realClose = world.ports.closeConnection;
      let once = true;
      world.ports.closeConnection = async (c) => {
        if (c === runConnection && once) {
          once = false;
          throw new Error('close refused');
        }
        return realClose(c);
      };
      await assertRejects(session.stop(), DebugCleanupError);
      assert.equal(session.holdsState(), true);
      world.run.resolve({ ok: true, output: 'late' });
      await advanceTimersByTimeAsync(0);
      assert.equal((await session.wait(0)).state, 'idle');
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
          { kind: 'class', name: 'CLASS_X' },
          IDS,
          world,
        );
        const gate = closeFails(world);
        world.run.resolve({ ok: true, output: 'total 6' });
        await advanceTimersByTimeAsync(0);
        await advanceTimersByTimeAsync(0);
        assert.deepStrictEqual(watch.seen, []);
        assertMatchObject(await session.wait(0), {
          state: 'ended',
          reason: 'run_finished',
        });
        assert.ok(
          session.failures().some((e) =>
            isDeepStrictEqual(e, {
              error: 'client_threw',
              message: 'close refused',
              step: "close the run's connection",
            }),
          ),
        );
        assert.equal(session.holdsState(), true);
        gate.refuse = false;
        assert.deepStrictEqual(await session.stop(), []);
        assert.equal(session.holdsState(), false);
        assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
      } finally {
        watch.off();
      }
    });

    it('a listener dropped on a failed poll: its connection is kept and named', async () => {
      const world = fakeWorld();
      const { session } = await started(undefined, IDS, world);
      const gate = closeFails(world);
      world.polls[1].resolve(refusedResponse('session gone'));
      await advanceTimersByTimeAsync(0);
      await assertRejects(session.wait(0), /session gone/);
      assert.ok(
        session.failures().some((e) =>
          isDeepStrictEqual(e, {
            error: 'client_threw',
            message: 'close refused',
            step: "close the listener's connection",
          }),
        ),
      );
      assert.equal(session.holdsState(), true);
      gate.refuse = false;
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
      await advanceTimersByTimeAsync(0);
      await assertRejects(session.wait(0), /attach broke/);
      assert.ok(
        session.failures().some((e) =>
          isDeepStrictEqual(e, {
            error: 'client_threw',
            message: 'close refused',
            step: "close the debuggee's connection",
          }),
        ),
      );
      gate.refuse = false;
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
      await advanceTimersByTimeAsync(0);
      await advanceTimersByTimeAsync(0);
      assert.ok(
        session
          .failures()
          .some(
            (f) =>
              f.message === 'work process busy' &&
              f.step === 'release the debuggee',
          ),
      );
      assert.equal(session.holdsState(), true);
      const attaching = world.opened[world.opened.length - 1];
      assert.ok(!world.closed.includes(attaching)); // kept: only it can release the debuggee
      delete world.override.step;
      assert.deepStrictEqual(await session.stop(), []);
      assert.ok(world.calls.includes('step:stepContinue:analysed')); // the retried release
      assert.ok(world.closed.includes(attaching));
      assert.equal(session.holdsState(), false);
    });
  });

  it('an attach overtaken by a newer generation whose release finds its connection spent: dropped without a request, nothing owed', async () => {
    const world = fakeWorld();
    const attach = deferred<any>();
    world.attachAnswers.push(() => attach.promise);
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.some((c) => c.startsWith('attach:')));
    (session as any).generation++; // the listener moved on while the attach ran
    world.override.step = async () =>
      refusedResponse('words that are never read', {
        origin: 'connection',
        sessionLost: 'ADT_SESSION_REPLACED',
      });
    attach.resolve(okResponse('<dbg:attach xmlns:dbg="x"/>'));
    await advanceTimersByTimeAsync(0);
    await advanceTimersByTimeAsync(0);
    const attaching = world.opened[world.opened.length - 1];
    assert.deepStrictEqual(world.dropped, [attaching]);
    assert.ok(!world.closed.includes(attaching));
    assert.deepStrictEqual(session.failures(), []);
    delete world.override.step;
    assert.deepStrictEqual(await session.stop(), []);
    assert.equal(session.holdsState(), false);
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
    await assertRejects(session.start('refuse', START), /no route to host/);
    assert.ok(!world.calls.includes('stopListener'));
    const s = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    assert.ok(world.calls.includes('stopListener'));
    assert.ok(
      world.calls.indexOf('stopListener') <
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
    await advanceTimersByTimeAsync(1000);
    assert.equal(done, false);
    const listenerConnection = world.opened[1];
    assert.ok(!world.closed.includes(listenerConnection));
    world.polls[1].resolve(LISTEN_NOTHING());
    await stopping;
    assert.ok(world.closed.includes(listenerConnection));
    assert.equal(session.holdsState(), false);
  });

  it('a failed answer of the stopped poll is a cleanup failure, named, kept for the next stop', async () => {
    const { session, world } = await started();
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      world.polls[1].resolve(refusedResponse('poll broke'));
      return okResponse(undefined);
    };
    await assertRejects(session.stop(), /listen: .*poll broke/);
    assert.deepStrictEqual(session.failures(), [
      { message: 'poll broke', origin: 'refusal', step: 'listen' },
    ]);
    assert.equal(session.holdsState(), true);
    delete world.override.stopListener;
    await session.stop();
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
    await advanceTimersByTimeAsync(0);
    assert.equal(late, false); // the stale loop did throw
    assert.equal(session.holdsState(), false);
    assert.equal((await session.wait(0)).state, 'idle');
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
        ...START,
        run: { kind: 'class', name: 'CLASS_X' },
      });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_CATCH());
      return { session, world, s };
    }

    it('releases the stop it attached', async () => {
      const { session, world, s } = await failedStart();
      await assertRejects(s, /^run refused$/);
      assert.ok(world.calls.includes('step:stepContinue:analysed'));
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    });

    it('names a release that failed, and keeps the stop for DebugStop', async () => {
      const world = fakeWorld();
      world.override.step = async () => refusedResponse('work process busy');
      const { session, s } = await failedStart(world);
      await assertRejects(s, /run refused; not undone: .*work process busy/);
      assert.equal((await session.wait(0)).state, 'stopped');
      delete world.override.step;
      await session.stop();
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    });
  });
});
