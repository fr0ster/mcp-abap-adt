import {
  DebugSession,
  type DebugSettings,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { readSettings } from '../../../lib/debugger/readings';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  settingsXml,
  until,
} from './fakes';

const sent = (world: ReturnType<typeof fakeWorld>) =>
  world.calls.filter((c) => c.startsWith('settings:'));

describe('the debugger settings', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function caught(settings?: DebugSettings, world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', settings ? { settings } : {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    return { session, world };
  }

  it('the preferences are applied after the attach, and the stop reports the settings in force', async () => {
    const { session, world } = await caught({ systemDebugging: true });
    expect(sent(world)).toEqual(['settings:{"systemDebugging":true}']);
    const state = await session.wait(0);
    expect(state.state === 'stopped' && state.stop.settings).toEqual(
      readSettings(settingsXml({ systemDebugging: true })),
    );
  });

  it('no preferences: nothing is sent at an attach', async () => {
    const { world } = await caught();
    expect(sent(world)).toEqual([]);
  });

  it('again after a re-attach: a catch after detach, and after release_debugger', async () => {
    const { session, world } = await caught({ updateDebugging: true });
    await session.detach();
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 2);
    await session.releaseDebugger();
    await until(() => world.polls.length === 4);
    world.polls[3].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 3);
    expect(sent(world)).toEqual(
      Array(3).fill('settings:{"updateDebugging":true}'),
    );
  });

  it('system_debugging false is sent twice after an attach; the reported settings are the second answer', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(
      () => okResponse(settingsXml({ systemDebugging: true })),
      () => okResponse(settingsXml({ systemDebugging: false })),
    );
    const { session } = await caught({ systemDebugging: false }, world);
    expect(sent(world)).toEqual(
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    expect(session.settingsInForce()).toMatchObject({ systemDebugging: false });
  });

  it('setSettings merges into the preferences, applies them, and answers the last answer', async () => {
    const { session, world } = await caught({ systemDebugging: true });
    const answer = await session.setSettings({ createExceptionObject: true });
    expect(sent(world).at(-1)).toBe(
      'settings:{"systemDebugging":true,"createExceptionObject":true}',
    );
    expect(answer.value).toEqual(
      readSettings(
        settingsXml({ systemDebugging: true, createExceptionObject: true }),
      ),
    );
    expect(session.preferredSettings()).toEqual({
      systemDebugging: true,
      createExceptionObject: true,
    });
    expect(session.settingsInForce()).toEqual(answer.value);
  });

  it('setSettings as the first call after an attach, with system_debugging false, sends it twice', async () => {
    const { session, world } = await caught();
    await session.setSettings({ systemDebugging: false });
    expect(sent(world)).toEqual(
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    await session.setSettings({ systemDebugging: false });
    expect(sent(world)).toHaveLength(3);
  });

  it('setSettings without a stop is refused and sends nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await expect(
      session.setSettings({ systemDebugging: true }),
    ).rejects.toThrow(DebugStateError);
    expect(sent(world)).toEqual([]);
  });

  // Review Focus 4.
  it("a catch on the start's own first poll gets the preferences", async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { settings: { updateDebugging: true } });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const state = await s;
    expect(sent(world)).toEqual(['settings:{"updateDebugging":true}']);
    expect(state.state === 'stopped' && state.stop.settings).toMatchObject({
      updateDebugging: true,
    });
  });

  it('a settings failure at an attach keeps the stop and names the failure', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    const { session } = await caught({ systemDebugging: true }, world);
    const state = await session.wait(0);
    expect(state.state).toBe('stopped');
    expect(state.state === 'stopped' && state.stop.settingsError).toBe(
      'Settings not allowed',
    );
  });

  it('a failed first call after an attach does not count: a later system_debugging false is still sent twice', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    const { session } = await caught({ systemDebugging: true }, world);
    expect(sent(world)).toHaveLength(1);
    await session.setSettings({ systemDebugging: false });
    expect(sent(world)).toEqual([
      'settings:{"systemDebugging":true}',
      'settings:{"systemDebugging":false}',
      'settings:{"systemDebugging":false}',
    ]);
  });

  it("a re-attach whose settings fail reports no settings, not the previous attach's", async () => {
    const { session, world } = await caught({ updateDebugging: true });
    expect(session.settingsInForce()).toMatchObject({ updateDebugging: true });
    await session.detach();
    await until(() => world.polls.length === 3);
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 2);
    const state = await session.wait(0);
    expect(state.state).toBe('stopped');
    expect(session.settingsInForce()).toBeUndefined();
    expect(state.state === 'stopped' && state.stop.settings).toBeUndefined();
    expect(state.state === 'stopped' && state.stop.settingsError).toBe(
      'Settings not allowed',
    );
  });
});
