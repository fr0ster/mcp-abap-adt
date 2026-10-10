import { DebuggerInstance } from '@mcp-abap-adt/lib/debugger';
import type { ArgsOf } from '@mcp-abap-adt/lib/handlers';
import { InstanceState } from '@mcp-abap-adt/lib/state';
import { compactDebugEntries } from '../debug/group';
import type { TOOL_DEFINITION as Start } from '../debug/handleHandlerDebugStart';
import type { TOOL_DEFINITION as Step } from '../debug/handleHandlerDebugStep';
import type { TOOL_DEFINITION as View } from '../debug/handleHandlerDebugView';
import type { TOOL_DEFINITION as Wait } from '../debug/handleHandlerDebugWait';

/** What each verb takes: the compiler checks every call below against its schema. */
interface VerbArgs {
  HandlerDebugStart: ArgsOf<typeof Start.inputSchema>;
  HandlerDebugWait: ArgsOf<typeof Wait.inputSchema>;
  HandlerDebugView: ArgsOf<typeof View.inputSchema>;
  HandlerDebugStep: ArgsOf<typeof Step.inputSchema>;
}

import { parseCompactDebug, parseCompactExposition } from '../launcher';

describe('compact debug', () => {
  const entries = compactDebugEntries();
  it('four verb tools', () => {
    expect(entries.map((e) => e.toolDefinition.name).sort()).toEqual([
      'HandlerDebugStart',
      'HandlerDebugStep',
      'HandlerDebugView',
      'HandlerDebugWait',
    ]);
  });
  it('--exposition takes debug beside ro or rw', () => {
    expect(parseCompactExposition(['--exposition=ro,debug'])).toBe('ro');
    expect(parseCompactDebug(['--exposition=ro,debug'])).toBe(true);
    expect(parseCompactExposition(['--exposition=debug'])).toBe('rw');
    expect(parseCompactExposition(['--exposition=debug,ro,rw'])).toBe('rw');
    expect(parseCompactDebug(['--exposition=rw'])).toBe(false);
    expect(parseCompactDebug([])).toBe(false);
    expect(() => parseCompactExposition(['--exposition=high'])).toThrow();
    expect(() => parseCompactExposition(['--exposition=ro,high'])).toThrow();
    expect(() => parseCompactDebug(['--exposition='])).toThrow(/no value/);
  });
  it('the start describes user mode and taking over as facts', () => {
    const start = entries.find(
      (e) => e.toolDefinition.name === 'HandlerDebugStart',
    )!;
    expect(start.toolDefinition.description).toMatch(
      /every request of the connected SAP user/,
    );
    expect(start.toolDefinition.description).toMatch(
      /Displaces another debugger/,
    );
  });
  it('every session verb requires state_handle', () => {
    for (const e of entries.filter(
      (x) => x.toolDefinition.name !== 'HandlerDebugStart',
    )) {
      expect((e.toolDefinition.inputSchema as any).required).toContain(
        'state_handle',
      );
    }
  });
  it('every parameter is described and every tool takes detail', () => {
    for (const e of entries) {
      const props = (e.toolDefinition.inputSchema as any).properties;
      expect(props.detail).toBeDefined();
      for (const [name, p] of Object.entries<any>(props)) {
        if (name !== 'detail')
          expect({ name, described: !!p.description }).toEqual({
            name,
            described: true,
          });
      }
    }
  });
});

const json = (r: any) => JSON.parse(r.content[0].text);
const URI = '/sap/bc/adt/oo/classes/zcl_a/source/main#start=7';
const frame = {
  uri: URI,
  event: 'METHOD M',
  program: 'P',
  include: 'I',
  line: 9,
};

