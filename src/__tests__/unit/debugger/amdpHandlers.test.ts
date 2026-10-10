import { handleAmdpDebugCancel } from '../../../handlers/debugger/debug/handleAmdpDebugCancel';
import { handleAmdpDebugGetTable } from '../../../handlers/debugger/debug/handleAmdpDebugGetTable';
import { handleAmdpDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleAmdpDebugSetBreakpoints';
import { handleAmdpDebugStart } from '../../../handlers/debugger/debug/handleAmdpDebugStart';
import { handleAmdpDebugStep } from '../../../handlers/debugger/debug/handleAmdpDebugStep';
import { handleAmdpDebugStop } from '../../../handlers/debugger/debug/handleAmdpDebugStop';
import { handleAmdpDebugWait } from '../../../handlers/debugger/debug/handleAmdpDebugWait';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { InstanceState } from '../../../lib/state/InstanceState';

const json = (r: any) => JSON.parse(r.content[0].text);

/** An AMDP session that records what the handlers asked of it. */
function fakeAmdp() {
  const calls: Array<[string, ...unknown[]]> = [];
  let holds = true;
  let tell = () => {};
  const amdp = {
    holdsState: () => holds,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    observe: (f: () => void) => {
      tell = f;
    },
    start: async (o: unknown) => {
      calls.push(['start', o]);
      return { mainId: 'M1', breakpoints: ['PENDING'] };
    },
    setBreakpoints: async (l: unknown) => {
      calls.push(['setBreakpoints', l]);
      return { value: ['OK'], raw: '["OK"]' };
    },
    wait: async (s: unknown) => {
      calls.push(['wait', s]);
      return {
        state: 'event',
        events: [
          {
            kind: 'ON_BREAK',
            requestId: 'Q7',
            debuggeeId: 'D1',
            line: 14,
            variables: [{ name: 'LV_I', value: '1' }],
            states: [],
            body: '<b/>',
          },
        ],
      };
    },
    step: async (a: unknown) => {
      calls.push(['step', a]);
      return { value: 'moving', raw: '' };
    },
    getTable: async (v: unknown, q: unknown) => {
      calls.push(['getTable', v, q]);
      return { value: { rows: [{ A: '1' }], columns: ['A'] }, raw: '<t/>' };
    },
    cancel: async () => {
      calls.push(['cancel']);
    },
    stop: async () => {
      calls.push(['stop']);
      holds = false;
      tell();
    },
  } as any;
  return { amdp, calls };
}

function install(amdp: any = fakeAmdp().amdp, abapHolds = false) {
  const state = new InstanceState();
  const abap = {
    holdsState: () => abapHolds,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    observe() {},
    ids: {},
  } as any;
  const instance = new DebuggerInstance({ abap, amdp });
  state.attach(instance);
  const context = { connection: {}, state, debugger: () => instance } as any;
  return { state, context, instance };
}

describe('AMDP debugger handlers', () => {
  it('the group serves the seven AMDP tools', () => {
    const names = new DebugHandlersGroup({} as any)
      .getHandlers()
      .map((e) => e.toolDefinition.name);
    for (const n of [
      'AmdpDebugStart',
      'AmdpDebugSetBreakpoints',
      'AmdpDebugWait',
      'AmdpDebugStep',
      'AmdpDebugGetTable',
      'AmdpDebugCancel',
      'AmdpDebugStop',
    ])
      expect(names).toContain(n);
  });

  it('start passes stop_existing, the breakpoints and the run, and answers the handle', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const r: any = await handleAmdpDebugStart(context, {
      stop_existing: true,
      breakpoints: [{ class_name: 'zcl_a', line: 14 }],
      run: { kind: 'class', name: 'zcl_a' },
    });
    expect(f.calls).toEqual([
      [
        'start',
        {
          stopExisting: true,
          breakpoints: [{ class_name: 'zcl_a', line: 14 }],
          run: { kind: 'class', name: 'ZCL_A' },
        },
      ],
    ]);
    expect(json(r)).toEqual({
      mainId: 'M1',
      breakpoints: ['PENDING'],
      state_handle: state.handle,
    });
  });

  it('start without stop_existing does not stop an existing one', async () => {
    const f = fakeAmdp();
    const { context } = install(f.amdp);
    await handleAmdpDebugStart(context, {
      breakpoints: [{ class_name: 'ZCL_A', line: 1 }],
    });
    expect((f.calls[0][1] as any).stopExisting).toBe(false);
  });

  it('set breakpoints replaces the list on the session', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const r: any = await handleAmdpDebugSetBreakpoints(context, {
      state_handle: state.handle,
      breakpoints: [{ class_name: 'ZCL_A', line: 20 }],
    });
    expect(f.calls).toEqual([
      ['setBreakpoints', [{ class_name: 'ZCL_A', line: 20 }]],
    ]);
    expect(json(r)).toEqual({ breakpoints: ['OK'] });
  });

  it('wait passes hold_seconds (10 by default); terse events keep the ids that tell them apart', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const r: any = await handleAmdpDebugWait(context, {
      state_handle: state.handle,
      hold_seconds: 3,
    });
    await handleAmdpDebugWait(context, { state_handle: state.handle });
    expect(f.calls).toEqual([
      ['wait', 3],
      ['wait', 10],
    ]);
    expect(json(r)).toEqual({
      state: 'event',
      events: [
        {
          kind: 'ON_BREAK',
          requestId: 'Q7',
          debuggeeId: 'D1',
          line: 14,
          variables: [{ name: 'LV_I', value: '1' }],
        },
      ],
    });
  });

  it('step passes over and continue', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const a: any = await handleAmdpDebugStep(context, {
      state_handle: state.handle,
      action: 'over',
    });
    await handleAmdpDebugStep(context, {
      state_handle: state.handle,
      action: 'continue',
    });
    expect(f.calls).toEqual([
      ['step', 'over'],
      ['step', 'continue'],
    ]);
    expect(json(a)).toEqual({ state: 'moving' });
  });

  it('get table passes the variable and the query; a blank variable is an error', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const r: any = await handleAmdpDebugGetTable(context, {
      state_handle: state.handle,
      variable: 'lt_x',
      query: 'SELECT 1 FROM :lt_x',
    });
    await handleAmdpDebugGetTable(context, {
      state_handle: state.handle,
      variable: 'lt_x',
    });
    expect(f.calls).toEqual([
      ['getTable', 'lt_x', 'SELECT 1 FROM :lt_x'],
      ['getTable', 'lt_x', undefined],
    ]);
    expect(json(r)).toEqual([{ A: '1' }]);
    for (const variable of ['', '  ']) {
      const e: any = await handleAmdpDebugGetTable(context, {
        state_handle: state.handle,
        variable,
      });
      expect(e.isError).toBe(true);
    }
    expect(f.calls).toHaveLength(2);
  });

  it('cancel cancels the debuggee', async () => {
    const f = fakeAmdp();
    const { context, state } = install(f.amdp);
    const r: any = await handleAmdpDebugCancel(context, {
      state_handle: state.handle,
    });
    expect(f.calls).toEqual([['cancel']]);
    expect(r.content[0].text).toBe('cancelled');
  });

  it("every tool but the start refuses a handle that is not the instance's", async () => {
    const f = fakeAmdp();
    const { context } = install(f.amdp);
    const args = {
      state_handle: 'NOPE',
      action: 'over' as const,
      variable: 'v',
      breakpoints: [{ class_name: 'ZCL_A', line: 1 }],
    };
    for (const h of [
      handleAmdpDebugSetBreakpoints,
      handleAmdpDebugWait,
      handleAmdpDebugStep,
      handleAmdpDebugGetTable,
      handleAmdpDebugCancel,
      handleAmdpDebugStop,
    ]) {
      const r: any = await h(context, args);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('state is not available');
    }
    expect(f.calls).toEqual([]);
  });

  it('an AMDP stop invalidates the handle once nothing else is held; with ABAP still held, the handle stays', async () => {
    for (const abapHolds of [false, true]) {
      const f = fakeAmdp();
      const { context, state } = install(f.amdp, abapHolds);
      const old = state.handle;
      await handleAmdpDebugStop(context, { state_handle: old });
      expect(f.calls).toEqual([['stop']]);
      expect(state.handle === old).toBe(abapHolds);
    }
  });

  it('a step without a session is not available', async () => {
    const state = new InstanceState();
    const instance = new DebuggerInstance({
      abap: {
        holdsState: () => false,
        pending: () => false,
        failures: () => [],
        bind() {
          return this;
        },
        observe() {},
        ids: {},
      } as any,
      amdp: new AmdpSession({} as any),
    });
    state.attach(instance);
    const r: any = await handleAmdpDebugStep(
      { connection: {}, state, debugger: () => instance } as any,
      { state_handle: state.handle, action: 'over' },
    );
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('state is not available');
  });
});
