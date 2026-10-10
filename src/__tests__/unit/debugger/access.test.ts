import { requireDebugger } from '../../../lib/debugger/access';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import {
  InstanceState,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';

const fake = (holds: boolean) =>
  ({
    holdsState: () => holds,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
    describe: () => ({ kind: 'abap' }),
    stop: async () => {},
    observe: () => {},
    ids: { terminalId: 'T', ideId: 'I' },
  }) as any;
function ctx(holds: boolean) {
  const state = new InstanceState();
  const dbg = new DebuggerInstance({ abap: fake(holds), amdp: fake(false) });
  state.attach(dbg);
  return {
    context: { connection: {} as any, state, debugger: () => dbg },
    state,
    dbg,
  };
}

describe('requireDebugger', () => {
  it('create admits the kind and gives the debugger', () => {
    const { context, dbg } = ctx(false);
    expect(requireDebugger(context, {}, { create: 'abap' })).toBe(dbg);
  });
  it('use wants this instance handle with state held', () => {
    const { context, state, dbg } = ctx(true);
    expect(
      requireDebugger(context, { state_handle: state.handle }, 'use'),
    ).toBe(dbg);
    expect(() =>
      requireDebugger(context, { state_handle: 'F'.repeat(32) }, 'use'),
    ).toThrow(StateUnavailableError);
  });
  it('a server instance without state or debugger refuses plainly', () => {
    expect(() =>
      requireDebugger({ connection: {} as any }, {}, { create: 'abap' }),
    ).toThrow(/debugging is not served/);
  });
});

describe('requireDebugger', () => {
  it('a start is not limited by anything of ours: it binds the sessions and answers the debugger', () => {
    const abap = { ...fake(false), bind: jest.fn() };
    const amdp = { ...fake(false), bind: jest.fn() };
    const state = new InstanceState();
    const dbg = new DebuggerInstance({ abap, amdp });
    state.attach(dbg);
    const context = { connection: {} as any, state, debugger: () => dbg };
    expect(requireDebugger(context, {}, { create: 'amdp' })).toBe(dbg);
    expect(abap.bind).toHaveBeenCalledWith(context);
    expect(amdp.bind).toHaveBeenCalledWith(context);
  });
  it("a handle that is not this instance's and an empty handle get the same answer", () => {
    const { context } = ctx(true);
    const answers = ['0'.repeat(32), ''].map((h) => {
      try {
        requireDebugger(context, { state_handle: h }, 'use');
        return 'served';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(answers).toEqual([
      'state is not available',
      'state is not available',
    ]);
  });
});

describe('DebuggerInstance', () => {
  it('stop reports what each session could not undo, both named', async () => {
    const failing = (msg: string) => ({
      ...fake(true),
      stop: async () => {
        throw new Error(msg);
      },
    });
    const dbg = new DebuggerInstance({
      abap: failing('abap: close refused'),
      amdp: failing('amdp: release refused'),
    });
    await expect(dbg.stop()).rejects.toThrow(
      'abap: close refused; amdp: release refused',
    );
  });
  it('describes only the sessions that hold state', () => {
    const dbg = new DebuggerInstance({ abap: fake(true), amdp: fake(false) });
    expect(dbg.describe()).toEqual([{ kind: 'abap' }]);
  });
});
