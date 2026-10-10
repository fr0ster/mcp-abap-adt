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
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  until,
} from './fakes';

const json = (r: any) => JSON.parse(r.content[0].text);

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
  const started = handleDebugStartListener(context, {});
  await until(() => world.polls.length === 1);
  world.polls[0].resolve(LISTEN_NOTHING());
  return json(await started);
}

describe('debugger handlers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the group serves the 19 ABAP tools', () => {
    const names = new DebugHandlersGroup({} as any)
      .getHandlers()
      .map((e) => e.toolDefinition.name);
    for (const n of [
      'DebugStartListener',
      'DebugTakeOverListener',
      'DebugWait',
      'DebugSetBreakpoints',
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
    expect(waited.frames).toHaveLength(5);
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
      const started = handleDebugStartListener(context as any, { detail });
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
    // The recorded answer places the line-32 breakpoint and refuses one line breakpoint: ask for both.
    const started = handleDebugStartListener(context as any, {
      breakpoints: [
        { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 },
        { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 1 },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const answer = json(await started);
    expect(answer.state).toBe('stopped');
    expect(answer.breakpoints.placed).toHaveLength(1);
    expect(answer.breakpoints.refused).toHaveLength(1);
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
      breakpoints: [{ object_type: 'CLAS', object_name: 'ZCL_A', line: 7 }],
    });
    expect(seen[0]).toEqual([
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_a/source/main#start=7' },
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
    delete world.override.deleteBreakpoint;
    const stopped: any = await handleDebugStop(context as any, {
      state_handle: context.state.handle,
    });
    expect(stopped.isError).toBeFalsy();
    expect(context.state.holdsState()).toBe(false);
  });

  it('a refused start that left nothing answers no handle', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {});
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
    const a = handleDebugStartListener(first as any, {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    expect((await a).isError).toBeFalsy();
    const b = handleDebugStartListener(second as any, {});
    await until(() => world.polls.length === 3);
    // The fake scripts SAP's answer to the second listener; which ids SAP keys on is not this test's.
    world.polls[2].resolve(CONFLICT());
    const r: any = await b;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
    expect(first.state.holdsState()).toBe(true);
  });

  describe('every tool reaches its port', () => {
    async function stopped() {
      const k = install();
      const started = handleDebugStartListener(k.context as any, {});
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
      const started = handleDebugTakeOverListener(context as any, {});
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      await started;
      expect(world.modes).toEqual(['takeOver']);
    });

    it('the plain start opens its debugger refusing a second one', async () => {
      const { world, context } = install();
      await startedListening(world, context);
      expect(world.modes).toEqual(['refuse']);
    });

    it('an empty breakpoint list arms nothing at a start', async () => {
      for (const start of [
        handleDebugStartListener,
        handleDebugTakeOverListener,
      ]) {
        const { world, context } = install();
        const started = start(context as any, { breakpoints: [] });
        await until(() => world.polls.length === 1);
        world.polls[0].resolve(LISTEN_NOTHING());
        expect(((await started) as any).isError).toBe(false);
        expect(
          world.calls.some(
            (c) => c.startsWith('setBreakpoints') || c.startsWith('validate'),
          ),
        ).toBe(false);
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

    it('StepToLine runs or jumps to the line URI', async () => {
      const { world, call } = await stopped();
      const target = { object_type: 'CLAS', object_name: 'ZCL_A', line: 9 };
      await call(handleDebugStepToLine, { mode: 'run', ...target });
      await call(handleDebugStepToLine, { mode: 'jump', ...target });
      expect(world.calls).toContain(
        'stepToLine:stepRunToLine:/sap/bc/adt/oo/classes/zcl_a/source/main#start=9',
      );
      expect(world.calls).toContain(
        'stepToLine:stepJumpToLine:/sap/bc/adt/oo/classes/zcl_a/source/main#start=9',
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
      expect(moved.frames).toHaveLength(5);
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
