import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  DebugCleanupError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { return_error } from '../../../lib/utils';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  advanceTimersByTimeAsync,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import {
  assertMessageHolding,
  CONFLICT,
  CONFLICT_409,
  deferred,
  fakeWorld,
  IDS,
  INVALID_USER,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  START,
  stringOf,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
// The session's tags: A is the first definition it was given, EXC the second.
const ROWS = () =>
  okResponse(
    rowsXml([
      { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri },
      { kind: 'exception', id: 'E1', clientId: 'bp2', exceptionClass: 'CX_A' },
    ]),
  );
const DEBUGGEE_KEPT =
  "not sent: the listener's stop failed and a breakpoint may still be set, where the debuggee would stop again. It stays held for the next stop.";
const NOT_COMPLETE =
  'the cleanup of this debug session is not complete: DebugStop it, then start again';

describe('the cleanup', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function armed(
    world = fakeWorld(),
    start: Partial<Parameters<DebugSession['start']>[1]> = {},
  ) {
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', {
      breakpoints: [A, EXC],
      ...start,
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  it('after a successful stopListener both lists are empty, nothing is deleted by id, and earlier per-id failures are gone', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('Breakpoint is locked');
    await assertRejects(
      session.stop(),
      /stop listener: listener busy; delete breakpoint L10: Breakpoint is locked; delete breakpoint E1: Breakpoint is locked/,
    );
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.calls.length = 0;
    await session.stop();
    assert.ok(world.calls.includes('stopListener'));
    assert.equal(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:')),
      false,
    );
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.deepStrictEqual(session.requestedBreakpoints(), []);
    assert.deepStrictEqual(session.failures(), []);
    assert.equal(session.holdsState(), false);
  });

  it('after a failed stopListener the per-id deletes run, and what fails stays for the next stop', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    await assertRejects(session.stop(), DebugCleanupError);
    assert.deepStrictEqual(
      session.listBreakpoints().map((r) => r.id),
      ['E1'],
    );
    assert.deepStrictEqual(session.requestedBreakpoints(), [EXC]);
    // Each in the shape of every other failure: the method's error as it
    // is, with its step — not one text.
    assert.deepStrictEqual(session.failures(), [
      { message: 'listener busy', origin: 'refusal', step: 'stop listener' },
      {
        message: 'Breakpoint is locked',
        origin: 'refusal',
        step: 'delete breakpoint E1',
      },
    ]);
    assert.equal(session.holdsState(), true);
  });

  // A debuggee let go while a breakpoint may still be set can stop there
  // again — inside a loop, at once. So when the listener's stop failed and a
  // breakpoint's delete by id failed too, the held debuggee is not released:
  // it stays held for the next stop, which releases it once the breakpoints
  // are gone.
  it('a failed stopListener and a failed delete by id: the held debuggee is not released, it stays for the next stop', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    world.calls.length = 0;
    await assertRejects(
      session.stop(),
      /release the debuggee: not sent: the listener's stop failed and a breakpoint may still be set/,
    );
    assert.deepStrictEqual(
      world.calls.filter((c) => c.startsWith('step:')),
      [],
    );
    assert.deepStrictEqual(session.failures(), [
      { message: 'listener busy', origin: 'refusal', step: 'stop listener' },
      {
        message: 'Breakpoint is locked',
        origin: 'refusal',
        step: 'delete breakpoint E1',
      },
      {
        message: DEBUGGEE_KEPT,
        step: 'release the debuggee',
      },
    ]);
    assert.equal(session.holdsState(), true);
    // The next stop: the listener's stop succeeds first, then the release.
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.calls.length = 0;
    assert.deepStrictEqual(await session.stop(), []);
    const release = world.calls.indexOf('step:stepContinue:analysed');
    assert.ok(release > world.calls.indexOf('stopListener'));
    assert.ok(world.calls.indexOf('stopListener') >= 0);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  // The run's request is the one held at the breakpoint: its connection's
  // logoff would end the session of the debuggee kept for the next stop. So
  // the run and its connection stay with the held debuggee, and the stop that
  // releases it closes the run's connection after the release.
  it('a debuggee kept held keeps its run and the run connection: the stop that releases it closes it, after the release', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, {
      run: { kind: 'class', name: 'CLASS_X' },
    });
    await until(() => world.runs.length === 1);
    const runConnection = world.opened[world.sessionKinds.indexOf('stateless')];
    assert.notEqual(runConnection, undefined);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    await assertRejects(session.stop(), DebugCleanupError);
    assert.ok(!world.closed.includes(runConnection));
    assert.equal(session.holdsState(), true);
    // The next stop releases the debuggee, then closes the run's connection.
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    const close = world.ports.closeConnection;
    world.ports.closeConnection = async (c) => {
      if (c === runConnection) world.calls.push('close:run');
      return close(c);
    };
    world.calls.length = 0;
    assert.deepStrictEqual(await session.stop(), []);
    assert.ok(
      world.calls.indexOf('close:run') >
        world.calls.indexOf('step:stepContinue:analysed'),
    );
    assert.ok(
      world.calls.indexOf('step:stepContinue:analysed') >
        world.calls.indexOf('stopListener'),
    );
    assert.ok(world.calls.indexOf('stopListener') >= 0);
    assert.ok(world.closed.includes(runConnection));
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a release an earlier stop owed is not sent either while a breakpoint may still be set', async () => {
    const world = fakeWorld();
    const attach = deferred<any>();
    world.attachAnswers.push(() => attach.promise);
    const { session } = await armed(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.some((c) => c.startsWith('attach:')));
    (session as any).generation++; // the listener moved on while the attach ran
    world.override.step = async () => refusedResponse('work process busy');
    attach.resolve(okResponse('<dbg:attach xmlns:dbg="x"/>'));
    await advanceTimersByTimeAsync(0);
    await advanceTimersByTimeAsync(0);
    delete world.override.step;
    // Owed now; the stop that follows fails its listener stop and a delete.
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    world.calls.length = 0;
    await assertRejects(session.stop(), DebugCleanupError);
    assert.deepStrictEqual(
      world.calls.filter((c) => c.startsWith('step:')),
      [],
    );
    assert.ok(
      session.failures().some((e) =>
        isDeepStrictEqual(e, {
          message: DEBUGGEE_KEPT,
          step: 'release the debuggee',
        }),
      ),
    );
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.calls.length = 0;
    assert.deepStrictEqual(await session.stop(), []);
    assert.ok(
      world.calls.indexOf('step:stepContinue:analysed') >
        world.calls.indexOf('stopListener'),
    );
    assert.ok(world.calls.indexOf('stopListener') >= 0);
    assert.equal(session.holdsState(), false);
  });

  it('a release an earlier stop owed whose connection is spent is dropped without a request, reported, and owed no more', async () => {
    const world = fakeWorld();
    const attach = deferred<any>();
    world.attachAnswers.push(() => attach.promise);
    const { session } = await armed(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.some((c) => c.startsWith('attach:')));
    (session as any).generation++; // the listener moved on while the attach ran
    world.override.step = async () => refusedResponse('work process busy');
    attach.resolve(okResponse('<dbg:attach xmlns:dbg="x"/>'));
    await advanceTimersByTimeAsync(0);
    await advanceTimersByTimeAsync(0);
    // Owed now; its connection is spent by the time the stop releases it.
    world.override.step = async () =>
      refusedResponse('words that are never read', {
        origin: 'connection',
        sessionError: 'ADT_NOT_CONNECTED',
      });
    const closedBefore = world.closed.length;
    const notes = await session.stop();
    assert.equal(world.dropped.length, 1);
    assert.ok(!world.closed.slice(closedBefore).includes(world.dropped[0]));
    assert.equal(notes.length, 1);
    assertMessageHolding(notes[0]?.cleanup, 'dropped');
    assert.deepStrictEqual(session.failures(), []);
    assert.equal(session.holdsState(), false);
  });

  it('a failed stopListener whose deletes by id all succeeded: the held debuggee is released, after the deletes', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.calls.length = 0;
    await assertRejects(session.stop(), /stop listener: listener busy/);
    const release = world.calls.indexOf('step:stepContinue:analysed');
    assert.ok(release > world.calls.lastIndexOf('deleteBreakpoint:E1'));
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.deepStrictEqual(session.failures(), [
      { message: 'listener busy', origin: 'refusal', step: 'stop listener' },
    ]);
  });

  it('a start that failed after a change runs the same cleanup: stopListener, no deletion by id', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await assertRejects(s, /SY 530/);
    assert.ok(world.calls.includes('stopListener'));
    assert.equal(
      world.calls.some((c) => c.startsWith('deleteBreakpoint:')),
      false,
    );
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a start refused by the preflight 409, or before the wire, sends no stopListener and no deletion', async () => {
    const world = fakeWorld();
    world.checkAnswers.push(CONFLICT_409);
    const held = new DebugSession(
      world.ports,
      { ...IDS, stated: true },
      { breakpointConflict: 'refuse-if-held' },
    ).bind('origin');
    await assertRejects(
      held.start('refuse', { breakpoints: [A] }),
      /global debugging scope/,
    );
    const terminal = new DebugSession(world.ports, IDS).bind('origin');
    await assertRejects(
      terminal.start('refuse', {
        ...START,
        debuggingMode: 'terminal',
        requestUser: 'SAPUSER02',
      }),
      'request_user does not apply to terminal mode',
    );
    assert.deepStrictEqual(world.calls, ['checkListener']);
  });

  it('a close that fails during a refusal before any change keeps the identity; a new start is refused; DebugStop completes the cleanup and a start is accepted', async () => {
    const world = fakeWorld();
    world.checkAnswers.push(CONFLICT_409);
    const realClose = world.ports.closeConnection;
    let once = true;
    world.ports.closeConnection = async (c) => {
      if (once) {
        once = false;
        throw new Error('close refused');
      }
      return realClose(c);
    };
    const session = new DebugSession(
      world.ports,
      { ...IDS, stated: true },
      { breakpointConflict: 'refuse-if-held' },
    ).bind('origin');
    await assertRejects(
      session.start('refuse', {
        ...START,
        requestUser: 'SAPUSER02',
        settings: { systemDebugging: true },
        breakpoints: [A],
      }),
      /global debugging scope.*not closed: .*close refused/,
    );
    assert.ok(!world.calls.includes('stopListener'));
    assertMatchObject(session.currentIdentity(), {
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    assert.deepStrictEqual(session.preferredSettings(), {
      systemDebugging: true,
    });
    assert.equal(session.holdsState(), true);
    await assertRejects(
      session.start('refuse', { breakpoints: [A] }),
      NOT_COMPLETE,
    );
    await session.stop();
    assert.equal(session.currentIdentity(), undefined);
    assert.deepStrictEqual(session.preferredSettings(), {});
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    world.breakpointAnswers.push(ROWS);
    const again = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    assert.notEqual(await again, undefined);
    assertMatchObject(session.currentIdentity(), { debuggingMode: 'user' });
  });

  it('a failed stop keeps the identity and the settings; a new start is refused; the retry addresses the same key; a complete one clears them', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, {
      requestUser: 'SAPUSER02',
      settings: { systemDebugging: true },
    });
    world.override.stopListener = async () => refusedResponse('listener busy');
    await assertRejects(session.stop(), /listener busy/);
    assertMatchObject(session.currentIdentity(), {
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    assert.deepStrictEqual(session.preferredSettings(), {
      systemDebugging: true,
    });
    await assertRejects(
      session.start('refuse', { ...START, requestUser: 'SAPUSER03' }),
      DebugStateError,
    );
    delete world.override.stopListener;
    world.log.length = 0;
    await session.stop();
    assertMatchObject(
      world.log.find((c) => c.call === 'stopListener')!.args[0],
      { requestUser: 'SAPUSER02' },
    );
    assert.equal(session.currentIdentity(), undefined);
    assert.deepStrictEqual(session.preferredSettings(), {});
  });

  it('a stop that kept breakpoints refuses a start with another request user, and the identity stays', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, { requestUser: 'SAPUSER02' });
    world.polls[1].resolve(CONFLICT_409()); // the listener is gone: only the kept state refuses
    await until(() => world.closed.length === 1);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('Breakpoint is locked');
    await assertRejects(session.stop(), DebugCleanupError);
    world.calls.length = 0;
    await assertRejects(
      session.start('refuse', {
        ...START,
        requestUser: 'SAPUSER03',
        breakpoints: [A],
      }),
      NOT_COMPLETE,
    );
    assert.deepStrictEqual(world.calls, []);
    assertMatchObject(session.currentIdentity(), {
      requestUser: 'SAPUSER02',
    });
    assert.deepStrictEqual(
      session.listBreakpoints().map((r) => r.id),
      ['L10', 'E1'],
    );
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.log.length = 0;
    await session.stop();
    assertMatchObject(
      world.log.find((c) => c.call === 'stopListener')!.args[0],
      { requestUser: 'SAPUSER02' },
    );
    assert.equal(session.holdsState(), false);
  });

  it('a stop whose stopListener succeeded but kept a connection owes only the close: the retry sends no second stopListener', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    const realClose = world.ports.closeConnection;
    let once = true;
    world.ports.closeConnection = async (c) => {
      if (once) {
        once = false;
        throw new Error('close refused');
      }
      return realClose(c);
    };
    await assertRejects(session.stop(), /close refused/);
    assert.deepStrictEqual(session.listBreakpoints(), []);
    assert.deepStrictEqual(session.requestedBreakpoints(), []);
    assert.equal(session.holdsState(), true);
    await assertRejects(session.start('refuse', START), NOT_COMPLETE);
    world.calls.length = 0;
    await session.stop();
    assert.ok(!world.calls.includes('stopListener'));
    assert.equal(session.currentIdentity(), undefined);
    assert.equal(session.holdsState(), false);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
  });

  it('a stopListener refused for the user is final even when a close failed: the retry sends no second stopListener', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => {
      world.calls.push('stopListener');
      return INVALID_USER();
    };
    const realClose = world.ports.closeConnection;
    let once = true;
    world.ports.closeConnection = async (c) => {
      if (once) {
        once = false;
        throw new Error('close refused');
      }
      return realClose(c);
    };
    const first = session.stop();
    // Refused, the system's listener was not stopped: its open poll answers on its own.
    await until(() => world.calls.includes('stopListener'));
    world.polls[world.polls.length - 1].resolve(LISTEN_NOTHING());
    await assertRejects(first, /close refused/);
    assert.equal(session.holdsState(), true);
    delete world.override.stopListener;
    world.calls.length = 0;
    await session.stop();
    assert.ok(!world.calls.includes('stopListener'));
    assert.equal(session.holdsState(), false);
  });

  // Review Focus 3.
  it('a listener the system drops while nothing is armed still holds the state: the stopListener is owed', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(CONFLICT_409()); // taken over by another IDE
    await until(() => world.closed.length === 1);
    await assertRejects(session.wait(0), /global debugging scope/);
    assert.equal(session.holdsState(), true);
    await assertRejects(session.start('refuse', START), NOT_COMPLETE);
    await session.stop();
    assert.ok(world.calls.includes('stopListener'));
    assert.equal(session.holdsState(), false);
  });

  it('a start that failed with no SAP answer behind it answers its own words, with what it could not undo as entries', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('Breakpoint is locked');
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session
      .start('refuse', { breakpoints: [A] })
      .catch((e: unknown) => e);
    await until(() => world.polls.length === 1);
    world.polls[0].reject(new Error('socket hang up'));
    const error = await started;
    const answered = JSON.parse(
      (return_error(error) as { content: Array<{ text: string }> }).content[0]
        .text,
    );
    assert.deepStrictEqual(answered, {
      message: 'socket hang up',
      cleanup: {
        message: 'not undone',
        failures: [
          {
            message: 'listener busy',
            origin: 'refusal',
            step: 'stop listener',
          },
          {
            message: 'Breakpoint is locked',
            origin: 'refusal',
            step: 'delete breakpoint L10',
          },
          {
            message: 'Breakpoint is locked',
            origin: 'refusal',
            step: 'delete breakpoint E1',
          },
        ],
      },
    });
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
  });

  it("another user without authorisation: SAP's 403 reaches the caller as it said it, and the state stays held for DebugStop", async () => {
    const world = fakeWorld();
    const NO_AUTH = 'No authorization to debug the requests of SAPUSER02';
    world.breakpointAnswers.push(() => refusedResponse(NO_AUTH));
    world.override.stopListener = async () => refusedResponse(NO_AUTH);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const error = await session
      .start('refuse', { ...START, requestUser: 'SAPUSER02', breakpoints: [A] })
      .catch((e: unknown) => e);
    assert.equal(
      (error as Error).message,
      `${NO_AUTH}; not undone: stop listener: ${NO_AUTH}`,
    );
    // The consumer's answer: the arming's refusal as it is, with what could
    // not be undone beside it — each an entry with its step.
    const answered = JSON.parse(
      (return_error(error) as { content: Array<{ text: string }> }).content[0]
        .text,
    );
    assert.equal(answered.message, NO_AUTH);
    assert.deepStrictEqual(answered.cleanup, {
      message: 'not undone',
      failures: [
        { message: NO_AUTH, origin: 'refusal', step: 'stop listener' },
      ],
    });
    assert.equal(session.holdsState(), true);
    assertMatchObject(session.currentIdentity(), {
      requestUser: 'SAPUSER02',
    });
  });

  it('a listener for another request user never reuses a connection that served another identity', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const first = session.start('refuse', {
      ...START,
      requestUser: 'SAPUSER02',
      breakpoints: [A],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await first;
    await session.stop();
    const served = new Set(world.log.map((c) => c.connection));
    world.log.length = 0;
    const second = session.start('refuse', {
      ...START,
      requestUser: 'SAPUSER03',
      breakpoints: [A],
    });
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_NOTHING());
    await second;
    assert.ok(world.log.length > 0);
    for (const c of world.log) assert.equal(served.has(c.connection), false);
  });

  // A stop whose connection is spent (the owner's decision): its SAP session
  // is gone, and SAP's logoff freed what it held. Read from the typed
  // verdict alone — `sessionError` (ADT_NOT_CONNECTED, ADT_SESSION_REPLACED)
  // or `sessionLost` — never from the message: the stop is dropped without a
  // request, reported, and a new start is accepted.
  describe('the release of a held debuggee whose connection is spent', () => {
    async function heldStop() {
      const world = fakeWorld();
      const { session } = await armed(world);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.includes('getStack'));
      return { world, session };
    }

    async function startsAgain(
      world: ReturnType<typeof fakeWorld>,
      session: Awaited<ReturnType<typeof armed>>['session'],
    ) {
      world.breakpointAnswers.push(ROWS);
      const polls = world.polls.length;
      const again = session.start('refuse', { breakpoints: [A, EXC] });
      await until(() => world.polls.length === polls + 1);
      world.polls[polls].resolve(LISTEN_NOTHING());
      assert.notEqual(await again, undefined);
    }

    for (const [_name, extra] of [
      ['sessionError ADT_NOT_CONNECTED', { sessionError: 'ADT_NOT_CONNECTED' }],
      [
        'sessionError ADT_SESSION_REPLACED',
        { sessionError: 'ADT_SESSION_REPLACED' },
      ],
      ['sessionLost on the refusal', { sessionLost: 'ADT_SESSION_REPLACED' }],
    ] as const) {
      it(
        format(
          '%s: the stop is dropped without a request, reported, and a start is accepted',
          _name,
        ),
        async () => {
          const { world, session } = await heldStop();
          world.override.step = async () =>
            refusedResponse('words that are never read', {
              origin: 'connection',
              ...extra,
            });
          world.calls.length = 0;
          const closedBefore = world.closed.length;
          const notes = await session.stop();
          // Dropped: no logoff on it, nothing sent after the release.
          assert.equal(world.dropped.length, 1);
          assert.ok(
            !world.closed.slice(closedBefore).includes(world.dropped[0]),
          );
          assert.equal(notes.length, 1);
          assertMatchObject(notes[0], { step: 'release the debuggee' });
          assertMessageHolding(notes[0]?.cleanup, 'dropped');
          assert.deepStrictEqual(session.failures(), []);
          assert.equal(session.holdsState(), false);
          await startsAgain(world, session);
        },
      );
    }

    it('a released stop whose answer carries sessionLost is dropped, not logged off', async () => {
      const { world, session } = await heldStop();
      world.override.step = async () => ({
        ok: true,
        getResult: () => ({
          value: undefined,
          sessionLost: 'ADT_SESSION_REPLACED' as const,
        }),
        getError: () => {
          throw new Error('asked for the error of a success');
        },
      });
      const closedBefore = world.closed.length;
      assert.deepStrictEqual(await session.stop(), []);
      assert.equal(world.dropped.length, 1);
      assert.ok(!world.closed.slice(closedBefore).includes(world.dropped[0]));
      assert.equal(session.holdsState(), false);
    });

    it('a connection failure that names no session error stays a failure, kept for the next stop', async () => {
      const { world, session } = await heldStop();
      world.override.step = async () =>
        refusedResponse('ADT_NOT_CONNECTED in the words only', {
          origin: 'connection',
        });
      await assertRejects(session.stop(), DebugCleanupError);
      assert.deepStrictEqual(world.dropped, []);
      assert.equal(session.failures().length, 1);
      assertMatchObject(session.failures()[0], {
        step: 'release the debuggee',
      });
      assert.equal(session.holdsState(), true);
    });

    it('ADT_RELEASE_PENDING is no spent connection: it stays a failure', async () => {
      const { world, session } = await heldStop();
      world.override.step = async () =>
        refusedResponse('pending', {
          origin: 'connection',
          sessionError: 'ADT_RELEASE_PENDING',
        });
      await assertRejects(session.stop(), DebugCleanupError);
      assert.deepStrictEqual(world.dropped, []);
      assert.equal(session.holdsState(), true);
    });
  });

  // Pins Task 3's counter across the cleanup: it passes once Task 3 is in, and fails if the cleanup resets it.
  it('a tag is never reused: the cleanup empties the lists, not the counter', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const first = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await first;
    await session.stop();
    assert.deepStrictEqual(session.requestedBreakpoints(), []);
    const second = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_NOTHING());
    await second;
    assert.deepStrictEqual(
      world.sent.map((l) => l.map((b: any) => b.clientId)),
      [['bp1'], ['bp2']],
    );
    assert.deepStrictEqual(session.requestedBreakpoints(), [A]);
  });
});
