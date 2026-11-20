import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { requireDebugger } from '../../../lib/debugger/access';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugCleanupError } from '../../../lib/debugger/DebugSession';
import {
  InstanceState,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';
import { return_error } from '../../../lib/utils';
import { assertThrows } from '../../helpers/assertions';

const fake = (holds: boolean) =>
  ({
    holdsState: () => holds,
    pending: () => false,
    failures: () => [],
    bind() {
      return this;
    },
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
  it('create gives the debugger, whatever the state holds', () => {
    const { context, dbg } = ctx(false);
    assert.equal(requireDebugger(context, {}, { create: 'abap' }), dbg);
  });
  it('use wants this instance handle with state held', () => {
    const { context, state, dbg } = ctx(true);
    assert.equal(
      requireDebugger(context, { state_handle: state.handle }, 'use'),
      dbg,
    );
    assertThrows(
      () => requireDebugger(context, { state_handle: 'F'.repeat(32) }, 'use'),
      StateUnavailableError,
    );
  });
  it('a server instance without state or debugger refuses plainly', () => {
    assertThrows(
      () => requireDebugger({ connection: {} as any }, {}, { create: 'abap' }),
      /debugging is not served/,
    );
  });
  it('a start is not limited by anything of ours: it binds the sessions and answers the debugger', () => {
    const abapBind = mock.fn((_context: unknown): void => {});
    const amdpBind = mock.fn((_context: unknown): void => {});
    const abap = { ...fake(false), bind: abapBind };
    const amdp = { ...fake(false), bind: amdpBind };
    const state = new InstanceState();
    const dbg = new DebuggerInstance({ abap, amdp });
    state.attach(dbg);
    const context = { connection: {} as any, state, debugger: () => dbg };
    assert.equal(requireDebugger(context, {}, { create: 'amdp' }), dbg);
    assert.ok(
      abapBind.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [context]),
      ),
    );
    assert.ok(
      amdpBind.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [context]),
      ),
    );
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
    assert.deepStrictEqual(answers, [
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
    const error = await dbg.stop().then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(error instanceof DebugCleanupError);
    // Each side's throw is an entry of its own, with the step — not one text.
    assert.deepStrictEqual((error as DebugCleanupError).failures, [
      { error: 'client_threw', message: 'abap: close refused', step: 'stop' },
      {
        error: 'client_threw',
        message: 'amdp: release refused',
        step: 'stop AMDP',
      },
    ]);
  });

  it('a side that fails does not lose the notes the other side answered', async () => {
    const note = {
      message: 'notAuthorized',
      origin: 'refusal',
      step: 'stop listener',
      cleanup: { message: 'the breakpoints placed stay on the system: a line' },
    };
    const refused = {
      message: 'release refused',
      origin: 'refusal',
      step: 'release debuggee D1',
    };
    const dbg = new DebuggerInstance({
      abap: { ...fake(true), stop: async () => [note] },
      amdp: {
        ...fake(true),
        stop: async () => {
          throw new DebugCleanupError([refused]);
        },
      },
    });
    const error = await dbg.stop().then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(error instanceof DebugCleanupError);
    assert.deepStrictEqual((error as DebugCleanupError).failures, [refused]);
    assert.deepStrictEqual((error as DebugCleanupError).notes, [note]);
    // The consumer gets both lists, each entry as it is.
    const answered = JSON.parse(
      (return_error(error) as { content: Array<{ text: string }> }).content[0]
        .text,
    );
    assert.deepStrictEqual(answered, { failures: [refused], notes: [note] });
  });
});
