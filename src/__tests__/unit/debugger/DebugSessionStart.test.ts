import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import {
  DebugConflictError,
  DebugRefusedError,
  DebugRequestError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import { refusedResponse } from '../../helpers/fakeClient';
import { CONFLICT_409, fakeWorld, IDS, LISTEN_NOTHING, until } from './fakes';

const LINE: IDebuggerBreakpoint = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
};
const HELD = { breakpointConflict: 'refuse-if-held' as const };

describe('the start', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listening(
    world = fakeWorld(),
    ids: ConstructorParameters<typeof DebugSession>[1] = IDS,
    options: ConstructorParameters<typeof DebugSession>[2] = {},
    start: Parameters<DebugSession['start']>[1] = {},
  ) {
    const session = new DebugSession(world.ports, ids, options).bind('origin');
    const started = session.start('refuse', start);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await started;
    return { session, world };
  }

  describe('identity by mode', () => {
    it('terminal mode without a configured terminal id is refused before the wire', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(
        session.start('refuse', { debuggingMode: 'terminal' }),
      ).rejects.toThrow(
        new DebugRefusedError('terminal mode: no terminal id is configured'),
      );
      expect(world.log).toEqual([]);
      expect(world.opened).toEqual([]);
      expect(session.holdsState()).toBe(false);
    });

    it('request_user with terminal mode is refused before the wire', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, {
        ...IDS,
        terminalStated: true,
      }).bind('origin');
      await expect(
        session.start('refuse', {
          debuggingMode: 'terminal',
          requestUser: 'SAPUSER02',
        }),
      ).rejects.toThrow(DebugRefusedError);
      expect(world.log).toEqual([]);
      expect(world.opened).toEqual([]);
    });

    it.each([
      ['user', {}],
      ['terminal', { debuggingMode: 'terminal' as const }],
    ])(
      'a blank request_user in %s mode is refused before the wire, not read as omitted',
      async (_, mode) => {
        for (const blank of ['', '   ']) {
          const world = fakeWorld();
          const session = new DebugSession(world.ports, {
            ...IDS,
            terminalStated: true,
          }).bind('origin');
          await expect(
            session.start('refuse', { ...mode, requestUser: blank }),
          ).rejects.toThrow(new DebugRefusedError('request_user is empty'));
          expect(world.log).toEqual([]);
          expect(world.opened).toEqual([]);
          expect(session.holdsState()).toBe(false);
        }
      },
    );

    it('terminal mode keys on the configured terminal id and asks for no request user', async () => {
      const world = fakeWorld();
      const asked = jest.spyOn(world.ports, 'requestUser');
      const { session } = await listening(
        world,
        { ...IDS, terminalStated: true },
        {},
        { debuggingMode: 'terminal' },
      );
      const listen = world.log.find((c) => c.call === 'listen')!;
      expect(listen.args[0]).toEqual({
        debuggingMode: 'terminal',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
      expect(asked).not.toHaveBeenCalled();
      expect(session.currentIdentity()).toEqual(listen.args[0]);
    });

    it("user mode for another user names that user, upper case, without asking the connection's", async () => {
      const world = fakeWorld();
      const asked = jest.spyOn(world.ports, 'requestUser');
      await listening(world, IDS, {}, { requestUser: 'sapuser02' });
      expect(world.log.find((c) => c.call === 'listen')!.args[0]).toEqual({
        debuggingMode: 'user',
        requestUser: 'SAPUSER02',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('a condition on a non-line breakpoint is refused before the wire, naming it', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(
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
      ).rejects.toThrow(
        'breakpoints[1] (exception): a condition applies to a line breakpoint only',
      );
      expect(world.log).toEqual([]);
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
      expect(error).toBeInstanceOf(DebugConflictError);
      expect((error as DebugConflictError).conflictText).toMatch(
        /global debugging scope/,
      );
      expect((error as DebugConflictError).ideUser).toBe('SAPUSER01');
      expect(world.calls).toEqual(['checkListener']);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
      expect(session.holdsState()).toBe(false);
      expect(session.currentIdentity()).toBeUndefined();
    });

    it('a failure of the preflight itself refuses the start before any change', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(() => refusedResponse('No authorization'));
      const session = new DebugSession(world.ports, IDS, HELD).bind('origin');
      await expect(
        session.start('refuse', { breakpoints: [LINE] }),
      ).rejects.toThrow(new DebugRequestError('No authorization'));
      expect(world.calls).toEqual(['checkListener']);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
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
      expect(at('checkListener')).toBeLessThan(at('stopListener'));
      expect(at('stopListener')).toBeLessThan(at('setBreakpoints'));
      expect(at('setBreakpoints')).toBeLessThan(at('listen'));
      expect(on('stopListener')).toBe(on('checkListener'));
      expect(on('setBreakpoints')).toBe(on('checkListener'));
      expect(on('listen')).not.toBe(on('checkListener'));
    });

    it('replace (the default) sends no check', async () => {
      const { world } = await listening(
        fakeWorld(),
        IDS,
        {},
        {
          breakpoints: [LINE],
        },
      );
      expect(world.calls).not.toContain('checkListener');
    });

    it('a later replacement is checked first; our own listener under the same ideId does not block it', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      await session.setBreakpoints([LINE]);
      expect(world.calls.slice(0, 2)).toEqual([
        'checkListener',
        'setBreakpoints:1',
      ]);
    });

    it('a 409 before a later replacement refuses it; nothing is sent and the listener stands', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      world.checkAnswers.push(CONFLICT_409);
      await expect(session.setBreakpoints([LINE])).rejects.toThrow(
        DebugConflictError,
      );
      expect(world.calls).toEqual(['checkListener']);
      expect((await session.wait(0)).state).toBe('listening');
    });
  });

  // Review Focus 5.
  it('a first listen refused 409 with nothing armed or reconciled is a refusal before any change: no stopListener', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT_409());
    await expect(started).rejects.toThrow(DebugConflictError);
    expect(world.calls).not.toContain('stopListener');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(session.holdsState()).toBe(false);
  });
});
