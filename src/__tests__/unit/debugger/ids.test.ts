import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readDestinationSystemContext } from '../../../lib/auth/destinationStores';
import {
  newDebuggerId,
  resolveBreakpointConflict,
  resolveDebuggerIds,
  statedDebuggerIds,
} from '../../../lib/debugger/ids';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '../../../lib/requestContext';
import { withDestinationSystemContext } from '../../../lib/requestSystemResolution';

describe('debugger ids', () => {
  it('generates 32 upper-case hex characters, different each time', () => {
    const a = newDebuggerId();
    expect(a).toMatch(/^[0-9A-F]{32}$/);
    expect(newDebuggerId()).not.toBe(a);
  });
  it('takes each id from the environment on its own', () => {
    expect(statedDebuggerIds({ SAP_DEBUG_IDE_ID: 'IDE1' })).toEqual({
      ideId: 'IDE1',
    });
    expect(statedDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' })).toEqual({
      terminalId: 'T1',
    });
    expect(statedDebuggerIds({})).toEqual({});
  });
  it('a header wins over the environment, only for its own id', () => {
    runWithRequestContext(
      requestContextFromHeaders({ 'x-sap-debug-ide-id': 'FROMHEADER' }),
      () => {
        expect(
          statedDebuggerIds({
            SAP_DEBUG_IDE_ID: 'FROMENV',
            SAP_DEBUG_TERMINAL_ID: 'T',
          }),
        ).toEqual({ ideId: 'FROMHEADER', terminalId: 'T' });
      },
    );
  });
  it('resolves: stated where given, random elsewhere, and says whether any was stated', () => {
    const r = resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' });
    expect(r.terminalId).toBe('T1');
    expect(r.ideId).toMatch(/^[0-9A-F]{32}$/);
    expect(r.stated).toBe(true);
    expect(resolveDebuggerIds({}).stated).toBe(false);
  });
});

describe('the terminal id and the breakpoint conflict, as stated', () => {
  it('a configured terminal id replaces the random one; none configured is random, never missing', () => {
    expect(resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }).terminalId).toBe(
      'T1',
    );
    expect(resolveDebuggerIds({ SAP_DEBUG_IDE_ID: 'I1' }).terminalId).toMatch(
      /^[0-9A-F]{32}$/,
    );
  });

  it('says whether the terminal id itself was stated: only then can a terminal-mode predecessor exist', () => {
    expect(
      resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }).terminalStated,
    ).toBe(true);
    expect(resolveDebuggerIds({ SAP_DEBUG_IDE_ID: 'I1' }).terminalStated).toBe(
      false,
    );
  });

  it('the conflict: replace by default; the embedder, under the environment, under the request scope', () => {
    expect(resolveBreakpointConflict(undefined, {})).toBe('replace');
    expect(resolveBreakpointConflict('refuse-if-held', {})).toBe(
      'refuse-if-held',
    );
    expect(
      resolveBreakpointConflict('refuse-if-held', {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
      }),
    ).toBe('replace');
    runWithRequestContext(
      requestContextFromHeaders({
        'x-sap-debug-breakpoint-conflict': 'refuse-if-held',
      }),
      () =>
        expect(
          resolveBreakpointConflict('replace', {
            SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
          }),
        ).toBe('refuse-if-held'),
    );
  });

  it("a destination's .env states it, and a header wins over it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-conflict-'));
    try {
      const file = path.join(dir, 'destination.env');
      fs.writeFileSync(file, 'SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held\n');
      const stated = readDestinationSystemContext(file);
      expect(stated.debugBreakpointConflict).toBe('refuse-if-held');
      withDestinationSystemContext(stated, () =>
        expect(resolveBreakpointConflict(undefined, {})).toBe('refuse-if-held'),
      );
      runWithRequestContext(
        requestContextFromHeaders({
          'x-sap-debug-breakpoint-conflict': 'replace',
        }),
        () =>
          withDestinationSystemContext(stated, () =>
            expect(resolveBreakpointConflict(undefined, {})).toBe('replace'),
          ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a value it does not know, naming both it knows', () => {
    expect(() =>
      resolveBreakpointConflict(undefined, {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'merge',
      }),
    ).toThrow(
      'SAP_DEBUG_BREAKPOINT_CONFLICT: merge is neither replace nor refuse-if-held',
    );
  });
});
