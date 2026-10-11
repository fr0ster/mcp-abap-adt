import {
  DebugRefusedError,
  DebugRequestError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  fakeWorld,
  IDS,
  INVALID_USER,
  LISTEN_NOTHING,
  NOT_AUTHORIZED,
  rowsXml,
  START,
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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A start that answers again, listening, once the first poll is answered. */
  async function startsAgain(session: DebugSession<string>, world: any) {
    const before = world.polls.length;
    const again = session.start('refuse', {
      ...START,
      requestUser: 'SAPUSER02',
    });
    await until(() => world.polls.length === before + 1);
    world.polls[before].resolve(LISTEN_NOTHING());
    await expect(again).resolves.toMatchObject({ state: 'listening' });
  }

  describe('at the arming of a start', () => {
    it.each(REFUSALS)(
      '%s is a refusal before any change: no stopListener, no deletion, the identity cleared, SAP said it',
      async (_, refusal) => {
        const world = fakeWorld();
        world.breakpointAnswers.push(refusal);
        const session = new DebugSession(world.ports, IDS).bind('origin');
        const started = session.start('refuse', {
          breakpoints: [A],
          requestUser: 'SAPUSER03',
        });
        await expect(started).rejects.toThrow(DebugRefusedError);
        await expect(started).rejects.toThrow(SAID);
        expect(world.calls).toEqual(['setBreakpoints:1']);
        expect(new Set(world.closed)).toEqual(new Set(world.opened));
        expect(session.currentIdentity()).toBeUndefined();
        expect(session.listBreakpoints()).toEqual([]);
        expect(session.requestedBreakpoints()).toEqual([]);
        expect(session.failures()).toEqual([]);
        expect(session.holdsState()).toBe(false);
        await startsAgain(session, world);
      },
    );

    it('under refuse-if-held the calls are exactly the preflight and the arming', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(NOT_AUTHORIZED);
      const session = new DebugSession(world.ports, IDS, {
        breakpointConflict: 'refuse-if-held',
      }).bind('origin');
      await expect(
        session.start('refuse', {
          breakpoints: [A],
          requestUser: 'SAPUSER03',
        }),
      ).rejects.toThrow(SAID);
      expect(world.calls).toEqual(['checkListener', 'setBreakpoints:1']);
      expect(session.holdsState()).toBe(false);
    });

    it('another refusal of the arming is not read as one of the user: it stays a request failure after a change', async () => {
      const world = fakeWorld();
      world.breakpointAnswers.push(() => USER_REFUSED(403, 'otherSubType'));
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(
        session.start('refuse', { breakpoints: [A] }),
      ).rejects.toThrow(DebugRequestError);
      expect(world.calls).toEqual(['setBreakpoints:1', 'stopListener']);
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
      await expect(set).rejects.toThrow(DebugRefusedError);
      await expect(set).rejects.toThrow(SAID);
      expect(session.listBreakpoints()).toEqual(placed);
      expect(session.requestedBreakpoints()).toEqual(requested);
      expect(session.currentIdentity()).toBeDefined();
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

    it.each(REFUSALS)(
      'a first listen refused %s refuses the start without rolling the breakpoints back, and names them',
      async (_, refusal) => {
        const { session, world, started } = armedStart();
        await until(() => world.polls.length === 1);
        world.polls[0].resolve(refusal());
        const error = await started.then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(DebugRefusedError);
        expect((error as Error).message).toMatch(SAID);
        expect((error as Error).message).toMatch(
          /the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)/,
        );
        expect((error as DebugRefusedError).placed?.map((b) => b.id)).toEqual([
          'L10',
          'E1',
        ]);
        expect(world.calls).toEqual(['setBreakpoints:2', 'listen:3']);
        expect(new Set(world.closed)).toEqual(new Set(world.opened));
        expect(session.currentIdentity()).toBeUndefined();
        expect(session.listBreakpoints()).toEqual([]);
        expect(session.requestedBreakpoints()).toEqual([]);
        expect(session.failures()).toEqual([]);
        expect(session.holdsState()).toBe(false);
        await startsAgain(session, world);
      },
    );

    it.each(REFUSALS)(
      'a stopListener refused %s at DebugStop is final: no per-id delete, the session ends',
      async (_, refusal) => {
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
        expect(world.calls).toEqual(['stopListener']);
        // SAP's answer reaches the model as a note that is no debt, naming what stays.
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatch(SAID);
        expect(notes[0]).toMatch(
          /the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)/,
        );
        expect(new Set(world.closed)).toEqual(new Set(world.opened));
        expect(session.currentIdentity()).toBeUndefined();
        expect(session.listBreakpoints()).toEqual([]);
        expect(session.requestedBreakpoints()).toEqual([]);
        expect(session.failures()).toEqual([]);
        expect(session.holdsState()).toBe(false);
        delete world.override.stopListener;
        await startsAgain(session, world);
      },
    );

    it('a start failed otherwise after its arming: a stopListener refused for the user ends it, nothing undone is named', async () => {
      const world = fakeWorld();
      refuseStop(world, INVALID_USER);
      const { session, started } = armedStart(world);
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(refusedResponse('listener broke'));
      await expect(started).rejects.toThrow(
        /listener broke; listener: .*User SAPUSER03 does not exist.*; the breakpoints placed stay on the system: L10 \(line .*\), E1 \(exception CX_A\)/,
      );
      await expect(started).rejects.not.toThrow(/not undone/);
      expect(world.calls).toEqual([
        'setBreakpoints:2',
        'listen:3',
        'stopListener',
      ]);
      expect(session.currentIdentity()).toBeUndefined();
      expect(session.holdsState()).toBe(false);
    });

    it('a stopListener refused otherwise keeps the per-id deletes and the debt', async () => {
      const world = fakeWorld();
      refuseStop(world, () =>
        USER_REFUSED(403, 'otherSubType', 'No authorization'),
      );
      const { session, started } = armedStart(world);
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(refusedResponse('listener broke'));
      await expect(started).rejects.toThrow(/not undone: listener: /);
      expect(world.calls).toEqual([
        'setBreakpoints:2',
        'listen:3',
        'stopListener',
        'deleteBreakpoint:L10',
        'deleteBreakpoint:E1',
      ]);
      expect(session.listBreakpoints()).toEqual([]);
      expect(session.currentIdentity()).toBeDefined();
      expect(session.holdsState()).toBe(true);
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
      await expect(started).rejects.toThrow(DebugRefusedError);
      await expect(started).rejects.toThrow(SAID);
      await expect(started).rejects.not.toThrow(/not undone/);
      expect(world.calls).toEqual([
        'stopListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
      expect(session.currentIdentity()).toBeUndefined();
      expect(session.failures()).toEqual([]);
      expect(session.holdsState()).toBe(false);
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
      await expect(started).rejects.toThrow(
        /User SAPUSER03 does not exist.*; listener: .*User SAPUSER03 does not exist/,
      );
      await expect(started).rejects.not.toThrow(/not undone/);
      expect(world.calls).toEqual([
        'stopListener',
        'setBreakpoints:1',
        'stopListener',
      ]);
      expect(session.holdsState()).toBe(false);
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
      await expect(
        session.start('refuse', { breakpoints: [A] }),
      ).rejects.toThrow(DebugRequestError);
      expect(world.calls).toEqual(['setBreakpoints:1', 'stopListener']);
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
      await expect(session.stop()).rejects.toThrow(/listener: Forbidden/);
      expect(world.calls).toEqual([
        'stopListener',
        'deleteBreakpoint:L10',
        'deleteBreakpoint:E1',
      ]);
      expect(session.holdsState()).toBe(true);
    });
  });
});
