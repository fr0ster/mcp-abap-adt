import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import {
  DebugConflictError,
  DebugRefusedError,
  DebugRequestError,
  DebugSession,
  type DebugStartOptions,
  FIRST_POLL_HOLD_SECONDS,
} from '../../../lib/debugger/DebugSession';
import { assertRejects } from '../../helpers/assertions';
import { refusedResponse } from '../../helpers/fakeClient';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import {
  CONFLICT_409,
  fakeWorld,
  IDS,
  LISTEN_NOTHING,
  START,
  until,
} from './fakes';

const LINE: IDebuggerBreakpoint = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
};
const HELD = { breakpointConflict: 'refuse-if-held' as const };

describe('the start', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function listening(
    world = fakeWorld(),
    ids: ConstructorParameters<typeof DebugSession>[1] = IDS,
    options: ConstructorParameters<typeof DebugSession>[2] = {},
    start: Partial<Parameters<DebugSession['start']>[1]> = {},
    conflict: Parameters<DebugSession['start']>[0] = 'refuse',
  ) {
    const session = new DebugSession(world.ports, ids, options).bind('origin');
    const started = session.start(conflict, { ...START, ...start });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await started;
    return { session, world };
  }

  // The user's decision (2026-10-11): a start arms at least one breakpoint. A model
  // that forgets them learns it before anything is sent, not from a listener that
  // can catch nothing of its own.
  for (const [_, start] of [
    ['no breakpoints', {}],
    ['an empty breakpoint list', { breakpoints: [] }],
  ]) {
    it(
      format('a start with %s is refused before the wire, holding nothing', _),
      async () => {
        for (const conflict of ['refuse', 'takeOver'] as const) {
          const world = fakeWorld();
          const session = new DebugSession(world.ports, IDS).bind('origin');
          // The type requires the list; an untyped caller can still leave it out.
          await assertRejects(
            session.start(conflict, start as DebugStartOptions),
            new DebugRefusedError('a start needs at least one breakpoint'),
          );
          assert.deepStrictEqual(world.log, []);
          assert.deepStrictEqual(world.opened, []);
          assert.equal(session.currentIdentity(), undefined);
          assert.equal(session.holdsState(), false);
        }
      },
    );
  }

  describe('identity by mode', () => {
    it('terminal mode needs no configured terminal id: random ids are accepted', async () => {
      const world = fakeWorld();
      const { session } = await listening(
        world,
        IDS,
        {},
        {
          debuggingMode: 'terminal',
        },
      );
      assert.deepStrictEqual(session.currentIdentity(), {
        debuggingMode: 'terminal',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
    });

    it('request_user with terminal mode is refused before the wire', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.start('refuse', {
          ...START,
          debuggingMode: 'terminal',
          requestUser: 'SAPUSER02',
        }),
        DebugRefusedError,
      );
      assert.deepStrictEqual(world.log, []);
      assert.deepStrictEqual(world.opened, []);
    });

    for (const [_, mode] of [
      ['user', {}],
      ['terminal', { debuggingMode: 'terminal' as const }],
    ] satisfies [string, { debuggingMode?: 'terminal' }][]) {
      it(
        format(
          'a blank request_user in %s mode is refused before the wire, not read as omitted',
          _,
        ),
        async () => {
          for (const blank of ['', '   ']) {
            const world = fakeWorld();
            const session = new DebugSession(world.ports, IDS).bind('origin');
            await assertRejects(
              session.start('refuse', {
                ...START,
                ...mode,
                requestUser: blank,
              }),
              new DebugRefusedError('request_user is empty'),
            );
            assert.deepStrictEqual(world.log, []);
            assert.deepStrictEqual(world.opened, []);
            assert.equal(session.holdsState(), false);
          }
        },
      );
    }

    it("terminal mode keys on the session's terminal id and asks for no request user", async () => {
      const world = fakeWorld();
      const asked = mock.method(world.ports, 'requestUser');
      const { session } = await listening(
        world,
        IDS,
        {},
        { debuggingMode: 'terminal' },
      );
      const listen = world.log.find((c) => c.call === 'listen')!;
      assert.deepStrictEqual(listen.args[0], {
        debuggingMode: 'terminal',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
      assert.equal(asked.mock.callCount(), 0);
      assert.deepStrictEqual(session.currentIdentity(), listen.args[0]);
    });

    it("user mode for another user names that user, upper case, without asking the connection's", async () => {
      const world = fakeWorld();
      const asked = mock.method(world.ports, 'requestUser');
      await listening(world, IDS, {}, { requestUser: 'sapuser02' });
      assert.deepStrictEqual(
        world.log.find((c) => c.call === 'listen')!.args[0],
        {
          debuggingMode: 'user',
          requestUser: 'SAPUSER02',
          terminalId: IDS.terminalId,
          ideId: IDS.ideId,
        },
      );
      assert.equal(asked.mock.callCount(), 0);
    });

    it('a condition on a non-line breakpoint is refused before the wire, naming it', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.start('refuse', {
          breakpoints: [
            LINE,
            {
              kind: 'exception',
              exceptionClass: 'CX_A',
              condition: 'lv_a = 1',
            } as unknown as IDebuggerBreakpoint,
          ],
        }),
        'breakpoints[1] (exception): a condition applies to a line breakpoint only',
      );
      assert.deepStrictEqual(world.log, []);
    });
  });

  describe('the preflight (refuse-if-held)', () => {
    it('a 409 refuses the start before any stopListener or arming, with the holder named', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(CONFLICT_409);
      const session = new DebugSession(
        world.ports,
        { ...IDS, stated: true },
        HELD,
      ).bind('origin');
      const error = await session
        .start('refuse', { breakpoints: [LINE] })
        .catch((e: unknown) => e);
      assert.ok(error instanceof DebugConflictError);
      assert.match(
        (error as DebugConflictError).conflictText,
        /global debugging scope/,
      );
      assert.equal((error as DebugConflictError).ideUser, 'SAPUSER01');
      assert.deepStrictEqual(world.calls, ['checkListener']);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
      assert.equal(session.holdsState(), false);
      assert.equal(session.currentIdentity(), undefined);
    });

    it('a failure of the preflight itself refuses the start before any change', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(() => refusedResponse('No authorization'));
      const session = new DebugSession(world.ports, IDS, HELD).bind('origin');
      await assertRejects(
        session.start('refuse', { breakpoints: [LINE] }),
        new DebugRequestError('No authorization'),
      );
      assert.deepStrictEqual(world.calls, ['checkListener']);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    });

    it('runs on the control connection, then the reconciliation, then the arming, then the listener on a connection of its own', async () => {
      const { world } = await listening(
        fakeWorld(),
        { ...IDS, stated: true },
        HELD,
        { breakpoints: [LINE] },
      );
      const at = (call: string) => world.log.findIndex((c) => c.call === call);
      const on = (call: string) =>
        world.log.find((c) => c.call === call)!.connection;
      assert.ok(at('checkListener') < at('stopListener'));
      assert.ok(at('stopListener') < at('setBreakpoints'));
      assert.ok(at('setBreakpoints') < at('listen'));
      assert.equal(on('stopListener'), on('checkListener'));
      assert.equal(on('setBreakpoints'), on('checkListener'));
      assert.notEqual(on('listen'), on('checkListener'));
    });

    it('under take-over it is checked all the same', async () => {
      const { world } = await listening(
        fakeWorld(),
        IDS,
        HELD,
        { breakpoints: [LINE] },
        'takeOver',
      );
      assert.deepStrictEqual(world.calls.slice(0, 2), [
        'checkListener',
        'setBreakpoints:1',
      ]);
    });

    it('take-over with replace (the default) sends no check', async () => {
      const { world } = await listening(
        fakeWorld(),
        IDS,
        {},
        { breakpoints: [LINE] },
        'takeOver',
      );
      assert.ok(!world.calls.includes('checkListener'));
    });

    it('a later replacement is checked first; our own listener under the same ideId does not block it', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      await session.setBreakpoints([LINE]);
      // The start's breakpoint travels with the new one.
      assert.deepStrictEqual(world.calls.slice(0, 2), [
        'checkListener',
        'setBreakpoints:2',
      ]);
    });

    it('a 409 before a later replacement refuses it; nothing is sent and the listener stands', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      world.checkAnswers.push(CONFLICT_409);
      await assertRejects(session.setBreakpoints([LINE]), DebugConflictError);
      assert.deepStrictEqual(world.calls, ['checkListener']);
      assert.equal((await session.wait(0)).state, 'listening');
    });
  });

  // The user's ruling (2026-10-12), on a measurement on premise the same day: under
  // refuse the listen's own 409 comes after our arming has replaced the user's
  // breakpoints — the set is the user's, whatever the ideId — so a start checks
  // the listener first, whatever the breakpoint conflict says.
  describe('under listener mode refuse, with replace (the default)', () => {
    it('the calls begin with the check on the control connection, before the arming', async () => {
      const { world } = await listening(
        fakeWorld(),
        IDS,
        {},
        {
          breakpoints: [LINE],
        },
      );
      assert.deepStrictEqual(world.calls.slice(0, 3), [
        'checkListener',
        'setBreakpoints:1',
        `listen:${FIRST_POLL_HOLD_SECONDS}`,
      ]);
      assert.equal(world.calls.length, 4);
      assert.match(world.calls[3] ?? '', /^listen:/);
      const on = (call: string) =>
        world.log.find((c) => c.call === call)!.connection;
      assert.equal(on('setBreakpoints'), on('checkListener'));
      assert.notEqual(on('listen'), on('checkListener'));
    });

    it('a 409 there refuses the start before any change: no arming, no stopListener, no deletion', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(CONFLICT_409);
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await assertRejects(
        session.start('refuse', { breakpoints: [LINE] }),
        DebugConflictError,
      );
      assert.deepStrictEqual(world.calls, ['checkListener']);
      assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
      assert.equal(session.holdsState(), false);
      assert.equal(session.currentIdentity(), undefined);
    });

    it('with stated ids the check comes before the reconciliation too', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(CONFLICT_409);
      const session = new DebugSession(world.ports, {
        ...IDS,
        stated: true,
      }).bind('origin');
      await assertRejects(
        session.start('refuse', { breakpoints: [LINE] }),
        DebugConflictError,
      );
      assert.deepStrictEqual(world.calls, ['checkListener']);
    });

    it('a later replacement is checked first as well', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, {});
      world.calls.length = 0;
      await session.setBreakpoints([LINE]);
      assert.deepStrictEqual(world.calls.slice(0, 2), [
        'checkListener',
        'setBreakpoints:2',
      ]);
    });
  });

  // Review Focus 5, after the user's decision that a start arms at least one
  // breakpoint: a start can no longer reach its first listen with nothing armed,
  // so a 409 there always follows an arming the system accepted, and the rollback
  // owes the stopListener that removes it.
  it('a first listen refused 409 after the arming rolls the arming back with a stopListener and holds nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT_409());
    await assertRejects(started, DebugConflictError);
    assert.deepStrictEqual(world.calls, [
      'checkListener',
      'setBreakpoints:1',
      `listen:${FIRST_POLL_HOLD_SECONDS}`,
      'stopListener',
    ]);
    assert.deepStrictEqual(new Set(world.closed), new Set(world.opened));
    assert.equal(session.holdsState(), false);
    assert.equal(session.currentIdentity(), undefined);
  });
});
