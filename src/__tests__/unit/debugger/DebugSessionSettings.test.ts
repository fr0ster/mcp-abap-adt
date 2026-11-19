import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DebugSession,
  type DebugSettings,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { readSettings } from '../../../lib/debugger/readings';
import { assertMatchObject, assertRejects } from '../../helpers/assertions';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  START,
  settingsXml,
  until,
} from './fakes';

const sent = (world: ReturnType<typeof fakeWorld>) =>
  world.calls.filter((c) => c.startsWith('settings:'));

describe('the debugger settings', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  async function caught(settings?: DebugSettings, world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', {
      ...START,
      ...START,
      ...(settings ? { settings } : {}),
    });
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
    assert.deepStrictEqual(sent(world), ['settings:{"systemDebugging":true}']);
    const state = await session.wait(0);
    assert.deepStrictEqual(
      state.state === 'stopped' && state.stop.settings,
      readSettings(settingsXml({ systemDebugging: true })),
    );
  });

  it('no preferences: nothing is sent at an attach', async () => {
    const { world } = await caught();
    assert.deepStrictEqual(sent(world), []);
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
    assert.deepStrictEqual(
      sent(world),
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
    assert.deepStrictEqual(
      sent(world),
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    assertMatchObject(session.settingsInForce(), { systemDebugging: false });
  });

  it('setSettings merges into the preferences, applies them, and answers the last answer', async () => {
    const { session, world } = await caught({ systemDebugging: true });
    const answer = await session.setSettings({ createExceptionObject: true });
    assert.equal(
      sent(world).at(-1),
      'settings:{"systemDebugging":true,"createExceptionObject":true}',
    );
    assert.deepStrictEqual(
      answer.value,
      readSettings(
        settingsXml({ systemDebugging: true, createExceptionObject: true }),
      ),
    );
    assert.deepStrictEqual(session.preferredSettings(), {
      systemDebugging: true,
      createExceptionObject: true,
    });
    assert.deepStrictEqual(session.settingsInForce(), answer.value);
  });

  it('setSettings as the first call after an attach, with system_debugging false, sends it twice', async () => {
    const { session, world } = await caught();
    await session.setSettings({ systemDebugging: false });
    assert.deepStrictEqual(
      sent(world),
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    await session.setSettings({ systemDebugging: false });
    assert.equal(sent(world).length, 3);
  });

  it('setSettings without a stop is refused and sends nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', START);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await assertRejects(
      session.setSettings({ systemDebugging: true }),
      DebugStateError,
    );
    assert.deepStrictEqual(sent(world), []);
  });

  // Review Focus 4.
  it("a catch on the start's own first poll gets the preferences", async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', {
      ...START,
      settings: { updateDebugging: true },
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const state = await s;
    assert.deepStrictEqual(sent(world), ['settings:{"updateDebugging":true}']);
    assertMatchObject(state.state === 'stopped' && state.stop.settings, {
      updateDebugging: true,
    });
  });

  it('a stack read refused at an attach keeps the stop and names the failure as the method error, with its step', async () => {
    const world = fakeWorld();
    world.override.getStack = async () => {
      world.calls.push('getStack');
      return refusedResponse('Stack not readable');
    };
    const { session } = await caught(undefined, world);
    const state = await session.wait(0);
    assert.equal(state.state, 'stopped');
    assert.deepStrictEqual(state.state === 'stopped' && state.stop.stackError, {
      message: 'Stack not readable',
      origin: 'refusal',
      step: 'read stack',
    });
    delete world.override.getStack;
  });

  it('a settings failure at an attach keeps the stop and names the failure', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    const { session } = await caught({ systemDebugging: true }, world);
    const state = await session.wait(0);
    assert.equal(state.state, 'stopped');
    assert.deepStrictEqual(
      state.state === 'stopped' && state.stop.settingsError,
      {
        message: 'Settings not allowed',
        origin: 'refusal',
        step: 'set settings',
      },
    );
  });

  it('a failed first call after an attach does not count: a later system_debugging false is still sent twice', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    const { session } = await caught({ systemDebugging: true }, world);
    assert.equal(sent(world).length, 1);
    await session.setSettings({ systemDebugging: false });
    assert.deepStrictEqual(sent(world), [
      'settings:{"systemDebugging":true}',
      'settings:{"systemDebugging":false}',
      'settings:{"systemDebugging":false}',
    ]);
  });

  it("a re-attach whose settings fail reports no settings, not the previous attach's", async () => {
    const { session, world } = await caught({ updateDebugging: true });
    assertMatchObject(session.settingsInForce(), { updateDebugging: true });
    await session.detach();
    await until(() => world.polls.length === 3);
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 2);
    const state = await session.wait(0);
    assert.equal(state.state, 'stopped');
    assert.equal(session.settingsInForce(), undefined);
    assert.equal(state.state === 'stopped' && state.stop.settings, undefined);
    assert.deepStrictEqual(
      state.state === 'stopped' && state.stop.settingsError,
      {
        message: 'Settings not allowed',
        origin: 'refusal',
        step: 'set settings',
      },
    );
  });
});
