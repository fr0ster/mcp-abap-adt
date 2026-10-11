import {
  DebugRequestError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const idOf = (c: unknown) => (c as { id: number }).id;

describe('leaving a debuggee running', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function stoppedWith(world = fakeWorld()) {
    world.breakpointAnswers.push(() =>
      okResponse(
        rowsXml([{ kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri }]),
      ),
    );
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    // opened: the control connection, the listener's, the attach's
    return { session, world, debuggee: world.opened[2] };
  }

  it('detach: the debugger leaves, its connection closes, and the session listens on with its breakpoints', async () => {
    const { session, world, debuggee } = await stoppedWith();
    await expect(session.detach()).resolves.toEqual({ state: 'listening' });
    expect(world.calls).toContain('detachDebugger');
    expect(world.closed).toContain(debuggee);
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    expect(session.requestedBreakpoints()).toEqual([A]);
    await until(() => world.polls.length === 3); // polling resumed
    expect(session.holdsState()).toBe(true);
  });

  it('a catch after detach is attached again', async () => {
    const { session, world } = await stoppedWith();
    await session.detach();
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => world.calls.filter((c) => c === 'getStack').length === 2);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('release_debugger: read as freed; the freed connection is dropped with no further request and never logged off; the session listens on', async () => {
    const { session, world, debuggee } = await stoppedWith();
    await expect(session.releaseDebugger()).resolves.toEqual({
      state: 'listening',
    });
    expect(world.calls).toContain('terminateDebugger:freed');
    expect(world.dropped).toEqual([debuggee]);
    const onIt = world.log.filter((c) => c.connection === idOf(debuggee));
    expect(onIt[onIt.length - 1].call).toBe('terminateDebugger');
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    await until(() => world.polls.length === 3);
    await session.stop();
    expect(world.closed).not.toContain(debuggee);
    expect(
      world.log.filter((c) => c.connection === idOf(debuggee)),
    ).toHaveLength(onIt.length);
    expect(session.holdsState()).toBe(false);
  });

  it('a refused release_debugger is a failure, and the stop stays for DebugStop', async () => {
    const world = fakeWorld();
    const { session, debuggee } = await stoppedWith(world);
    world.override.terminateDebugger = async () =>
      refusedResponse('Debugger session is busy');
    await expect(session.releaseDebugger()).rejects.toThrow(
      new DebugRequestError('Debugger session is busy'),
    );
    expect((await session.wait(0)).state).toBe('stopped');
    expect(world.dropped).toEqual([]);
    delete world.override.terminateDebugger;
    await session.stop();
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(world.closed).toContain(debuggee);
  });

  it('a refused detach is a failure, and the stop stays', async () => {
    const world = fakeWorld();
    const { session } = await stoppedWith(world);
    world.override.detachDebugger = async () =>
      refusedResponse('Debuggee is not attached');
    await expect(session.detach()).rejects.toThrow(DebugRequestError);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('without a stop both are refused and send nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await expect(session.detach()).rejects.toThrow(DebugStateError);
    await expect(session.releaseDebugger()).rejects.toThrow(DebugStateError);
    expect(
      world.calls.filter(
        (c) => c === 'detachDebugger' || c.startsWith('terminateDebugger'),
      ),
    ).toEqual([]);
  });
});
