import { corpusBody } from '../../../lib/adtCorpus';
import {
  DebugListenerError,
  DebugRefusedError,
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
  rowsXml,
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

  it('the identity states user mode, and the attach names the same identity', async () => {
    const { world } = await stopped();
    const listen = world.log.find((c) => c.call === 'listen')!;
    expect(listen.args[0]).toEqual({
      debuggingMode: 'user',
      requestUser: 'SAPUSER01',
      terminalId: IDS.terminalId,
      ideId: IDS.ideId,
    });
    const attach = world.log.find((c) => c.call === 'attach')!;
    expect(attach.args[0]).toEqual(listen.args[0]);
  });

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
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
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
    expect(world.calls).toContain('stopListener');
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

  it('a catch SAP says cannot be attached is not attached: ended, and the listener polls again (debugger-run-to-line--02-listen with IS_ATTACH_IMPOSSIBLE true)', async () => {
    const world = fakeWorld();
    const { session } = await listening(world);
    world.polls[1].resolve(
      okResponse(
        corpusBody('debugger-run-to-line--02-listen').replace(
          '<IS_ATTACH_IMPOSSIBLE>false<',
          '<IS_ATTACH_IMPOSSIBLE>true<',
        ),
      ),
    );
    await until(() => world.polls.length === 3);
    expect(await session.wait(0)).toMatchObject({
      state: 'ended',
      reason: 'attach_impossible',
      message: expect.stringMatching(/cannot be attached/),
    });
    expect(world.calls.some((c) => c.startsWith('attach:'))).toBe(false);
  });

  it('a step answer updates what the stop says of the session (debugger-conversation--17-stepinto with isDebuggeeChanged true)', async () => {
    const { session, world } = await stopped();
    world.stepAnswers.push(
      okResponse(
        corpusBody('debugger-conversation--17-stepinto').replace(
          'isDebuggeeChanged="false"',
          'isDebuggeeChanged="true"',
        ),
      ),
    );
    const state = await session.step('stepInto');
    expect(state).toMatchObject({
      state: 'stopped',
      stop: { attach: { isDebuggeeChanged: true } },
    });
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

  describe('the breakpoint set', () => {
    const A = {
      kind: 'line',
      uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
    } as const;
    const B = {
      kind: 'line',
      uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=1',
    } as const;
    const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
    const STMT = { kind: 'statement', statement: 'MESSAGE' } as const;
    const NOT_HERE = 'Cannot create a breakpoint at this position';
    // The tags follow the order the session first saw each definition: bp1, bp2, …
    const ROW_A = { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri };
    const ROW_EXC = {
      kind: 'exception',
      id: 'E1',
      clientId: 'bp2',
      exceptionClass: 'CX_A',
    };

    it('a second change sends the first set with the new one, each with its tag, and keeps both', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () => okResponse(rowsXml([ROW_EXC, ROW_A])),
      );
      await session.setBreakpoints([A]);
      const second = await session.setBreakpoints([EXC]);
      expect(world.sent).toEqual([
        [{ ...A, clientId: 'bp1' }],
        [
          { ...A, clientId: 'bp1' },
          { ...EXC, clientId: 'bp2' },
        ],
      ]);
      expect(second.value.placed.map((r) => r.id)).toEqual(['E1', 'L10']);
      expect(second.value.unexpected).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([A, EXC]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1', 'L10']);
    });

    // Review Focus 6.
    it("a caller's clientId does not reach the wire: the session's tag does", async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      const a = await session.setBreakpoints([{ ...EXC, clientId: 'own' }]);
      expect(world.sent).toEqual([[{ ...EXC, clientId: 'bp1' }]]);
      expect(a.value.placed).toHaveLength(1);
      expect(a.value.refused).toEqual([]);
      expect(a.value.unexpected).toEqual([]);
    });

    it('no validationOnly request is ever made', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      await session.setBreakpoints([A, B, { kind: 'line', uri: '/x#start=2' }]);
      expect(world.calls.filter((c) => c.startsWith('validate'))).toEqual([]);
    });

    it('two lines answered out of order, the refusal first: each pairs by its tag, the refusal names its definition', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([{ kind: 'line', clientId: 'bp2', error: NOT_HERE }, ROW_A]),
        ),
      );
      const a = await session.setBreakpoints([A, B]);
      expect(a.value.refused).toEqual([{ requested: B, error: NOT_HERE }]);
      expect(a.value.lost).toEqual([]);
      expect(a.value.unexpected).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });

    it('an earlier breakpoint the system no longer places is lost, with its reason', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () =>
          okResponse(
            rowsXml([
              { kind: 'line', clientId: 'bp1', error: 'Source changed' },
              ROW_EXC,
            ]),
          ),
      );
      await session.setBreakpoints([A]);
      const next = await session.setBreakpoints([EXC]);
      expect(next.value.lost).toEqual([
        { requested: A, error: 'Source changed' },
      ]);
      expect(next.value.refused).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([EXC]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1']);
    });

    it('a delete by id removes exactly its definition, of two of one kind, and sends nothing else; the next change does not re-send it', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () =>
          okResponse(
            rowsXml([
              { kind: 'line', id: 'L1', clientId: 'bp2', uri: B.uri },
              ROW_A,
            ]),
          ),
        () =>
          okResponse(
            rowsXml([
              ROW_A,
              {
                kind: 'statement',
                id: 'S1',
                clientId: 'bp3',
                statement: 'MESSAGE',
              },
            ]),
          ),
      );
      await session.setBreakpoints([A, B]);
      world.calls.length = 0;
      await session.deleteBreakpoint('L1');
      expect(world.calls).toEqual(['deleteBreakpoint:L1']);
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
      await session.setBreakpoints([STMT]);
      expect(world.sent[1]).toEqual([
        { ...A, clientId: 'bp1' },
        { ...STMT, clientId: 'bp3' },
      ]);
    });

    it('an unexpected placed row is reported and stays armed; deleting it touches no definition', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([
            ROW_A,
            { kind: 'statement', id: 'S9', statement: 'MESSAGE' },
          ]),
        ),
      );
      const a = await session.setBreakpoints([A]);
      expect(a.value.unexpected).toEqual([{ kind: 'statement', id: 'S9' }]);
      expect(a.value.placed.map((r) => r.id)).toEqual(['L10', 'S9']);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10', 'S9']);
      await session.deleteBreakpoint('S9');
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });

    // Review Focus 2.
    it('a delete by an id the session does not hold is refused before the wire', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      await expect(session.deleteBreakpoint('L99')).rejects.toThrow(
        new DebugRefusedError(
          'no breakpoint L99 is armed in this debug session',
        ),
      );
      expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
        false,
      );
    });

    it('a delete before a start is refused as not started, not as not armed', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(session.deleteBreakpoint('L99')).rejects.toThrow(
        new DebugStateError('this debug session has not started'),
      );
      expect(world.calls).toEqual([]);
    });

    it('a failed replacement keeps both lists for the next change', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () => refusedResponse('Too many breakpoints'),
      );
      await session.setBreakpoints([A]);
      await expect(session.setBreakpoints([EXC])).rejects.toThrow(
        /Too many breakpoints/,
      );
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });
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

    it('an attach refused whose connection will not close: the connection is kept and named, and the listener goes on', async () => {
      const world = fakeWorld();
      world.attachAnswers.push(async () =>
        refusedResponse('Debuggee already attached'),
      );
      const { session } = await listening(world);
      const realClose = world.ports.closeConnection;
      let refuse = true;
      world.ports.closeConnection = async (c) => {
        if (refuse && c === world.opened[1]) throw new Error('close failed');
        return realClose(c);
      };
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.polls.length === 3);
      await settle();
      expect(unhandled).toEqual([]);
      expect(await session.wait(0)).toMatchObject({
        state: 'ended',
        reason: 'attach_refused',
      });
      expect((await session.wait(0)).state).toBe('listening');
      expect(session.failures().join()).toMatch(
        /the debuggee's connection was not closed: close failed/,
      );
      refuse = false;
      await session.stop();
      expect(session.holdsState()).toBe(false);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it('a refused start reports the breakpoint it could not delete, and keeps it armed', async () => {
      const world = fakeWorld();
      world.override.stopListener = async () =>
        refusedResponse('listener busy');
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
        /not undone: listener: listener busy; breakpoint .*: Breakpoint is locked/,
      );
      expect(session.listBreakpoints()).toHaveLength(1);
    });
  });
});