/** A recording stand-in for the ABAP session. */
function fakeAbap(held: { on: boolean }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const stop = {
    debuggee: { uri: URI, program: 'P', include: 'I', line: 9 },
    stack: { cursor: 0, frames: [frame] },
  };
  const stopped = {
    state: 'stopped',
    stop: { ...stop, raw: { debuggee: 'd', attach: 'a', stack: 's' } },
  };
  const abap = {
    holdsState: () => held.on,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    observe() {},
    describe: () => ({ kind: 'abap' }),
    ids: { terminalId: 'T', ideId: 'I' },
    start: async (mode: unknown, o: unknown) => {
      calls.push(['start', mode, o]);
      held.on = true;
      return { state: 'listening' };
    },
    wait: async (s: unknown) => {
      calls.push(['wait', s]);
      return stopped;
    },
    step: async (m: unknown) => {
      calls.push(['step', m]);
      return stopped;
    },
    stepToLine: async (m: unknown, u: unknown) => {
      calls.push(['stepToLine', m, u]);
      return stopped;
    },
    terminate: async () => {
      calls.push(['terminate']);
      return { state: 'ended', reason: 'terminated' };
    },
    getStack: async () => {
      calls.push(['getStack']);
      return { value: stop, raw: '<s/>' };
    },
    getVariables: async (n: unknown) => {
      calls.push(['getVariables', n]);
      return {
        value: {
          variables: [
            { id: 'V1', name: 'LV', type: 'I', value: '1', metaType: 'simple' },
          ],
        },
        raw: '<v/>',
      };
    },
    getChildVariables: async (p: unknown) => {
      calls.push(['getChildVariables', p]);
      return {
        value: {
          variables: [],
          children: [{ parent: '@ROOT', child: 'C1', label: 'SCOPE' }],
        },
        raw: '<c/>',
      };
    },
    getMemorySizes: async () => {
      calls.push(['getMemorySizes']);
      return { value: '<m a="1"/>', raw: '<m a="1"/>' };
    },
    stop: async () => {
      calls.push(['stop']);
      held.on = false;
    },
  } as any;
  return { abap, calls, held, stop };
}

