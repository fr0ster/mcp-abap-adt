import { corpusBody } from '../../../lib/adtCorpus';
import {
  breakpointKey,
  readAttach,
  readBreakpoints,
  readDebuggee,
  readDebuggeeEnd,
  readStack,
  readVariables,
  terseStop,
  terseVariables,
} from '../../../lib/debugger/readings';

describe('readings of the debugger documents (recorded answers)', () => {
  it('the listener catch names the debuggee and its server', () => {
    const d = readDebuggee(corpusBody('debugger-run-to-line--02-listen'));
    expect(d).toMatchObject({
      debuggeeId: '194B2024D1671FE1B0DDF891EDADF59C',
      user: 'SAPUSER01',
      include: 'ZCL_CV_DBG_MEASURE============CM002',
      line: 9,
      instance: 'appserver_SYS_00',
      objectType: 'CLAS/OC',
    });
  });

  it('an empty listener answer is no catch', () => {
    expect(readDebuggee('')).toBeUndefined();
  });

  it('the attach says whether stepping is possible', () => {
    const a = readAttach(corpusBody('debugger-run-to-line--03-attach'));
    expect(a.isSteppingPossible).toBe(true);
    expect(a.reachedBreakpoints).toHaveLength(1);
  });

  it('the stack, top frame first', () => {
    const s = readStack(corpusBody('debugger-run-to-line--04-stack'));
    expect(s.frames[0]).toMatchObject({
      position: 12,
      line: 32,
      event: 'IF_OO_ADT_CLASSRUN~MAIN',
    });
    expect(s.frames.length).toBeGreaterThan(5);
  });

  it('variables with values; children with their parents', () => {
    const v = readVariables(
      corpusBody('debugger-run-to-line--07-variables-at-write'),
    );
    expect(v.variables[0]).toMatchObject({
      name: 'LV_COUNTER',
      type: 'I',
      value: '241',
    });
    const root = readVariables(
      corpusBody('debugger-conversation--07-children-root'),
    );
    expect(root.children.map((c) => c.child)).toEqual([
      'ME',
      '@PARAMETERS',
      '@LOCALS',
    ]);
  });

  it('breakpoints: placed with ids, refused with the message, in the answer order', () => {
    const b = readBreakpoints(
      corpusBody('debugger-conversation--01-breakpoints-set'),
    );
    expect(b[0]).toMatchObject({
      kind: 'line',
      error: 'Cannot create a breakpoint at this position',
    });
    expect(b[1].id).toMatch(/^KIND=0\./);
    expect(b[1].uri).toBe(
      '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
    );
  });

  it('matches a placed breakpoint to the request by content', () => {
    const placed = readBreakpoints(
      corpusBody(
        'debugger-kinds-and-exception--04-kind-message-with-condition',
      ),
    )[0];
    expect(breakpointKey(placed)).toBe(
      breakpointKey({
        kind: 'message',
        msgId: 'ZCV',
        msgNo: '777',
        msgTy: 'S',
      }),
    );
    const exc = readBreakpoints(
      corpusBody('debugger-kinds-and-exception--12-exception-bp-set'),
    )[0];
    expect(breakpointKey(exc)).toBe(
      breakpointKey({ kind: 'exception', exceptionClass: 'CX_SY_ZERODIVIDE' }),
    );
  });

  it('the end of a debuggee is read from the exception subtype', () => {
    expect(
      readDebuggeeEnd(corpusBody('debugger-terminate--01-terminate-debuggee')),
    ).toBe('terminateDebuggee');
    expect(
      readDebuggeeEnd(corpusBody('debugger-run-to-line--05-stepruntoline')),
    ).toBeUndefined();
  });

  it('terse: where the stop stands — the object address AND the technical place — and five frames as precise', () => {
    const t = terseStop(
      readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
      readStack(corpusBody('debugger-run-to-line--04-stack')),
    );
    expect(t.at).toEqual({
      address: {
        object_type: 'CLAS',
        object_name: 'ZCL_CV_DBG_MEASURE',
        line: 32,
      },
      unit: 'IF_OO_ADT_CLASSRUN~MAIN',
      program: 'ZCL_CV_DBG_MEASURE============CP',
      include: 'ZCL_CV_DBG_MEASURE============CM002',
      include_line: 32,
    });
    expect(t.frames).toHaveLength(5);
    expect(t.frames[1].address).toEqual({
      object_type: 'CLAS',
      object_name: 'CL_OO_ADT_RES_CLASSRUN',
      line: 105,
    });
  });

  it('terse variables: name, type, value', () => {
    expect(
      terseVariables(
        readVariables(
          corpusBody('debugger-run-to-line--07-variables-at-write'),
        ),
      ),
    ).toEqual([
      { id: 'LV_COUNTER', name: 'LV_COUNTER', type: 'I', value: '241' },
    ]);
  });
});
