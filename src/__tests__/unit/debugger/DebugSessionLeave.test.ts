import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DebugRequestError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  START,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const idOf = (c: unknown) => (c as { id: number }).id;

describe('leaving a debuggee running', () => {
  // setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

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
    assert.deepStrictEqual(await session.detach(), { state: 'listening' });
    assert.ok(world.calls.includes('detachDebugger'));
    assert.ok(world.closed.includes(debuggee));
    assert.deepStrictEqual(
      session.listBreakpoints().map((r) => r.id),
      ['L10'],
    );
    assert.deepStrictEqual(session.requestedBreakpoints(), [A]);
    await until(() => world.polls.length === 3); // polling resumed
    assert.equal(session.holdsState(), true);
  });

  it('a catch after detach is attached again', async () => {
    const { session, world } = await stoppedWith();
    await session.detach();
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => world.calls.filter((c) => c === 'getStack').length === 2);
    assert.equal((await session.wait(0)).state, 'stopped');
  });

  it('release_debugger: read as freed; the freed connection is dropped with no further request and never logged off; the session listens on', async () => {
    const { session, world, debuggee } = await stoppedWith();
    assert.deepStrictEqual(await session.releaseDebugger(), {
      state: 'listening',
    });
    assert.ok(world.calls.includes('terminateDebugger:freed'));
    assert.deepStrictEqual(world.dropped, [debuggee]);
    const onIt = world.log.filter((c) => c.connection === idOf(debuggee));
    assert.equal(onIt[onIt.length - 1].call, 'terminateDebugger');
    assert.deepStrictEqual(
      session.listBreakpoints().map((r) => r.id),
      ['L10'],
    );
    await until(() => world.polls.length === 3);
    await session.stop();
    assert.ok(!world.closed.includes(debuggee));
    assert.equal(
      world.log.filter((c) => c.connection === idOf(debuggee)).length,
      onIt.length,
    );
    assert.equal(session.holdsState(), false);
  });

  it('a refused release_debugger is a failure, and the stop stays for DebugStop', async () => {
    const world = fakeWorld();
    const { session, debuggee } = await stoppedWith(world);
    world.override.terminateDebugger = async () =>
      refusedResponse('Debugger session is busy');
    await assertRejects(
      session.releaseDebugger(),
      new DebugRequestError('Debugger session is busy'),
    );
    assert.equal((await session.wait(0)).state, 'stopped');
    assert.deepStrictEqual(world.dropped, []);
    delete world.override.terminateDebugger;
    await session.stop();
    assert.ok(world.calls.includes('step:stepContinue:analysed'));
    assert.ok(world.closed.includes(debuggee));
  });

  /** What adt-clients carries for a terminateDebugger over RFC whose call the RFC SDK answered with this code. */
  const rfcFailure = (codeString: 'RFC_CLOSED' | 'RFC_COMMUNICATION_FAILURE') =>
    refusedResponse('the RFC call failed', {
      origin: 'connection',
      rfc: {
        key: codeString,
        group: codeString === 'RFC_CLOSED' ? 4 : 3,
        code: codeString === 'RFC_CLOSED' ? 6 : 1,
        codeString,
      },
    });

  it('release_debugger over RFC: the conversation closed by the system (RFC_CLOSED) is read as freed; the stop is dropped with no further request; the session listens on', async () => {
    const world = fakeWorld();
    const { session, debuggee } = await stoppedWith(world);
    world.override.terminateDebugger = async () => rfcFailure('RFC_CLOSED');
    assert.deepStrictEqual(await session.releaseDebugger(), {
      state: 'listening',
    });
    assert.deepStrictEqual(world.dropped, [debuggee]);
    const onIt = world.log.filter((c) => c.connection === idOf(debuggee));
    assert.equal(onIt[onIt.length - 1].call, 'terminateDebugger');
    assert.deepStrictEqual(
      session.listBreakpoints().map((r) => r.id),
      ['L10'],
    );
    await until(() => world.polls.length === 3);
    delete world.override.terminateDebugger;
    await session.stop();
    assert.ok(!world.closed.includes(debuggee));
    assert.equal(
      world.log.filter((c) => c.connection === idOf(debuggee)).length,
      onIt.length,
    );
  });

  it('release_debugger over RFC with another RFC code is a failure, and the stop stays for DebugStop', async () => {
    const world = fakeWorld();
    const { session, debuggee } = await stoppedWith(world);
    world.override.terminateDebugger = async () =>
      rfcFailure('RFC_COMMUNICATION_FAILURE');
    await assertRejects(
      session.releaseDebugger(),
      new DebugRequestError('the RFC call failed'),
    );
    assert.equal((await session.wait(0)).state, 'stopped');
    assert.deepStrictEqual(world.dropped, []);
    delete world.override.terminateDebugger;
    await session.stop();
    assert.ok(world.closed.includes(debuggee));
  });

  it('a connection failure of release_debugger without RFC fields is a failure, and the stop stays', async () => {
    const world = fakeWorld();
    const { session } = await stoppedWith(world);
    world.override.terminateDebugger = async () =>
      refusedResponse('socket hang up', { origin: 'connection' });
    await assertRejects(
      session.releaseDebugger(),
      new DebugRequestError('socket hang up'),
    );
    assert.equal((await session.wait(0)).state, 'stopped');
    assert.deepStrictEqual(world.dropped, []);
  });

  it('a refused detach is a failure, and the stop stays', async () => {
    const world = fakeWorld();
    const { session } = await stoppedWith(world);
    world.override.detachDebugger = async () =>
      refusedResponse('Debuggee is not attached');
    await assertRejects(session.detach(), DebugRequestError);
    assert.equal((await session.wait(0)).state, 'stopped');
  });

  it('without a stop both are refused and send nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await assertRejects(session.detach(), DebugStateError);
    await assertRejects(session.releaseDebugger(), DebugStateError);
    assert.deepStrictEqual(
      world.calls.filter(
        (c) => c === 'detachDebugger' || c.startsWith('terminateDebugger'),
      ),
      [],
    );
  });
});
