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
import { corpusBody } from '../../../lib/adtCorpus';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { InstanceState } from '../../../lib/state/InstanceState';
import { okResponse } from '../../helpers/fakeClient';
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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
      expect(names).toContain(n);
  });

  it('start answers the state handle and the SAP ids; wait with it answers the stop, as precise', async () => {
    const { world, state, context } = install();
    expect(await startedListening(world, context)).toEqual({
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
    expect(waited.state).toBe('stopped');
    expect(waited.at.address).toEqual({
      object_type: 'CLAS',
      object_name: 'ZCL_CV_DBG_MEASURE',
      line: 32,
    });
    expect(waited.at.include).toBe('ZCL_CV_DBG_MEASURE============CM002');
    expect(waited.frames.length).toBeGreaterThan(5);
    expect(waited).not.toHaveProperty('stack_depth');
    expect(
      (
        await handleDebugGetStack(context as any, {
          state_handle: state.handle,
          detail: 'raw',
        })
      ).content[0].text,
    ).toContain('<dbg:stack');
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
      expect(r.content.map((c: any) => c.text).join('\n')).toContain(
        state.handle,
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
    expect(answer.state).toBe('stopped');
    expect(answer.breakpoints.placed).toHaveLength(1);
    expect(answer.breakpoints.refused).toEqual([
      {
        requested: {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=1',
        },
        error: 'Cannot create a breakpoint at this position',
      },
    ]);
    expect(answer.breakpoints.unexpected).toEqual([]);
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
    expect(seen[0]).toEqual([
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
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('state is not available');
    expect(world.calls.length).toBe(before);
  });

  it('after a complete stop the old handle is not available, for good', async () => {
    const { world, state, context } = install();
    const { state_handle: old } = await startedListening(world, context);
    await handleDebugStop(context as any, { state_handle: old });
    expect(state.handle).not.toBe(old);
    const r: any = await handleDebugWait(context as any, {
      state_handle: old,
      hold_seconds: 0,
    });
    expect(r.content[0].text).toContain('state is not available');
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
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
    expect(context.state.holdsState()).toBe(false);
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
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not undone/);
    expect(context.state.holdsState()).toBe(true);
    const all = r.content.map((c: any) => c.text).join('\n');
    expect(all).toContain(context.state.handle);
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    const stopped: any = await handleDebugStop(context as any, {
      state_handle: context.state.handle,
    });
    expect(stopped.isError).toBeFalsy();
    expect(context.state.holdsState()).toBe(false);
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
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/User SAPUSER03 does not exist/);
    expect(world.log.some((c) => c.call === 'deleteBreakpoint')).toBe(false);
    expect(context.state.holdsState()).toBe(false);
  });

  it('a refused start that left nothing answers no handle', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: BP,
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
    expect(r.content[0].text).not.toContain(context.state.handle);
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
    expect((await a).isError).toBeFalsy();
    const b = handleDebugStartListener(second as any, { breakpoints: BP });
    await until(() => world.polls.length === 3);
    // The fake scripts SAP's answer to the second listener; which ids SAP keys on is not this test's.
    world.polls[2].resolve(CONFLICT());
    const r: any = await b;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
    expect(first.state.holdsState()).toBe(true);
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
    expect(world.log.find((c) => c.call === 'listen')!.args[0]).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(answer).toMatchObject({
      debugging_mode: 'user',
      request_user: 'SAPUSER02',
    });
    expect(context.debugger().abap.preferredSettings()).toEqual({
      systemDebugging: true,
      backgroundRFC: false,
    });
  });

  it.each([
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
  ])(
    'a request_user %s is a tool error before the wire, with no handle',
    async (_, extra, text) => {
      const { world, context } = install();
      const r: any = await handleDebugStartListener(context as any, {
        breakpoints: BP,
        ...extra,
      });
      expect(r.isError).toBe(true);
      expect(r.content).toHaveLength(1);
      expect(r.content[0].text).toContain(text);
      expect(world.log).toEqual([]);
      expect(world.opened).toEqual([]);
    },
  );

  it('a start the listener check refuses is a tool error naming another debugger, before any change', async () => {
    const { world, context } = install();
    world.checkAnswers.push(CONFLICT_409);
    const r: any = await handleDebugStartListener(context as any, {
      breakpoints: BP,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain(
      'another debugger holds this debugging',
    );
    expect(world.calls).toEqual(['checkListener']);
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
    expect(r.isError).toBeFalsy();
    expect(world.log.find((c) => c.call === 'listen')!.args[0]).toEqual({
      debuggingMode: 'terminal',
      terminalId: IDS.terminalId,
      ideId: IDS.ideId,
    });
    expect(json(r)).toMatchObject({
      debugging_mode: 'terminal',
      terminal_id: IDS.terminalId,
      ide_id: IDS.ideId,
    });
    expect(json(r)).not.toHaveProperty('request_user');
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
      expect(world.modes).toEqual(['takeOver', 'takeOver']);
    });

    it('the plain start opens its debugger refusing a second one', async () => {
      const { world, context } = install();
      await startedListening(world, context);
      // The arming's control connection and the listener's, both in the mode.
      expect(world.modes).toEqual(['refuse', 'refuse']);
    });

    it('an empty breakpoint list at a start is a tool error before the wire, with no handle (a missing one the boundary refuses)', async () => {
      for (const start of [
        handleDebugStartListener,
        handleDebugTakeOverListener,
      ])
        for (const args of [{ breakpoints: [] }]) {
          const { world, context } = install();
          const r: any = await start(context as any, args as any);
          expect(r.isError).toBe(true);
          expect(r.content).toHaveLength(1);
          expect(r.content[0].text).toContain(
            'a start needs at least one breakpoint',
          );
          expect(world.log).toEqual([]);
          expect(world.opened).toEqual([]);
          expect(context.state.holdsState()).toBe(false);
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
        expect(world.calls).toContain(`step:${method}:analysed`);
      }
    });

    it('Step: detach and release_debugger reach the session and answer the listening state', async () => {
      const { world, call } = await stopped();
      expect(json(await call(handleDebugStep, { action: 'detach' }))).toEqual({
        state: 'listening',
      });
      expect(world.calls).toContain('detachDebugger');
      await until(() => world.polls.length === 2);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(
        () => world.calls.filter((c) => c === 'getStack').length === 2,
      );
      expect(
        json(await call(handleDebugStep, { action: 'release_debugger' })),
      ).toEqual({ state: 'listening' });
      expect(world.calls).toContain('terminateDebugger:freed');
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
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain(
          `action: ${action} does not apply to an AMDP debug session`,
        );
      }
      expect(world.log).toEqual([]);
    });

    it('SetSettings maps its fields and answers the settings in force under the tool names', async () => {
      const { world, call } = await stopped();
      const r = json(
        await call(handleDebugSetSettings, {
          system_debugging: false,
          background_rfc: true,
        }),
      );
      expect(world.calls.filter((c) => c.startsWith('settings:'))).toEqual(
        Array(2).fill(
          'settings:{"systemDebugging":false,"backgroundRFC":true}',
        ),
      );
      expect(r).toEqual({
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
      expect(world.calls).toContain(
        'stepToLine:stepRunToLine:/sap/bc/adt/oo/classes/class_a/source/main#start=9',
      );
      expect(world.calls).toContain(
        'stepToLine:stepJumpToLine:/sap/bc/adt/oo/classes/class_a/source/main#start=9',
      );
    });

    it('GetVariables reads by names, and by parents with @ROOT as the default', async () => {
      const { world, call } = await stopped();
      await call(handleDebugGetVariables, { names: ['lv_counter'] });
      expect(world.calls).toContain('getVariables');
      const names = json(
        await call(handleDebugGetVariables, { names: ['lv_counter'] }),
      );
      expect(names[0]).toMatchObject({ id: 'LV_COUNTER', name: 'LV_COUNTER' });
      const seen: string[][] = [];
      const root = json(await call(handleDebugGetVariables, {}));
      expect(world.calls).toContain('getChildVariables');
      // the variable and the two scopes that have no variable row: every id is one a second read can take
      expect(root.map((r: any) => r.id)).toEqual([
        'ME',
        '@PARAMETERS',
        '@LOCALS',
      ]);
      expect(root[0]).toMatchObject({ name: 'ME', type: 'ZCL_CV_DBG_MEASURE' });
      expect(root[1]).toMatchObject({ label: 'Parameters' });
      expect(root[0].parent).toBeUndefined();
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
      expect(seen[0]).toEqual(['ME', '@PARAMETERS', '@LOCALS']);
      const several = json(
        await call(handleDebugGetVariables, { parents: ['@ROOT', 'X'] }),
      );
      expect(several[0].parent).toBe('@ROOT');
    });

    it('SetStackPosition, SetVariable, Terminate reach their ports', async () => {
      const { world, call } = await stopped();
      const moved = json(
        await call(handleDebugSetStackPosition, { position: 7 }),
      );
      expect(world.calls).toContain('setStackPosition:7');
      expect(moved.frames.length).toBeGreaterThan(5);
      await call(handleDebugSetVariable, { name: 'lv_counter', value: '3' });
      expect(world.calls).toContain('setVariableValue:LV_COUNTER');
      const ended = json(await call(handleDebugTerminate));
      expect(world.calls).toContain('terminate:analysed');
      expect(ended.state).toBe('ended');
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
      expect(listed.length).toBeGreaterThan(0);
      await handleDebugDeleteBreakpoint(context as any, {
        ...h,
        breakpoint_id: listed[0].id,
      });
      expect(world.calls).toContain(`deleteBreakpoint:${listed[0].id}`);
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
      expect(seen).toEqual([
        'create:LV_A:lv_a > 1',
        'list',
        'delete:W1',
        'sizes',
        'snapshot',
      ]);
    });

    it('memory sizes: terse is three sizes of the recorded answer, full the document', async () => {
      const { call } = await stopped();
      expect(json(await call(handleDebugGetMemorySizes))).toEqual({
        abap_objects_used: 236362,
        internal_used: 4271832,
        internal_peak_used: 5526872,
      });
      const full = json(
        await call(handleDebugGetMemorySizes, { detail: 'full' }),
      );
      expect(full.memorySizes.external.numberOfInternalSessions).toBe('1');
      const raw: any = await call(handleDebugGetMemorySizes, { detail: 'raw' });
      expect(raw.content[0].text).toContain('<dbg:memorySizes');
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
      expect(text).toContain('CX_A');
      expect(text).toContain('WRITE');
      expect(text).toContain('x = 1');
    });
  });
});
