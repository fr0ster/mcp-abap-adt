import {
  DebugCleanupError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  CONFLICT,
  CONFLICT_409,
  fakeWorld,
  IDS,
  LISTEN_NOTHING,
  rowsXml,
  START,
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
const NOT_COMPLETE =
  'the cleanup of this debug session is not complete: DebugStop it, then start again';

describe('the cleanup', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
    await expect(session.stop()).rejects.toThrow(
      /listener: listener busy; breakpoint L10: Breakpoint is locked; breakpoint E1: Breakpoint is locked/,
    );
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.calls.length = 0;
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
    expect(session.requestedBreakpoints()).toEqual([]);
    expect(session.failures()).toEqual([]);
    expect(session.holdsState()).toBe(false);
  });

  it('after a failed stopListener the per-id deletes run, and what fails stays for the next stop', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1']);
    expect(session.requestedBreakpoints()).toEqual([EXC]);
    expect(session.failures()).toEqual([
      'listener: listener busy',
      'breakpoint E1: Breakpoint is locked',
    ]);
    expect(session.holdsState()).toBe(true);
  });

  it('a start that failed after a change runs the same cleanup: stopListener, no deletion by id', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(s).rejects.toThrow(/SY 530/);
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a start refused by the preflight 409, or before the wire, sends no stopListener and no deletion', async () => {
    const world = fakeWorld();
    world.checkAnswers.push(CONFLICT_409);
    const held = new DebugSession(
      world.ports,
      { ...IDS, stated: true },
      { breakpointConflict: 'refuse-if-held' },
    ).bind('origin');
    await expect(held.start('refuse', { breakpoints: [A] })).rejects.toThrow(
      /global debugging scope/,
    );
    const terminal = new DebugSession(world.ports, IDS).bind('origin');
    await expect(
      terminal.start('refuse', {
        ...START,
        debuggingMode: 'terminal',
        requestUser: 'SAPUSER02',
      }),
    ).rejects.toThrow('request_user does not apply to terminal mode');
    expect(world.calls).toEqual(['checkListener']);
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
    await expect(
      session.start('refuse', {
        ...START,
        requestUser: 'SAPUSER02',
        settings: { systemDebugging: true },
        breakpoints: [A],
      }),
    ).rejects.toThrow(/global debugging scope.*not closed: .*close refused/);
    expect(world.calls).not.toContain('stopListener');
    expect(session.currentIdentity()).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(session.preferredSettings()).toEqual({ systemDebugging: true });
    expect(session.holdsState()).toBe(true);
    await expect(session.start('refuse', { breakpoints: [A] })).rejects.toThrow(
      NOT_COMPLETE,
    );
    await session.stop();
    expect(session.currentIdentity()).toBeUndefined();
    expect(session.preferredSettings()).toEqual({});
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    world.breakpointAnswers.push(ROWS);
    const again = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await expect(again).resolves.toBeDefined();
    expect(session.currentIdentity()).toMatchObject({ debuggingMode: 'user' });
  });

  it('a failed stop keeps the identity and the settings; a new start is refused; the retry addresses the same key; a complete one clears them', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, {
      requestUser: 'SAPUSER02',
      settings: { systemDebugging: true },
    });
    world.override.stopListener = async () => refusedResponse('listener busy');
    await expect(session.stop()).rejects.toThrow(/listener busy/);
    expect(session.currentIdentity()).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(session.preferredSettings()).toEqual({ systemDebugging: true });
    await expect(
      session.start('refuse', { ...START, requestUser: 'SAPUSER03' }),
    ).rejects.toThrow(DebugStateError);
    delete world.override.stopListener;
    world.log.length = 0;
    await session.stop();
    expect(
      world.log.find((c) => c.call === 'stopListener')!.args[0],
    ).toMatchObject({ requestUser: 'SAPUSER02' });
    expect(session.currentIdentity()).toBeUndefined();
    expect(session.preferredSettings()).toEqual({});
  });

  it('a stop that kept breakpoints refuses a start with another request user, and the identity stays', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, { requestUser: 'SAPUSER02' });
    world.polls[1].resolve(CONFLICT_409()); // the listener is gone: only the kept state refuses
    await until(() => world.closed.length === 1);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('Breakpoint is locked');
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    world.calls.length = 0;
    await expect(
      session.start('refuse', {
        ...START,
        requestUser: 'SAPUSER03',
        breakpoints: [A],
      }),
    ).rejects.toThrow(NOT_COMPLETE);
    expect(world.calls).toEqual([]);
    expect(session.currentIdentity()).toMatchObject({
      requestUser: 'SAPUSER02',
    });
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10', 'E1']);
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.log.length = 0;
    await session.stop();
    expect(
      world.log.find((c) => c.call === 'stopListener')!.args[0],
    ).toMatchObject({ requestUser: 'SAPUSER02' });
    expect(session.holdsState()).toBe(false);
  });

  it('a stop whose stopListener succeeded but kept a connection still owes the stopListener', async () => {
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
    await expect(session.stop()).rejects.toThrow(/close refused/);
    expect(session.listBreakpoints()).toEqual([]);
    expect(session.requestedBreakpoints()).toEqual([]);
    expect(session.holdsState()).toBe(true);
    await expect(session.start('refuse', START)).rejects.toThrow(NOT_COMPLETE);
    world.calls.length = 0;
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(session.currentIdentity()).toBeUndefined();
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
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
    await expect(session.wait(0)).rejects.toThrow(/global debugging scope/);
    expect(session.holdsState()).toBe(true);
    await expect(session.start('refuse', START)).rejects.toThrow(NOT_COMPLETE);
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(session.holdsState()).toBe(false);
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
    expect((error as Error).message).toBe(
      `${NO_AUTH}; not undone: listener: ${NO_AUTH}`,
    );
    expect(session.holdsState()).toBe(true);
    expect(session.currentIdentity()).toMatchObject({
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
    expect(world.log.length).toBeGreaterThan(0);
    for (const c of world.log) expect(served.has(c.connection)).toBe(false);
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
    expect(session.requestedBreakpoints()).toEqual([]);
    const second = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_NOTHING());
    await second;
    expect(world.sent.map((l) => l.map((b: any) => b.clientId))).toEqual([
      ['bp1'],
      ['bp2'],
    ]);
    expect(session.requestedBreakpoints()).toEqual([A]);
  });
});
