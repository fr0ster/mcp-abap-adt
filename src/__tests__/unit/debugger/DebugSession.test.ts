import { corpusBody } from '../../../lib/adtCorpus';
import {
  DebugListenerError,
  DebugSession,
  DebugStateError,
  FIRST_POLL_HOLD_SECONDS,
  LISTEN_HOLD_SECONDS,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  CONFLICT,
  deferred,
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  until,
} from './fakes';

describe('DebugSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listening(world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    expect(world.polls[0].hold).toBe(FIRST_POLL_HOLD_SECONDS);
    world.polls[0].resolve(LISTEN_NOTHING());
    await expect(started).resolves.toEqual({ state: 'listening' });
    await until(() => world.polls.length === 2);
    expect(world.polls[1].hold).toBe(LISTEN_HOLD_SECONDS);
    return { session, world };
  }
  async function stopped() {
    const { session, world } = await listening();
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    return { session, world };
  }

  it('the first poll is short and decides the start; then the long poll stands', async () => {
    await listening();
  });

  it('a conflict on the first poll fails the start: nothing stays armed, nothing runs', async () => {
    const world = fakeWorld();
    const ran = jest.spyOn(world.ports, 'run');
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', {
      run: { kind: 'class', name: 'ZCL_X' },
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.closed).toEqual(world.opened);
    expect(ran).not.toHaveBeenCalled();
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('a refused start undoes the breakpoints it armed', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', {
      breakpoints: [
        {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
        },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:KIND=0.')),
    ).toBe(true);
    expect(session.listBreakpoints()).toEqual([]);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('an attach that throws after arming fails the start and undoes the breakpoints', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () => {
      throw new Error('socket hang up');
    });
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', {
      breakpoints: [
        {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
        },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    await expect(started).rejects.toThrow(/socket hang up/);
    expect(session.listBreakpoints()).toEqual([]);
  });

  it('a rollback step that throws does not skip the next', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const realClose = world.ports.closeConnection;
    world.ports.closeConnection = async (c) => {
      if (world.closed.length === 0) {
        world.closed.push(c);
        throw new Error('close failed');
      }
      return realClose(c);
    };
    const started = session.start('refuse', {
      breakpoints: [
        {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
        },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      true,
    );
  });

  it('a debuggee caught on the first poll is attached at once', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    await expect(started).resolves.toMatchObject({ state: 'stopped' });
    expect(world.polls).toHaveLength(1);
  });

  it('caught → attached on a new connection routed to the debuggee server; the listener stands', async () => {
    const { session, world } = await stopped();
    expect(world.calls).toContain(
      'attach:194B2024D1671FE1B0DDF891EDADF59C:appserver_SYS_00',
    );
    expect((await session.wait(0)).state).toBe('stopped');
    expect(world.polls).toHaveLength(2);
  });

  it('a later conflict fails the next wait once; the listener is not restarted', async () => {
    const { session, world } = await listening();
    world.polls[1].resolve(CONFLICT());
    await until(() => world.closed.length === 1);
    await expect(session.wait(0)).rejects.toThrow(/SY 530/);
    expect((await session.wait(0)).state).toBe('idle');
    expect(world.polls).toHaveLength(2);
  });

  it('a second start is refused', async () => {
    const { session } = await listening();
    await expect(session.start('refuse')).rejects.toThrow(DebugStateError);
  });

  it('wait returns on a catch, before its hold ends, and holds at most 30 s', async () => {
    const { session, world } = await listening();
    const w1 = session.wait(30);
    world.polls[1].resolve(LISTEN_CATCH());
    await expect(w1).resolves.toMatchObject({ state: 'stopped' });
    const { session: s2 } = await listening();
    const w2 = s2.wait(600);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(w2).resolves.toEqual({ state: 'listening' });
  });

  it('a refused attach is reported as ended and the listener polls again', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () =>
      refusedResponse('Debuggee already attached'),
    );
    const { session } = await listening(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.polls.length === 3);
    expect(await session.wait(0)).toMatchObject({
      state: 'ended',
      reason: 'attach_refused',
      message: 'Debuggee already attached',
    });
    expect(world.closed).toHaveLength(1); // the attach connection
  });

  it('an attach that throws is a listener failure, not a silent stop', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () => {
      throw new Error('socket hang up');
    });
    const { session } = await listening(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.closed.length === 2);
    await expect(session.wait(0)).rejects.toThrow(/socket hang up/);
  });

  it('a step that stays rereads the stack; a refused step keeps the stop', async () => {
    const { session, world } = await stopped();
    expect((await session.step('stepOver')).state).toBe('stopped');
    expect(world.calls.filter((c) => c === 'getStack')).toHaveLength(2);
    world.stepAnswers.push(refusedResponse('Parameter uri could not be found'));
    await expect(
      session.stepToLine('stepRunToLine', '/x#start=1'),
    ).rejects.toThrow(/uri could not be found/);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('debuggeeEnded ends the stop, not as an error, and the listener polls again', async () => {
    const { session, world } = await stopped();
    world.stepAnswers.push(
      okResponse(
        corpusBody('debugger-terminate--01-terminate-debuggee').replace(
          'terminateDebuggee',
          'debuggeeEnded',
        ),
      ),
    );
    await expect(session.step('stepContinue')).resolves.toEqual({
      state: 'ended',
      reason: 'debuggee_ended',
    });
    await until(() => world.polls.length === 3);
  });

  it('terminate, answered with nothing by the default strategy, ends as terminated', async () => {
    const { session, world } = await stopped();
    await expect(session.terminate()).resolves.toEqual({
      state: 'ended',
      reason: 'terminated',
    });
    expect(world.calls).toContain('terminate:analysed');
  });

  it('stop tools without a stop are refused and send nothing', async () => {
    const { session, world } = await listening();
    const before = world.calls.length;
    await expect(session.getStack()).rejects.toThrow(/no debuggee is stopped/);
    await expect(session.step('stepOver')).rejects.toThrow(DebugStateError);
    expect(world.calls.length).toBe(before);
  });

  it('breakpoints: placed kept by id, a refusal matched by content', async () => {
    const { session } = await listening();
    const a = await session.setBreakpoints([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
      },
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1',
      },
    ]);
    expect(a.value.placed).toHaveLength(1);
    expect(a.value.refused).toEqual([
      {
        requested: {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1',
        },
        error: 'Cannot create a breakpoint at this position',
      },
    ]);
    expect(session.listBreakpoints()).toHaveLength(1);
  });

  it('refusals ambiguous within a kind are asked one by one with validationOnly', async () => {
    const world = fakeWorld();
    const { session } = await listening(world);
    const refusal = (msg: string) => () =>
      okResponse(
        `<dbg:breakpoints xmlns:dbg="x"><breakpoint kind="line" errorMessage="${msg}"/></dbg:breakpoints>`,
      );
    world.setValidationAnswers([refusal('first'), refusal('second')]);
    // two line refusals with the one placed answer of the recorded file → 3 requested, 1 placed, 2 unmatched
    const a = await session.setBreakpoints([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
      },
      { kind: 'line', uri: '/x#start=1' },
      { kind: 'line', uri: '/x#start=2' },
    ]);
    expect(a.value.refused.map((r) => r.error)).toEqual(['first', 'second']);
    expect(world.calls).toContain('validate:1');
  });

  describe('a cleanup that fails is reported, never a silent success', () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    beforeEach(() => {
      unhandled.length = 0;
      process.on('unhandledRejection', onUnhandled);
    });
    afterEach(() => process.off('unhandledRejection', onUnhandled));
    /** Lets Node run its rejection bookkeeping, which fake timers do not cover. */
    const settle = () =>
      new Promise<void>((resolve) =>
        jest.requireActual('timers').setImmediate(resolve),
      );

    it('a close that throws while a later conflict drops the listener: the conflict once, then idle', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      let attempts = 0;
      world.ports.closeConnection = async () => {
        attempts++;
        throw new Error('close failed');
      };
      world.polls[1].resolve(CONFLICT());
      await until(() => attempts >= 1);
      await jest.advanceTimersByTimeAsync(0);
      await settle();
      expect(unhandled).toEqual([]);
      await expect(session.wait(0)).rejects.toThrow(/SY 530/);
      expect((await session.wait(0)).state).toBe('idle');
    });

    it('an attach refused whose connection will not close: the failure is reported and the listener dropped', async () => {
      const world = fakeWorld();
      world.attachAnswers.push(async () =>
        refusedResponse('Debuggee already attached'),
      );
      const { session } = await listening(world);
      const realClose = world.ports.closeConnection;
      world.ports.closeConnection = async (c) => {
        if (c === world.opened[1]) throw new Error('close failed');
        return realClose(c);
      };
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.closed.includes(world.opened[0]));
      await settle();
      expect(unhandled).toEqual([]);
      await expect(session.wait(0)).rejects.toThrow(/close failed/);
      expect(await session.wait(0)).toMatchObject({
        state: 'ended',
        reason: 'attach_refused',
      });
      expect((await session.wait(0)).state).toBe('idle');
      expect(world.polls).toHaveLength(2);
    });

    it('a refused start reports the breakpoint it could not delete, and keeps it armed', async () => {
      const world = fakeWorld();
      world.override.deleteBreakpoint = async () =>
        refusedResponse('Breakpoint is locked');
      const session = new DebugSession(world.ports, IDS).bind('origin');
      const started = session.start('refuse', {
        breakpoints: [
          {
            kind: 'line',
            uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
          },
        ],
      });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(CONFLICT());
      const error = await started.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DebugListenerError);
      expect((error as Error).message).toMatch(/SY 530/);
      expect((error as Error).message).toMatch(
        /not undone: .*Breakpoint is locked/,
      );
      expect(session.listBreakpoints()).toHaveLength(1);
    });
  });
});