function fakeAmdp(held: { on: boolean }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const amdp = {
    holdsState: () => held.on,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    observe() {},
    describe: () => ({ kind: 'amdp' }),
    start: async (o: unknown) => {
      calls.push(['start', o]);
      held.on = true;
      return { mainId: 'M1', breakpoints: ['PENDING'] };
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
            variables: [],
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
    getTable: async (v: unknown) => {
      calls.push(['getTable', v]);
      return { value: { rows: [{ A: '1' }], columns: ['A'] }, raw: '<t/>' };
    },
    cancel: async () => {
      calls.push(['cancel']);
    },
    stop: async () => {
      calls.push(['stop']);
      held.on = false;
    },
  } as any;
  return { amdp, calls };
}

function install() {
  const abapHeld = { on: false };
  const amdpHeld = { on: false };
  const a = fakeAbap(abapHeld);
  const m = fakeAmdp(amdpHeld);
  const state = new InstanceState();
  const instance = new DebuggerInstance({ abap: a.abap, amdp: m.amdp });
  state.attach(instance);
  const context = { connection: {}, state, debugger: () => instance } as any;
  const call = <K extends keyof VerbArgs>(name: K, args: VerbArgs[K]) =>
    (
      compactDebugEntries().find((e) => e.toolDefinition.name === name)!
        .handler as unknown as (
        context: unknown,
        args: VerbArgs[K],
      ) => Promise<any>
    )(context, args);
  return {
    state,
    call,
    stop: a.stop,
    abap: a.calls,
    amdp: m.calls,
    abapHeld,
    amdpHeld,
  };
}

describe('compact debug verbs on the fake sessions', () => {
  it('start abap: refuse by default, takeOver on take_over; the answer carries handle and ids', async () => {
    const t = install();
    const r = await t.call('HandlerDebugStart', {
      kind: 'abap',
      breakpoints: [{ object_type: 'CLAS', object_name: 'zcl_a', line: 7 }],
      run: { kind: 'class', name: 'zcl_a' },
    });
    expect(t.abap[0]).toEqual([
      'start',
      'refuse',
      {
        breakpoints: [{ kind: 'line', uri: URI }],
        run: { kind: 'class', name: 'ZCL_A' },
      },
    ]);
    expect(json(r)).toEqual({
      state: 'listening',
      state_handle: t.state.handle,
      terminal_id: 'T',
      ide_id: 'I',
    });
    const t2 = install();
    await t2.call('HandlerDebugStart', {
      kind: 'abap',
      take_over: true,
      breakpoints: [{ exception_class: 'cx_a' }],
    });
    expect(t2.abap[0][1]).toBe('takeOver');
  });

  it('start amdp maps object_name to class_name; take_over ends a left-behind session', async () => {
    const t = install();
    const r = await t.call('HandlerDebugStart', {
      kind: 'amdp',
      take_over: true,
      breakpoints: [{ object_name: 'zcl_a', line: 14 }],
    });
    expect(t.amdp[0]).toEqual([
      'start',
      {
        stopExisting: true,
        breakpoints: [{ class_name: 'zcl_a', line: 14 }],
        run: undefined,
      },
    ]);
    expect(json(r)).toEqual({
      mainId: 'M1',
      breakpoints: ['PENDING'],
      state_handle: t.state.handle,
    });
  });

  it('a start is refused while the instance holds the other kind', async () => {
    const t = install();
    await t.call('HandlerDebugStart', {
      kind: 'amdp',
      breakpoints: [{ object_name: 'zcl_a', line: 14 }],
    });
    const r = await t.call('HandlerDebugStart', {
      kind: 'abap',
      breakpoints: [{ exception_class: 'cx_a' }],
    });
    expect(r.isError).toBe(true);
    expect(t.abap).toEqual([]);
    const t2 = install();
    await t2.call('HandlerDebugStart', {
      kind: 'abap',
      breakpoints: [{ exception_class: 'cx_a' }],
    });
    const r2 = await t2.call('HandlerDebugStart', {
      kind: 'amdp',
      breakpoints: [{ object_name: 'zcl_a', line: 14 }],
    });
    expect(r2.isError).toBe(true);
    expect(t2.amdp).toEqual([]);
  });

  it('wait dispatches on the held kind: ABAP stop with its place, AMDP events', async () => {
    const t = install();
    t.abapHeld.on = true;
    const a = json(
      await t.call('HandlerDebugWait', {
        state_handle: t.state.handle,
        hold_seconds: 3,
      }),
    );
    expect(t.abap).toEqual([['wait', 3]]);
    expect(a.state).toBe('stopped');
    expect(a.at.address).toEqual({
      object_type: 'CLAS',
      object_name: 'ZCL_A',
      line: 7,
    });
    expect(a.at.include_line).toBe(9);

    const u = install();
    u.amdpHeld.on = true;
    const m = json(
      await u.call('HandlerDebugWait', { state_handle: u.state.handle }),
    );
    expect(u.amdp).toEqual([['wait', 10]]);
    expect(m.state).toBe('event');
    expect(m.events[0].line).toBe(14);
  });

  it("a handle that is not this instance's is not available, for every verb", async () => {
    const t = install();
    t.abapHeld.on = true;
    for (const [name, extra] of [
      ['HandlerDebugWait', {}],
      ['HandlerDebugView', { what: 'stack' }],
      ['HandlerDebugStep', { action: 'over' }],
    ] as const) {
      const r = await t.call(name, { state_handle: 'F'.repeat(32), ...extra });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('state is not available');
    }
    expect(t.abap).toEqual([]);
  });

  it('view on an ABAP stop: stack, variables by name, the scopes, memory', async () => {
    const t = install();
    t.abapHeld.on = true;
    const h = t.state.handle;
    const stack = json(
      await t.call('HandlerDebugView', { state_handle: h, what: 'stack' }),
    );
    expect(stack.at.include).toBe('I');
    expect(stack.frames).toHaveLength(1);
    const named = json(
      await t.call('HandlerDebugView', {
        state_handle: h,
        what: 'variables',
        names: ['LV'],
      }),
    );
    expect(named).toEqual([{ id: 'V1', name: 'LV', type: 'I', value: '1' }]);
    const scopes = json(
      await t.call('HandlerDebugView', { state_handle: h, what: 'variables' }),
    );
    expect(scopes).toEqual([{ id: 'C1', label: 'SCOPE' }]);
    const mem = json(
      await t.call('HandlerDebugView', { state_handle: h, what: 'memory' }),
    );
    expect(mem).toBeDefined();
    expect(t.abap.map((c) => c[0])).toEqual([
      'getStack',
      'getVariables',
      'getChildVariables',
      'getMemorySizes',
    ]);
    expect(t.abap[1]).toEqual(['getVariables', ['LV']]);
    expect(t.abap[2]).toEqual(['getChildVariables', ['@ROOT']]);
    const wrong = await t.call('HandlerDebugView', {
      state_handle: h,
      what: 'table',
      names: ['T'],
    });
    expect(wrong.isError).toBe(true);
  });

  it('view on an AMDP stop: the table rows; the ABAP readings are refused', async () => {
    const t = install();
    t.amdpHeld.on = true;
    const h = t.state.handle;
    const rows = json(
      await t.call('HandlerDebugView', {
        state_handle: h,
        what: 'table',
        names: ['lt_x'],
      }),
    );
    expect(rows).toEqual([{ A: '1' }]);
    expect(t.amdp).toEqual([['getTable', 'lt_x']]);
    const stack = await t.call('HandlerDebugView', {
      state_handle: h,
      what: 'stack',
    });
    expect(stack.isError).toBe(true);
    const noName = await t.call('HandlerDebugView', {
      state_handle: h,
      what: 'table',
    });
    expect(noName.isError).toBe(true);
    expect(t.amdp).toHaveLength(1);
  });

  it('step on ABAP: the four steps, lines, terminate, stop', async () => {
    const t = install();
    t.abapHeld.on = true;
    const h = t.state.handle;
    for (const action of ['into', 'over', 'return', 'continue'] as const)
      await t.call('HandlerDebugStep', { state_handle: h, action });
    expect(t.abap.map((c) => c[1])).toEqual([
      'stepInto',
      'stepOver',
      'stepReturn',
      'stepContinue',
    ]);
    t.abap.length = 0;
    await t.call('HandlerDebugStep', {
      state_handle: h,
      action: 'run_to_line',
      object_type: 'CLAS',
      object_name: 'zcl_b',
      line: 20,
    });
    expect(t.abap[0]).toEqual([
      'stepToLine',
      'stepRunToLine',
      '/sap/bc/adt/oo/classes/zcl_b/source/main#start=20',
    ]);
    // No object given: the object of the top frame.
    await t.call('HandlerDebugStep', {
      state_handle: h,
      action: 'jump_to_line',
      line: 12,
    });
    expect(t.abap.slice(1)).toEqual([
      ['getStack'],
      [
        'stepToLine',
        'stepJumpToLine',
        '/sap/bc/adt/oo/classes/zcl_a/source/main#start=12',
      ],
    ]);
    const ended = json(
      await t.call('HandlerDebugStep', {
        state_handle: h,
        action: 'terminate',
      }),
    );
    expect(ended.state).toBe('ended');
    const stopped = json(
      await t.call('HandlerDebugStep', { state_handle: h, action: 'stop' }),
    );
    expect(stopped).toEqual({ state: 'stopped' });
    expect(t.abap.at(-1)).toEqual(['stop']);
  });

  it('step on ABAP: a line step with no object and an unaddressable frame is refused', async () => {
    const t = install();
    t.abapHeld.on = true;
    t.stop.stack.frames[0] = { ...frame, uri: 'not-an-object-uri' };
    const r = await t.call('HandlerDebugStep', {
      state_handle: t.state.handle,
      action: 'run_to_line',
      line: 3,
    });
    expect(r.isError).toBe(true);
    expect(t.abap.map((c) => c[0])).toEqual(['getStack']);
  });

  it('step on AMDP: over and continue step, terminate cancels, stop stops; the rest is refused', async () => {
    const t = install();
    t.amdpHeld.on = true;
    const h = t.state.handle;
    expect(
      json(
        await t.call('HandlerDebugStep', { state_handle: h, action: 'over' }),
      ),
    ).toEqual({ state: 'moving' });
    await t.call('HandlerDebugStep', { state_handle: h, action: 'continue' });
    await t.call('HandlerDebugStep', { state_handle: h, action: 'terminate' });
    for (const action of [
      'into',
      'return',
      'run_to_line',
      'jump_to_line',
    ] as const) {
      const r = await t.call('HandlerDebugStep', { state_handle: h, action });
      expect(r.isError).toBe(true);
    }
    expect(t.amdp).toEqual([
      ['step', 'over'],
      ['step', 'continue'],
      ['cancel'],
    ]);
    const stopped = json(
      await t.call('HandlerDebugStep', { state_handle: h, action: 'stop' }),
    );
    expect(stopped).toEqual({ state: 'stopped' });
    expect(t.amdp.at(-1)).toEqual(['stop']);
  });
});
