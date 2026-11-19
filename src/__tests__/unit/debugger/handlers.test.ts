import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { handleDebugCreateMemorySnapshot } from '../../../handlers/debugger/debug/handleDebugCreateMemorySnapshot';
import { handleDebugCreateWatchpoint } from '../../../handlers/debugger/debug/handleDebugCreateWatchpoint';
import { handleDebugDeleteBreakpoint } from '../../../handlers/debugger/debug/handleDebugDeleteBreakpoint';
import { handleDebugDeleteWatchpoint } from '../../../handlers/debugger/debug/handleDebugDeleteWatchpoint';
import { handleDebugGetMemorySizes } from '../../../handlers/debugger/debug/handleDebugGetMemorySizes';
import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { handleDebugGetVariables } from '../../../handlers/debugger/debug/handleDebugGetVariables';
import { handleDebugListBreakpoints } from '../../../handlers/debugger/debug/handleDebugListBreakpoints';
import { handleDebugListWatchpoints } from '../../../handlers/debugger/debug/handleDebugListWatchpoints';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugSetSettings } from '../../../handlers/debugger/debug/handleDebugSetSettings';
import { handleDebugSetStackPosition } from '../../../handlers/debugger/debug/handleDebugSetStackPosition';
import { handleDebugSetVariable } from '../../../handlers/debugger/debug/handleDebugSetVariable';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStep } from '../../../handlers/debugger/debug/handleDebugStep';
import { handleDebugStepToLine } from '../../../handlers/debugger/debug/handleDebugStepToLine';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { handleDebugTakeOverListener } from '../../../handlers/debugger/debug/handleDebugTakeOverListener';
import { handleDebugTerminate } from '../../../handlers/debugger/debug/handleDebugTerminate';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import {
  DebugCleanupError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { InstanceState } from '../../../lib/state/InstanceState';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject, assertNoProperty } from '../../helpers/assertions';
import { okResponse } from '../../helpers/fakeClient';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import {
  CONFLICT,
  CONFLICT_409,
  fakeWorld,
  IDS,
  INVALID_USER,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  until,
} from './fakes';

const json = (r: any) => JSON.parse(r.content[0].text);
/** The one breakpoint a start needs: a start without one is refused. */
const BP = [{ statement: 'WRITE' }];

function install() {
  const world = fakeWorld();
  const state = new InstanceState();
  const dbg = new DebuggerInstance({
    abap: new DebugSession(world.ports as any, IDS),
    amdp: new AmdpSession({} as any),
  });
  state.attach(dbg);
  const context = {
    connection: {} as any,
    logger: undefined,
    state,
    debugger: () => dbg,
  };
  return { world, state, context };
}

async function startedListening(
  world: ReturnType<typeof fakeWorld>,
  context: any,
) {
  const started = handleDebugStartListener(context, { breakpoints: BP });
  await until(() => world.polls.length === 1);
  world.polls[0].resolve(LISTEN_NOTHING());
  return json(await started);
}

