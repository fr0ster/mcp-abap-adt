import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  DebugRefusedError,
  DebugRequestError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import {
  assertMatchObject,
  assertRejects,
  messageOf,
} from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import {
  fakeWorld,
  IDS,
  INVALID_USER,
  LISTEN_NOTHING,
  NOT_AUTHORIZED,
  rowsXml,
  START,
  stringOf,
  USER_REFUSED,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
const ROWS = () =>
  okResponse(
    rowsXml([
      { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri },
      { kind: 'exception', id: 'E1', clientId: 'bp2', exceptionClass: 'CX_A' },
    ]),
  );
const SAID = /User SAPUSER03 does not exist/;
const REFUSALS = [
  ['403 notAuthorized', NOT_AUTHORIZED],
  ['404 invalidUser', INVALID_USER],
] as const;

/** stopListener answers this refusal, recorded in the calls like the fake's own. */
function refuseStop(world: ReturnType<typeof fakeWorld>, refusal: () => any) {
  world.override.stopListener = async () => {
    world.calls.push('stopListener');
    return refusal();
  };
}

describe("the system's refusal of a request user", () => {
  // setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  /** A start that answers again, listening, once the first poll is answered. */
  async function startsAgain(session: DebugSession<string>, world: any) {
    const before = world.polls.length;
    const again = session.start('refuse', {
      ...START,
      requestUser: 'SAPUSER02',
    });
    await until(() => world.polls.length === before + 1);
    world.polls[before].resolve(LISTEN_NOTHING());
    assertMatchObject(await again, { state: 'listening' });
  }

  describe('at the arming of a start', () => {
    for (const [_, refusal] of REFUSALS) {
      it(
        format(
          '%s is a refusal before any change: no stopListener, no deletion, the identity cleared, SAP said it',
          _,
        ),
        async () => {
          const world = fakeWorld();
          world.breakpointAnswers.push(refusal);
          const session = new DebugSession(world.ports, IDS).bind('origin');
          const started = session.start('refuse', {
            breakpoints: [A],
            requestUser: 'SAPUSER03',
          });
          await assertRejects(started, DebugRefusedError);
          await assertRejects(started, SAID);
          assert.deepStrictEqual(world.calls, [
            'checkListener',
            'setBreakpoints:1',
          ]);
          assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
          assert.equal(session.currentIdentity(), undefined);
          assert.deepStrictEqual(session.listBreakpoints(), []);
          assert.deepStrictEqual(session.requestedBreakpoints(), []);
          assert.deepStrictEqual(session.failures(), []);
          assert.equal(session.holdsState(), false);
          await startsAgain(session, world);
        },
      );
    }

    it('under refuse-if-held with take-over the calls are exactly the preflight and the arming', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(NOT_AUTHORIZED);
      const session = new DebugSession(world.ports, IDS, {
        breakpointConflict: 'refuse-if-held',
      }).bind('origin');
      await assertRejects(
        session.start('takeOver', {
          breakpoints: [A],
          requestUser: 'SAPUSER03',
        }),
        SAID,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'setBreakpoints:1',
      ]);
      assert.equal(session.holdsState(), false);
    });

    it('another refusal of the arming is not read as one of the user: it stays a request failure after a change', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(() => USER_REFUSED(403, 'otherSubType'));
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.start('refuse', { breakpoints: [A] }),
        DebugRequestError,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
    });
  });

  describe('at a later DebugSetBreakpoints', () => {
    it('a refused replacement leaves both lists as they were, and the error reaches the caller', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(ROWS);
      const session = new DebugSession(world.ports, IDS).bind('origin');
      const s = session.start('refuse', { breakpoints: [A, EXC] });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      await s;
      const placed = session.listBreakpoints();
      const requested = session.requestedBreakpoints();
      world.breakpointAnswers.push(NOT_AUTHORIZED);
      const set = session.setBreakpoints([
        { kind: 'exception', exceptionClass: 'CX_B' },
      ]);
      await assertRejects(set, DebugRefusedError);
      await assertRejects(set, SAID);
      assert.deepStrictEqual(session.listBreakpoints(), placed);
      assert.deepStrictEqual(session.requestedBreakpoints(), requested);
      assert.notEqual(session.currentIdentity(), undefined);
    });
  });

  describe('after an arming the system accepted (a safety net)', () => {
    /** A start whose arming is placed; its first listen is answered by the test. */
    function armedStart(world = fakeWorld()) {
      world.breakpointAnswers.push(ROWS);
      const session = new DebugSession(world.ports, IDS).bind('origin');
      const started = session.start('refuse', {
        breakpoints: [A, EXC],
        requestUser: 'SAPUSER03',
      });
      return { session, world, started };
    }

    for (const [_, refusal] of REFUSALS) {
      it(
        format(
          'a first listen refused %s refuses the start without rolling the breakpoints back, and names them',
          _,
        ),
        async () => {
          const { session, world, started } = armedStart();
          await until(() => world.polls.length === 1);
          world.polls[0].resolve(refusal());
          const error = await started.then(
            () => undefined,
            (e: unknown) => e,
          );
          assert.ok(error instanceof DebugRefusedError);
          assert.match((error as Error).message, SAID);
          assert.match(
            (error as Error).message,
            /the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)/,
          );
          assert.deepStrictEqual(
            (error as DebugRefusedError).placed?.map((b) => b.id),
            ['L10', 'E1'],
          );
          assert.deepStrictEqual(world.calls, [
            'checkListener',
            'setBreakpoints:2',
            'listen:3',
          ]);
          assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
          assert.equal(session.currentIdentity(), undefined);
          assert.deepStrictEqual(session.listBreakpoints(), []);
          assert.deepStrictEqual(session.requestedBreakpoints(), []);
          assert.deepStrictEqual(session.failures(), []);
          assert.equal(session.holdsState(), false);
          await startsAgain(session, world);
        },
      );
    }

    for (const [_, refusal] of REFUSALS) {
      it(
        format(
          'a stopListener refused %s at DebugStop is final: no per-id delete, the session ends',
          _,
        ),
        async () => {
          const world = fakeWorld();
          world.breakpointAnswers.push(ROWS);
          const session = new DebugSession(world.ports, IDS).bind('origin');
          const s = session.start('refuse', { breakpoints: [A, EXC] });
          await until(() => world.polls.length === 1);
          world.polls[0].resolve(LISTEN_NOTHING());
          await s;
          await until(() => world.polls.length === 2);
          refuseStop(world, refusal);
          world.calls.length = 0;
          const stopped = session.stop();
          await until(() => world.calls.includes('stopListener'));
          world.polls[1].resolve(LISTEN_NOTHING()); // the open poll answers at its hold
          const notes = await stopped;
          assert.deepStrictEqual(world.calls, ['stopListener']);
          // SAP's answer reaches the model as a note that is no debt, naming what stays.
          // The note is the method's error as it is, with its step; what stays
          // on the system rides beside it as `cleanup`.
          assert.equal(notes.length, 1);
          assertMatchObject(notes[0], {
            step: 'stop listener',
            origin: 'refusal',
          });
          assert.match(stringOf(notes[0].raw_body), SAID);
          assert.match(
            (notes[0].cleanup as { message: string }).message,
            /^the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)$/,
          );
          assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
          assert.equal(session.currentIdentity(), undefined);
          assert.deepStrictEqual(session.listBreakpoints(), []);
          assert.deepStrictEqual(session.requestedBreakpoints(), []);
          assert.deepStrictEqual(session.failures(), []);
          assert.equal(session.holdsState(), false);
          delete world.override.stopListener;
          await startsAgain(session, world);
        },
      );
    }

    it('a start failed otherwise after its arming: a stopListener refused for the user ends it, nothing undone is named', async () => {
      const world = fakeWorld();
      refuseStop(world, INVALID_USER);
      const { session, started } = armedStart(world);
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(refusedResponse('listener broke'));
      await assertRejects(
        started,
        /listener broke; stop listener: .*User SAPUSER03 does not exist.*; the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)/,
      );
      assert.doesNotMatch(
        messageOf(await assertRejects(started)),
        /not undone/,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'setBreakpoints:2',
        'listen:3',
        'stopListener',
      ]);
      assert.equal(session.currentIdentity(), undefined);
      assert.equal(session.holdsState(), false);
    });

    it('a stopListener refused otherwise keeps the per-id deletes and the debt', async () => {
      const world = fakeWorld();
      refuseStop(world, () =>
        USER_REFUSED(403, 'otherSubType', 'No authorization'),
      );
      const { session, started } = armedStart(world);
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(refusedResponse('listener broke'));
      await assertRejects(started, /not undone: stop listener: /);
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'setBreakpoints:2',
        'listen:3',
        'stopListener',
        'deleteBreakpoint:L10',
        'deleteBreakpoint:E1',
      ]);
      assert.deepStrictEqual(session.listBreakpoints(), []);
      assert.notEqual(session.currentIdentity(), undefined);
      assert.equal(session.holdsState(), true);
    });
  });

  describe('with stated ids (a reconciliation before the arming)', () => {
    const STATED = { ...IDS, stated: true };

    it('a refused arming: the reconciliation, the arming, the cleanup stopListener — and the session ends', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(NOT_AUTHORIZED);
      const session = new DebugSession(world.ports, STATED).bind('origin');
      const started = session.start('refuse', {
        breakpoints: [A],
        requestUser: 'SAPUSER03',
      });
      await assertRejects(started, DebugRefusedError);
      await assertRejects(started, SAID);
      assert.doesNotMatch(
        messageOf(await assertRejects(started)),
        /not undone/,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'stopListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
      assert.equal(session.currentIdentity(), undefined);
      assert.deepStrictEqual(session.failures(), []);
      assert.equal(session.holdsState(), false);
      await startsAgain(session, world);
    });

    it('as measured for a user that does not exist (stopListener 404): the note is told, nothing is kept', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(NOT_AUTHORIZED);
      refuseStop(world, INVALID_USER);
      const session = new DebugSession(world.ports, STATED).bind('origin');
      const started = session.start('refuse', {
        breakpoints: [A],
        requestUser: 'SAPUSER03',
      });
      await assertRejects(
        started,
        /User SAPUSER03 does not exist.*; stop listener: .*User SAPUSER03 does not exist/,
      );
      assert.doesNotMatch(
        messageOf(await assertRejects(started)),
        /not undone/,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'stopListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
      assert.equal(session.holdsState(), false);
    });
  });

  describe('a 403 without an exception document is not read as a refusal of the user', () => {
    const CSRF = () =>
      refusedResponse('Forbidden', {
        response: {
          status: 403,
          headers: { 'content-type': 'text/html' },
          data: '<html><body>CSRF token validation failed</body></html>',
        },
      } as any);

    it('at the arming: a request failure after a change', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(CSRF);
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.start('refuse', { breakpoints: [A] }),
        DebugRequestError,
      );
      assert.deepStrictEqual(world.calls, [
        'checkListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
    });

    it('at the stopListener: the per-id deletes run and the debt stays', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(ROWS);
      const session = new DebugSession(world.ports, IDS).bind('origin');
      const s = session.start('refuse', { breakpoints: [A, EXC] });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      await s;
      refuseStop(world, CSRF);
      world.calls.length = 0;
      await assertRejects(session.stop(), /listener: Forbidden/);
      assert.deepStrictEqual(world.calls, [
        'stopListener',
        'deleteBreakpoint:L10',
        'deleteBreakpoint:E1',
      ]);
      assert.equal(session.holdsState(), true);
    });
  });
});
