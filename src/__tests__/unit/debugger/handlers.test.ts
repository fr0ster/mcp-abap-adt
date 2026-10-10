import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
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

  it('the group serves the 20 ABAP tools', () => {
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
      'DebugListSessions',
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
    for (const detail of ['terse', 'full', 'raw']) {
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
});