describe('debugger handlers', () => {
  // Jest's defaults: setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  it('the group serves the 20 ABAP tools', () => {
    const names = new DebugHandlersGroup({} as any)
      .getHandlers()
      .map((e) => e.toolDefinition.name);
    for (const n of [
      'DebugStartListener',
      'DebugTakeOverListener',
      'DebugWait',
      'DebugSetBreakpoints',
      'DebugSetSettings',
      'DebugDeleteBreakpoint',
      'DebugListBreakpoints',
      'DebugGetStack',
      'DebugSetStackPosition',
      'DebugGetVariables',
      'DebugSetVariable',
      'DebugStep',
      'DebugStepToLine',
      'DebugTerminate',
      'DebugCreateWatchpoint',
      'DebugListWatchpoints',
      'DebugDeleteWatchpoint',
      'DebugGetMemorySizes',
      'DebugCreateMemorySnapshot',
      'DebugStop',
    ])
      assert.ok(names.includes(n));
  });

  it('start answers the state handle and the SAP ids; wait with it answers the stop, as precise', async () => {
    const { world, state, context } = install();
    assert.deepStrictEqual(await startedListening(world, context), {
      state: 'listening',
      state_handle: state.handle,
      terminal_id: IDS.terminalId,
      ide_id: IDS.ideId,
      debugging_mode: 'user',
      request_user: 'SAPUSER01',
      breakpoints: {
        placed: [
          { kind: 'statement', id: 'ID1', clientId: 'bp1', statement: 'WRITE' },
        ],
        refused: [],
        lost: [],
        unexpected: [],
      },
    });
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    const waited = json(
      await handleDebugWait(context as any, {
        state_handle: state.handle,
        hold_seconds: 0,
      }),
    );
    assert.equal(waited.state, 'stopped');
    assert.deepStrictEqual(waited.at.address, {
      object_type: 'CLAS',
      object_name: 'ZCL_CV_DBG_MEASURE',
      line: 32,
    });
    assert.equal(waited.at.include, 'ZCL_CV_DBG_MEASURE============CM002');
    assert.ok(waited.frames.length > 5);
    assertNoProperty(waited, 'stack_depth');
    assert.ok(
      (
        await handleDebugGetStack(context as any, {
          state_handle: state.handle,
          detail: 'raw',
        })
      ).content[0].text.includes('<dbg:stack'),
    );
  });

  it('every detail of the start answers the state handle', async () => {
    for (const detail of ['terse', 'full', 'raw'] as const) {
      const { world, state, context } = install();
      const started = handleDebugStartListener(context as any, {
        breakpoints: BP,
        detail,
      });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      const r: any = await started;
      assert.ok(
        r.content
          .map((c: any) => c.text)
          .join('\n')
          .includes(state.handle),
      );
    }
  });

  it('a start that catches at once still answers its breakpoints under terse', async () => {
    const { world, context } = install();
    // As the system answers (on premise (2026-10-11), BASIS 816): the refused row first, each row with its tag.
    world.breakpointAnswers.push(() =>
      okResponse(
        rowsXml([
          {
            kind: 'line',
            clientId: 'bp2',
            error: 'Cannot create a breakpoint at this position',
          },
          {
            kind: 'line',
            id: 'L32',
            clientId: 'bp1',
            uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=32',
          },
        ]),
      ),
    );
    const started = handleDebugStartListener(context as any, {
      breakpoints: [
        { object_type: 'CLAS', object_name: 'class_a', line: 32 },
        { object_type: 'CLAS', object_name: 'class_a', line: 1 },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const answer = json(await started);
    assert.equal(answer.state, 'stopped');
    assert.equal(answer.breakpoints.placed.length, 1);
    assert.deepStrictEqual(answer.breakpoints.refused, [
      {
        requested: {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=1',
        },
        error: 'Cannot create a breakpoint at this position',
      },
    ]);
    assert.deepStrictEqual(answer.breakpoints.unexpected, []);
  });

  it("a line breakpoint's URI is built from type, name and line", async () => {
    const { world, state, context } = install();
    await startedListening(world, context);
    const seen: any[] = [];
    world.override.setBreakpoints = async (_i: unknown, l: any[]) => {
      seen.push(l);
      return okResponse('<dbg:breakpoints xmlns:dbg="x"/>');
    };
    await handleDebugSetBreakpoints(context as any, {
      state_handle: state.handle,
      breakpoints: [{ object_type: 'CLAS', object_name: 'CLASS_A', line: 7 }],
    });
    // The start's breakpoint travels with the new one.
    assert.deepStrictEqual(seen[0], [
      { kind: 'statement', statement: 'WRITE', clientId: 'bp1' },
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=7',
        clientId: 'bp2',
      },
    ]);
  });

  it('a foreign handle is not available and nothing is sent', async () => {
    const { world, context } = install();
    const before = world.calls.length;
    const r: any = await handleDebugGetStack(context as any, {
      state_handle: 'F'.repeat(32),
    });
    assert.equal(r.isError, true);
    assert.ok(r.content[0].text.includes('state is not available'));
    assert.equal(world.calls.length, before);
  });

  it('after a complete stop the old handle is not available, for good', async () => {
    const { world, state, context } = install();
    const { state_handle: old } = await startedListening(world, context);
    await handleDebugStop(context as any, { state_handle: old });
    assert.notEqual(state.handle, old);
    const r: any = await handleDebugWait(context as any, {
      state_handle: old,
      hold_seconds: 0,
    });
    assert.ok(r.content[0].text.includes('state is not available'));
  });

  it('a conflict at the start is a tool error, and the breakpoints it armed are gone', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: [
        { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    assert.equal(r.isError, true);
    assert.ok(r.content[0].text.includes('SY 530'));
    assert.equal(context.state.holdsState(), false);
  });

  it('a refused start that could not undo everything answers the handle with its error, so the model can stop it', async () => {
    const { world, context } = install();
    world.override.stopListener = async () => CONFLICT();
    world.override.deleteBreakpoint = async () => CONFLICT();
    const started = handleDebugStartListener(context as any, {
      breakpoints: [
        { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /not undone/);
    assert.equal(context.state.holdsState(), true);
    const all = r.content.map((c: any) => c.text).join('\n');
    assert.ok(all.includes(context.state.handle));
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    const stopped: any = await handleDebugStop(context as any, {
      state_handle: context.state.handle,
    });
    assert.ok(!stopped.isError);
    assert.equal(context.state.holdsState(), false);
  });

  it("DebugStop: a stopListener refused for the user is no debt, and SAP's answer reaches the model as a note", async () => {
    const { world, context } = install();
    await startedListening(world, context);
    await until(() => world.polls.length === 2);
    world.override.stopListener = async () => INVALID_USER();
    const stopping = handleDebugStop(context as any, {
      state_handle: context.state.handle,
    });
    await until(() => world.log.some((c) => c.call === 'stopListener'));
    world.polls[1].resolve(LISTEN_NOTHING());
    const r: any = await stopping;
    assert.ok(!r.isError);
    assert.match(r.content[0].text, /User SAPUSER03 does not exist/);
    assert.equal(
      world.log.some((c) => c.call === 'deleteBreakpoint'),
      false,
    );
    assert.equal(context.state.holdsState(), false);
  });

  it("DebugStop: when the AMDP side fails, the error still carries the ABAP side's note", async () => {
    const world = fakeWorld();
    const state = new InstanceState();
    const failingAmdp = {
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      bind() {
        return this;
      },
      stop: async () => {
        throw new DebugCleanupError([
          {
            message: 'amdp: release refused',
            origin: 'refusal',
            step: 'release debuggee D1',
          },
        ]);
      },
    };
    const dbg = new DebuggerInstance({
      abap: new DebugSession(world.ports as any, IDS),
      amdp: failingAmdp as any,
    });
    state.attach(dbg);
    const context = {
      connection: {} as any,
      logger: undefined,
      state,
      debugger: () => dbg,
    };
    await startedListening(world, context);
    await until(() => world.polls.length === 2);
    world.override.stopListener = async () => INVALID_USER();
    const stopping = handleDebugStop(context as any, {
      state_handle: state.handle,
    });
    await until(() => world.log.some((c) => c.call === 'stopListener'));
    world.polls[1].resolve(LISTEN_NOTHING());
    const r: any = await stopping;
    assert.equal(r.isError, true);
    // Each failure and each note an entry: the method's error as it is, with
    // its step.
    const answered = JSON.parse(r.content[0].text);
    assert.deepStrictEqual(answered.failures, [
      {
        message: 'amdp: release refused',
        origin: 'refusal',
        step: 'release debuggee D1',
      },
    ]);
    assert.equal(answered.notes.length, 1);
    assert.equal(answered.notes[0].step, 'stop listener');
    assert.match(answered.notes[0].raw_body, /User SAPUSER03 does not exist/);
  });

  it('a refused start that left nothing answers no handle', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: BP,
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    assert.equal(r.isError, true);
    assert.equal(r.content.length, 1);
    assert.ok(!r.content[0].text.includes(context.state.handle));
  });

  it("a second start reaches SAP, and SAP's answer (a conflict, scripted) reaches the model; nothing of ours refuses it", async () => {
    const world = fakeWorld();
    const instance = () => {
      const state = new InstanceState();
      const dbg = new DebuggerInstance({
        abap: new DebugSession(world.ports as any, IDS),
        amdp: new AmdpSession({} as any),
      });
      state.attach(dbg);
      return { state, connection: {} as any, debugger: () => dbg };
    };
    const first = instance();
    const second = instance();
    const a = handleDebugStartListener(first as any, { breakpoints: BP });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    assert.ok(!(await a).isError);
    const b = handleDebugStartListener(second as any, { breakpoints: BP });
    await until(() => world.polls.length === 3);
    // The fake scripts SAP's answer to the second listener; which ids SAP keys on is not this test's.
    world.polls[2].resolve(CONFLICT());
    const r: any = await b;
    assert.equal(r.isError, true);
    assert.ok(r.content[0].text.includes('SY 530'));
    assert.equal(first.state.holdsState(), true);
  });

  it('a start takes the request user, the mode and the settings; the answer names the identity', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: BP,
      request_user: 'sapuser02',
      debugging_mode: 'user',
      settings: { system_debugging: true, background_rfc: false },
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    const answer = json(await started);
    assertMatchObject(world.log.find((c) => c.call === 'listen')!.args[0], {
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    assertMatchObject(answer, {
      debugging_mode: 'user',
      request_user: 'SAPUSER02',
    });
    assert.deepStrictEqual(context.debugger().abap.preferredSettings(), {
      systemDebugging: true,
      backgroundRFC: false,
    });
  });

  for (const [_, extra, text] of [
    ['blank in user mode', { request_user: '   ' }, 'request_user is empty'],
    [
      'blank with terminal',
      { request_user: '', debugging_mode: 'terminal' as const },
      'request_user is empty',
    ],
    [
      'non-blank with terminal',
      { request_user: 'sapuser02', debugging_mode: 'terminal' as const },
      'request_user does not apply to terminal mode',
    ],
  ] satisfies [
    string,
    { request_user: string; debugging_mode?: 'terminal' },
    string,
  ][]) {
    it(
      format(
        'a request_user %s is a tool error before the wire, with no handle',
        _,
      ),
      async () => {
        const { world, context } = install();
        const r: any = await handleDebugStartListener(context as any, {
          breakpoints: BP,
          ...extra,
        });
        assert.equal(r.isError, true);
        assert.equal(r.content.length, 1);
        assert.ok(r.content[0].text.includes(text));
        assert.deepStrictEqual(world.log, []);
        assert.deepStrictEqual(world.opened, []);
      },
    );
  }

  it('a start the listener check refuses answers the error of the check as it is, with its step, before any change', async () => {
    const { world, context } = install();
    world.checkAnswers.push(CONFLICT_409);
    const r: any = await handleDebugStartListener(context as any, {
      breakpoints: BP,
    });
    assert.equal(r.isError, true);
    const payload = JSON.parse(r.content[0].text);
    // The method's error as the strategy made it — its message, origin and
    // SAP's document, which names the other debugger — plus the step.
    assert.equal(payload.message, 'An exception was raised');
    assert.equal(payload.origin, 'refusal');
    assert.equal(payload.step, 'check listener');
    assert.equal(
      payload.raw_body,
      (CONFLICT_409() as any).getError().response.data,
    );
    assert.deepStrictEqual(world.calls, ['checkListener']);
  });

  it('terminal mode needs no configured terminal id: the start is accepted under the session ids', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: BP,
      debugging_mode: 'terminal',
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    const r: any = await started;
    assert.ok(!r.isError);
    assert.deepStrictEqual(
      world.log.find((c) => c.call === 'listen')!.args[0],
      {
        debuggingMode: 'terminal',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      },
    );
    assertMatchObject(json(r), {
      debugging_mode: 'terminal',
      terminal_id: IDS.terminalId,
      ide_id: IDS.ideId,
    });
    assertNoProperty(json(r), 'request_user');
  });

  describe('every tool reaches its port', () => {
    async function stopped() {
      const k = install();
      const started = handleDebugStartListener(k.context as any, {
        breakpoints: BP,
      });
      await until(() => k.world.polls.length === 1);
      k.world.polls[0].resolve(LISTEN_CATCH());
      await started;
      await until(() => k.world.calls.includes('getStack'));
      const h = { state_handle: k.state.handle };
      return {
        ...k,
        h,
        // Typed by the handler: the compiler checks every argument below.
        call: <A extends { state_handle: string }, R>(
          fn: (context: any, args: A) => R,
          ...rest: {} extends Omit<A, 'state_handle'>
            ? [Omit<A, 'state_handle'>?]
            : [Omit<A, 'state_handle'>]
        ) => fn(k.context, { ...h, ...rest[0] } as A),
      };
    }

    it('the take-over start opens its debugger in take-over mode', async () => {
      const { world, context } = install();
      const started = handleDebugTakeOverListener(context as any, {
        breakpoints: BP,
      });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      await started;
      // The arming's control connection and the listener's, both in the mode.
      assert.deepStrictEqual(world.modes, ['takeOver', 'takeOver']);
    });

    it('the plain start opens its debugger refusing a second one', async () => {
      const { world, context } = install();
      await startedListening(world, context);
      // The arming's control connection and the listener's, both in the mode.
      assert.deepStrictEqual(world.modes, ['refuse', 'refuse']);
    });

    it('an empty breakpoint list at a start is a tool error before the wire, with no handle (a missing one the boundary refuses)', async () => {
      for (const start of [
        handleDebugStartListener,
        handleDebugTakeOverListener,
      ])
        for (const args of [{ breakpoints: [] }]) {
          const { world, context } = install();
          const r: any = await start(context as any, args as any);
          assert.equal(r.isError, true);
          assert.equal(r.content.length, 1);
          assert.ok(
            r.content[0].text.includes('a start needs at least one breakpoint'),
          );
          assert.deepStrictEqual(world.log, []);
          assert.deepStrictEqual(world.opened, []);
          assert.equal(context.state.holdsState(), false);
        }
    });

    it('Step maps every action to its method', async () => {
      const { world, call } = await stopped();
      for (const [action, method] of [
        ['into', 'stepInto'],
        ['over', 'stepOver'],
        ['return', 'stepReturn'],
        ['continue', 'stepContinue'],
      ] as const) {
        await call(handleDebugStep, { action });
        assert.ok(world.calls.includes(`step:${method}:analysed`));
      }
    });

    it('Step: detach and release_debugger reach the session and answer the listening state', async () => {
      const { world, call } = await stopped();
      assert.deepStrictEqual(
        json(await call(handleDebugStep, { action: 'detach' })),
        {
          state: 'listening',
        },
      );
      assert.ok(world.calls.includes('detachDebugger'));
      await until(() => world.polls.length === 2);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(
        () => world.calls.filter((c) => c === 'getStack').length === 2,
      );
      assert.deepStrictEqual(
        json(await call(handleDebugStep, { action: 'release_debugger' })),
        { state: 'listening' },
      );
      assert.ok(world.calls.includes('terminateDebugger:freed'));
    });

    it('Step: detach and release_debugger are refused for an AMDP session, before the wire', async () => {
      const world = fakeWorld();
      const state = new InstanceState();
      const amdp = {
        holdsState: () => true,
        pending: () => false,
        failures: () => [],
        bind() {
          return this;
        },
        observe() {},
        stop: async () => {},
      } as unknown as AmdpSession<any>;
      const dbg = new DebuggerInstance({
        abap: new DebugSession(world.ports as any, IDS),
        amdp,
      });
      state.attach(dbg);
      const context = {
        connection: {} as any,
        logger: undefined,
        state,
        debugger: () => dbg,
      };
      for (const action of ['detach', 'release_debugger'] as const) {
        const r: any = await handleDebugStep(context as any, {
          state_handle: state.handle,
          action,
        });
        assert.equal(r.isError, true);
        assert.ok(
          r.content[0].text.includes(
            `action: ${action} does not apply to an AMDP debug session`,
          ),
        );
      }
      assert.deepStrictEqual(world.log, []);
    });

    it('SetSettings maps its fields and answers the settings in force under the tool names', async () => {
      const { world, call } = await stopped();
      const r = json(
        await call(handleDebugSetSettings, {
          system_debugging: false,
          background_rfc: true,
        }),
      );
      assert.deepStrictEqual(
        world.calls.filter((c) => c.startsWith('settings:')),
        Array(2).fill(
          'settings:{"systemDebugging":false,"backgroundRFC":true}',
        ),
      );
      assert.deepStrictEqual(r, {
        system_debugging: false,
        update_debugging: false,
        create_exception_object: false,
        background_rfc: true,
        shared_object_debugging: false,
      });
    });

    it('StepToLine runs or jumps to the line URI', async () => {
      const { world, call } = await stopped();
      const target = { object_type: 'CLAS', object_name: 'CLASS_A', line: 9 };
      await call(handleDebugStepToLine, { mode: 'run', ...target });
      await call(handleDebugStepToLine, { mode: 'jump', ...target });
      assert.ok(
        world.calls.includes(
          'stepToLine:stepRunToLine:/sap/bc/adt/oo/classes/class_a/source/main#start=9',
        ),
      );
      assert.ok(
        world.calls.includes(
          'stepToLine:stepJumpToLine:/sap/bc/adt/oo/classes/class_a/source/main#start=9',
        ),
      );
    });

    it('GetVariables reads by names, and by parents with @ROOT as the default', async () => {
      const { world, call } = await stopped();
      await call(handleDebugGetVariables, { names: ['lv_counter'] });
      assert.ok(world.calls.includes('getVariables'));
      const names = json(
        await call(handleDebugGetVariables, { names: ['lv_counter'] }),
      );
      assertMatchObject(names[0], { id: 'LV_COUNTER', name: 'LV_COUNTER' });
      const seen: string[][] = [];
      const root = json(await call(handleDebugGetVariables, {}));
      assert.ok(world.calls.includes('getChildVariables'));
      // the variable and the two scopes that have no variable row: every id is one a second read can take
      assert.deepStrictEqual(
        root.map((r: any) => r.id),
        ['ME', '@PARAMETERS', '@LOCALS'],
      );
      assertMatchObject(root[0], { name: 'ME', type: 'ZCL_CV_DBG_MEASURE' });
      assertMatchObject(root[1], { label: 'Parameters' });
      assert.equal(root[0].parent, undefined);
      // a child id goes back in as a parent
      world.override.getChildVariables = async (p: string[]) => {
        seen.push(p);
        return okResponse(
          corpusBody('debugger-conversation--07-children-root'),
        );
      };
      await call(handleDebugGetVariables, {
        parents: root.map((r: any) => r.id),
      });
      assert.deepStrictEqual(seen[0], ['ME', '@PARAMETERS', '@LOCALS']);
      const several = json(
        await call(handleDebugGetVariables, { parents: ['@ROOT', 'X'] }),
      );
      assert.equal(several[0].parent, '@ROOT');
    });

    it('SetStackPosition, SetVariable, Terminate reach their ports', async () => {
      const { world, call } = await stopped();
      const moved = json(
        await call(handleDebugSetStackPosition, { position: 7 }),
      );
      assert.ok(world.calls.includes('setStackPosition:7'));
      assert.ok(moved.frames.length > 5);
      await call(handleDebugSetVariable, { name: 'lv_counter', value: '3' });
      assert.ok(world.calls.includes('setVariableValue:LV_COUNTER'));
      const ended = json(await call(handleDebugTerminate));
      assert.ok(world.calls.includes('terminate:analysed'));
      assert.equal(ended.state, 'ended');
    });

    it('breakpoints list and delete reach the session', async () => {
      const { world, state, context } = install();
      await startedListening(world, context);
      const h = { state_handle: state.handle };
      await handleDebugSetBreakpoints(context as any, {
        ...h,
        breakpoints: [
          { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 },
        ],
      });
      const listed = json(await handleDebugListBreakpoints(context as any, h));
      assert.ok(listed.length > 0);
      await handleDebugDeleteBreakpoint(context as any, {
        ...h,
        breakpoint_id: listed[0].id,
      });
      assert.ok(world.calls.includes(`deleteBreakpoint:${listed[0].id}`));
    });

    it('watchpoints and memory tools reach the debugger', async () => {
      const { world, call } = await stopped();
      const seen: string[] = [];
      world.override.createWatchpoint = async (n: string, o: any) => {
        seen.push(`create:${n}:${o?.condition ?? ''}`);
        return {
          ok: true,
          data: '<dbg:watchpoints xmlns:dbg="x"><dbg:w id="1"/></dbg:watchpoints>',
        };
      };
      world.override.listWatchpoints = async () => (
        seen.push('list'),
        { ok: true, data: '<dbg:watchpoints xmlns:dbg="x"/>' }
      );
      world.override.deleteWatchpoint = async (id: string) => (
        seen.push(`delete:${id}`), { ok: true, data: undefined }
      );
      world.override.getMemorySizes = async () => (
        seen.push('sizes'),
        { ok: true, data: '<dbg:memorySizes xmlns:dbg="x"/>' }
      );
      world.override.createMemorySnapshot = async () => (
        seen.push('snapshot'), { ok: true, data: '<dbg:action xmlns:dbg="x"/>' }
      );
      await call(handleDebugCreateWatchpoint, {
        name: 'lv_a',
        condition: 'lv_a > 1',
      });
      await call(handleDebugListWatchpoints);
      await call(handleDebugDeleteWatchpoint, { watchpoint_id: 'W1' });
      await call(handleDebugGetMemorySizes);
      await call(handleDebugCreateMemorySnapshot);
      assert.deepStrictEqual(seen, [
        'create:LV_A:lv_a > 1',
        'list',
        'delete:W1',
        'sizes',
        'snapshot',
      ]);
    });

    it('memory sizes: terse is three sizes of the recorded answer, full the document', async () => {
      const { call } = await stopped();
      assert.deepStrictEqual(json(await call(handleDebugGetMemorySizes)), {
        abap_objects_used: 236362,
        internal_used: 4271832,
        internal_peak_used: 5526872,
      });
      const full = json(
        await call(handleDebugGetMemorySizes, { detail: 'full' }),
      );
      assert.equal(full.memorySizes.external.numberOfInternalSessions, '1');
      const raw: any = await call(handleDebugGetMemorySizes, { detail: 'raw' });
      assert.ok(raw.content[0].text.includes('<dbg:memorySizes'));
    });

    it('SetBreakpoints answers exception and statement breakpoints as the readings are', async () => {
      const { world, state, context } = install();
      await startedListening(world, context);
      const okResponse2 = okResponse;
      world.override.setBreakpoints = async () =>
        okResponse2(
          '<dbg:breakpoints xmlns:dbg="http://www.sap.com/adt/debugger"><breakpoint kind="exception" id="E1" exceptionClass="CX_A" condition="x = 1"/><breakpoint kind="statement" id="S1" statement="WRITE"/></dbg:breakpoints>',
        );
      const r = json(
        await handleDebugSetBreakpoints(context as any, {
          state_handle: state.handle,
          breakpoints: [{ exception_class: 'cx_a' }, { statement: 'write' }],
        }),
      );
      const text = JSON.stringify(r.placed);
      assert.ok(text.includes('CX_A'));
      assert.ok(text.includes('WRITE'));
      assert.ok(text.includes('x = 1'));
    });
  });
});
