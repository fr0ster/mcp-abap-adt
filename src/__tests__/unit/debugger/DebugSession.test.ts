import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  DebugListenerError,
  DebugRefusedError,
  DebugSession,
  DebugStateError,
  FIRST_POLL_HOLD_SECONDS,
  LISTEN_HOLD_SECONDS,
} from '../../../lib/debugger/DebugSession';
import {
  methodFailureOf,
  payloadCarriedBy,
} from '../../../lib/strategies/step';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  advanceTimersByTimeAsync,
  realTurn,
  track,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import {
  CONFLICT,
  deferred,
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  START,
  until,
} from './fakes';

describe('DebugSession', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function listening(world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    assert.equal(world.polls[0].hold, FIRST_POLL_HOLD_SECONDS);
    world.polls[0].resolve(LISTEN_NOTHING());
    assertMatchObject(await started, { state: 'listening' });
    await until(() => world.polls.length === 2);
    assert.equal(world.polls[1].hold, LISTEN_HOLD_SECONDS);
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
    assert.deepStrictEqual(listen.args[0], {
      debuggingMode: 'user',
      requestUser: 'SAPUSER01',
      terminalId: IDS.terminalId,
      ideId: IDS.ideId,
    });
    const attach = world.log.find((c) => c.call === 'attach')!;
    assert.deepStrictEqual(attach.args[0], listen.args[0]);
  });

  it('the first poll is short and decides the start; then the long poll stands', async () => {
    await listening();
  });

  it('a conflict on the first poll fails the start: nothing stays armed, nothing runs', async () => {
    const world = fakeWorld();
    const ran = mock.method(world.ports, 'run');
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', {
      ...START,
      run: { kind: 'class', name: 'CLASS_X' },
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await assertRejects(started, DebugListenerError);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    assert.equal(ran.mock.callCount(), 0);
    assert.equal((await session.wait(0)).state, 'idle');
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
    await assertRejects(started, DebugListenerError);
    assert.ok(world.calls.includes('stopListener'));
    assert.equal(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:')),
      false,
    );
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
    await assertRejects(started, /socket hang up/);
    assert.deepStrictEqual(session.listBreakpoints(), []);
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
    await assertRejects(started, DebugListenerError);
    assert.ok(world.calls.includes('stopListener'));
  });

  it('a debuggee caught on the first poll is attached at once', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    assertMatchObject(await started, { state: 'stopped' });
    assert.equal(world.polls.length, 1);
  });

  it('caught → attached on a new connection routed to the debuggee server; the listener stands', async () => {
    const { session, world } = await stopped();
    assert.ok(
      world.calls.includes(
        'attach:194B2024D1671FE1B0DDF891EDADF59C:appserver_SYS_00',
      ),
    );
    assert.equal((await session.wait(0)).state, 'stopped');
    assert.equal(world.polls.length, 2);
  });

  it('a later conflict fails the next wait once; the listener is not restarted', async () => {
    const { session, world } = await listening();
    world.polls[1].resolve(CONFLICT());
    await until(() => world.closed.length === 1);
    await assertRejects(session.wait(0), /SY 530/);
    assert.equal((await session.wait(0)).state, 'idle');
    assert.equal(world.polls.length, 2);
  });

  it('a second start is refused', async () => {
    const { session } = await listening();
    await assertRejects(session.start('refuse', START), DebugStateError);
  });

  it('wait returns on a catch, before its hold ends, and holds at most 30 s', async () => {
    const { session, world } = await listening();
    const w1 = session.wait(30);
    world.polls[1].resolve(LISTEN_CATCH());
    assertMatchObject(await w1, { state: 'stopped' });
    const { session: s2 } = await listening();
    // Settled by the wait's 30 s cap, a fake timer: tracked, not awaited.
    const w2 = track(s2.wait(600));
    await advanceTimersByTimeAsync(30_000);
    assert.ok(w2.settled);
    assert.deepStrictEqual(w2.value, { state: 'listening' });
  });

  it('a refused attach is reported as ended and the listener polls again', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () =>
      refusedResponse('Debuggee already attached'),
    );
    const { session } = await listening(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.polls.length === 3);
    assertMatchObject(await session.wait(0), {
      state: 'ended',
      reason: 'attach_refused',
      // The method's error as it is, with the step; no text of ours.
      failure: {
        message: 'Debuggee already attached',
        origin: 'refusal',
        step: 'attach',
      },
    });
    assert.equal(world.closed.length, 1); // the attach connection
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
    const ended = await session.wait(0);
    assertMatchObject(ended, { state: 'ended', reason: 'attach_impossible' });
    assert.ok('message' in ended && typeof ended.message === 'string');
    assert.match(ended.message, /cannot be attached/);
    assert.equal(
      world.calls.some((c) => c.startsWith('attach:')),
      false,
    );
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
    assertMatchObject(state, {
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
    const failed = await session.wait(0).then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(failed instanceof DebugListenerError);
    // A throw is ours, never dressed as SAP's answer, with the step.
    assert.deepStrictEqual(payloadCarriedBy(failed), {
      error: 'client_threw',
      message: 'socket hang up',
      step: 'attach',
    });
  });

  it('a listen that throws is a listener failure with the step listen', async () => {
    const { session, world } = await listening();
    world.polls[1].reject(new Error('socket hang up'));
    await until(() => world.closed.length === 1);
    const failed = await session.wait(0).then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(failed instanceof DebugListenerError);
    assert.deepStrictEqual(payloadCarriedBy(failed), {
      error: 'client_threw',
      message: 'socket hang up',
      step: 'listen',
    });
  });

  it('a refused listen carries the method error as it is, with the step listen', async () => {
    const { session, world } = await listening();
    world.polls[1].resolve(refusedResponse('Listener is gone'));
    await until(() => world.closed.length === 1);
    const failed = await session.wait(0).then(
      () => undefined,
      (e: unknown) => e,
    );
    assertMatchObject(methodFailureOf(failed), {
      message: 'Listener is gone',
      origin: 'refusal',
      step: 'listen',
    });
  });

  it('a step that stays rereads the stack; a refused step keeps the stop', async () => {
    const { session, world } = await stopped();
    assert.equal((await session.step('stepOver')).state, 'stopped');
    assert.equal(world.calls.filter((c) => c === 'getStack').length, 2);
    world.stepAnswers.push(refusedResponse('Parameter uri could not be found'));
    await assertRejects(
      session.stepToLine('stepRunToLine', '/x#start=1'),
      /uri could not be found/,
    );
    assert.equal((await session.wait(0)).state, 'stopped');
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
    assert.deepStrictEqual(await session.step('stepContinue'), {
      state: 'ended',
      reason: 'debuggee_ended',
    });
    await until(() => world.polls.length === 3);
  });

  it('terminate, answered with nothing by the default strategy, ends as terminated', async () => {
    const { session, world } = await stopped();
    assert.deepStrictEqual(await session.terminate(), {
      state: 'ended',
      reason: 'terminated',
    });
    assert.ok(world.calls.includes('terminate:analysed'));
  });

  it('stop tools without a stop are refused and send nothing', async () => {
    const { session, world } = await listening();
    const before = world.calls.length;
    await assertRejects(session.getStack(), /no debuggee is stopped/);
    await assertRejects(session.step('stepOver'), DebugStateError);
    assert.equal(world.calls.length, before);
  });

  describe('the breakpoint set', () => {
    // A start arms at least one breakpoint: W, the start's own, is the set's first
    // definition and travels with every later change.
    const W = START.breakpoints[0];
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
    // The tags follow the order the session first saw each definition: bp1 (the
    // start's), bp2, …
    const ROW_W = {
      kind: 'statement',
      id: 'W1',
      clientId: 'bp1',
      statement: 'WRITE',
    };
    const ROW_A = { kind: 'line', id: 'L10', clientId: 'bp2', uri: A.uri };
    const ROW_EXC = {
      kind: 'exception',
      id: 'E1',
      clientId: 'bp3',
      exceptionClass: 'CX_A',
    };
    /** Listening, the start's breakpoint placed as W1; `world.sent[0]` is the start's arming. */
    async function armed() {
      const world = fakeWorld();
      world.breakpointAnswers.push(() => okResponse(rowsXml([ROW_W])));
      const { session } = await listening(world);
      return { world, session };
    }

    it('a second change sends the first set with the new one, each with its tag, and keeps both', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_W, ROW_A])),
        () => okResponse(rowsXml([ROW_EXC, ROW_A, ROW_W])),
      );
      await session.setBreakpoints([A]);
      const second = await session.setBreakpoints([EXC]);
      assert.deepStrictEqual(world.sent, [
        [{ ...W, clientId: 'bp1' }],
        [
          { ...W, clientId: 'bp1' },
          { ...A, clientId: 'bp2' },
        ],
        [
          { ...W, clientId: 'bp1' },
          { ...A, clientId: 'bp2' },
          { ...EXC, clientId: 'bp3' },
        ],
      ]);
      assert.deepStrictEqual(
        second.value.placed.map((r) => r.id),
        ['E1', 'L10', 'W1'],
      );
      assert.deepStrictEqual(second.value.unexpected, []);
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, A, EXC]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['E1', 'L10', 'W1'],
      );
    });

    // Review Focus 6.
    it("a caller's clientId does not reach the wire: the session's tag does", async () => {
      const { world, session } = await armed();
      const a = await session.setBreakpoints([{ ...EXC, clientId: 'own' }]);
      assert.deepStrictEqual(world.sent.slice(1), [
        [
          { ...W, clientId: 'bp1' },
          { ...EXC, clientId: 'bp2' },
        ],
      ]);
      assert.equal(a.value.placed.length, 2);
      assert.deepStrictEqual(a.value.refused, []);
      assert.deepStrictEqual(a.value.unexpected, []);
    });

    it('no validationOnly request is ever made', async () => {
      const { world, session } = await armed();
      await session.setBreakpoints([A, B, { kind: 'line', uri: '/x#start=2' }]);
      assert.deepStrictEqual(
        world.calls.filter((c) => c.startsWith('validate')),
        [],
      );
    });

    it('two lines answered out of order, the refusal first: each pairs by its tag, the refusal names its definition', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([
            { kind: 'line', clientId: 'bp3', error: NOT_HERE },
            ROW_A,
            ROW_W,
          ]),
        ),
      );
      const a = await session.setBreakpoints([A, B]);
      assert.deepStrictEqual(a.value.refused, [
        { requested: B, error: NOT_HERE },
      ]);
      assert.deepStrictEqual(a.value.lost, []);
      assert.deepStrictEqual(a.value.unexpected, []);
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, A]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['L10', 'W1'],
      );
    });

    it('an earlier breakpoint the system no longer places is lost, with its reason', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_W, ROW_A])),
        () =>
          okResponse(
            rowsXml([
              ROW_W,
              { kind: 'line', clientId: 'bp2', error: 'Source changed' },
              ROW_EXC,
            ]),
          ),
      );
      await session.setBreakpoints([A]);
      const next = await session.setBreakpoints([EXC]);
      assert.deepStrictEqual(next.value.lost, [
        { requested: A, error: 'Source changed' },
      ]);
      assert.deepStrictEqual(next.value.refused, []);
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, EXC]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['W1', 'E1'],
      );
    });

    it('a delete by id removes exactly its definition, of two of one kind, and sends nothing else; the next change does not re-send it', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(
        () =>
          okResponse(
            rowsXml([
              ROW_W,
              { kind: 'line', id: 'L1', clientId: 'bp3', uri: B.uri },
              ROW_A,
            ]),
          ),
        () =>
          okResponse(
            rowsXml([
              ROW_W,
              ROW_A,
              {
                kind: 'statement',
                id: 'S1',
                clientId: 'bp4',
                statement: 'MESSAGE',
              },
            ]),
          ),
      );
      await session.setBreakpoints([A, B]);
      world.calls.length = 0;
      await session.deleteBreakpoint('L1');
      assert.deepStrictEqual(world.calls, ['deleteBreakpoint:L1']);
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, A]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['W1', 'L10'],
      );
      await session.setBreakpoints([STMT]);
      assert.deepStrictEqual(world.sent[2], [
        { ...W, clientId: 'bp1' },
        { ...A, clientId: 'bp2' },
        { ...STMT, clientId: 'bp4' },
      ]);
    });

    it('an unexpected placed row is reported and stays armed; deleting it touches no definition', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([
            ROW_W,
            ROW_A,
            { kind: 'statement', id: 'S9', statement: 'MESSAGE' },
          ]),
        ),
      );
      const a = await session.setBreakpoints([A]);
      assert.deepStrictEqual(a.value.unexpected, [
        { kind: 'statement', id: 'S9' },
      ]);
      assert.deepStrictEqual(
        a.value.placed.map((r) => r.id),
        ['W1', 'L10', 'S9'],
      );
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['W1', 'L10', 'S9'],
      );
      await session.deleteBreakpoint('S9');
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, A]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['W1', 'L10'],
      );
    });

    // Review Focus 2.
    it('a delete by an id the session does not hold is refused before the wire', async () => {
      const { world, session } = await armed();
      await assertRejects(
        session.deleteBreakpoint('L99'),
        new DebugRefusedError(
          'no breakpoint L99 is armed in this debug session',
        ),
      );
      assert.equal(
        world.calls.some((c) => c.startsWith('deleteBreakpoint:')),
        false,
      );
    });

    it('a delete before a start is refused as not started, not as not armed', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.deleteBreakpoint('L99'),
        new DebugStateError('this debug session has not started'),
      );
      assert.deepStrictEqual(world.calls, []);
    });

    it('a failed replacement keeps both lists for the next change', async () => {
      const { world, session } = await armed();
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_W, ROW_A])),
        () => refusedResponse('Too many breakpoints'),
      );
      await session.setBreakpoints([A]);
      await assertRejects(
        session.setBreakpoints([EXC]),
        /Too many breakpoints/,
      );
      assert.deepStrictEqual(session.requestedBreakpoints(), [W, A]);
      assert.deepStrictEqual(
        session.listBreakpoints().map((r) => r.id),
        ['W1', 'L10'],
      );
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
    const settle = () => realTurn();

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
      await advanceTimersByTimeAsync(0);
      await settle();
      assert.deepStrictEqual(unhandled, []);
      await assertRejects(session.wait(0), /SY 530/);
      assert.equal((await session.wait(0)).state, 'idle');
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
        if (refuse && c === world.opened[2]) throw new Error('close failed');
        return realClose(c);
      };
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.polls.length === 3);
      await settle();
      assert.deepStrictEqual(unhandled, []);
      assertMatchObject(await session.wait(0), {
        state: 'ended',
        reason: 'attach_refused',
      });
      assert.equal((await session.wait(0)).state, 'listening');
      assert.deepStrictEqual(session.failures(), [
        {
          error: 'client_threw',
          message: 'close failed',
          step: "close the debuggee's connection",
        },
      ]);
      refuse = false;
      await session.stop();
      assert.equal(session.holdsState(), false);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
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
      assert.ok(error instanceof DebugListenerError);
      assert.match((error as Error).message, /SY 530/);
      assert.match(
        (error as Error).message,
        /not undone: stop listener: listener busy; delete breakpoint .*: Breakpoint is locked/,
      );
      assert.equal(session.listBreakpoints().length, 1);
    });
  });
});
