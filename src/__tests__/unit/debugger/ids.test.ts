import {
  newDebuggerId,
  resolveDebuggerIds,
  statedDebuggerIds,
} from '../../../lib/debugger/ids';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '../../../lib/requestContext';

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
