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
      readAttach(corpusBody('debugger-run-to-line--03-attach')),
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

describe('fields SAP answers that were dropped (recorded answers)', () => {
  const LISTEN = 'debugger-run-to-line--02-listen';
  const ATTACH = 'debugger-run-to-line--03-attach';
  const STEP = 'debugger-conversation--17-stepinto';
  const stack = () => readStack(corpusBody('debugger-run-to-line--04-stack'));

  it('the catch: attach possibility, listener identity and server routing (debugger-run-to-line--02-listen)', () => {
    const d = readDebuggee(corpusBody(LISTEN))!;
    expect(d.attachImpossible).toBe(false);
    expect(d.terminalId).toBe('');
    expect(d.ideId).toBe('');
    expect(d.isSameServer).toBe(true);
    expect(d.canAdtCrossServer).toBe(true);
    expect(d.kind).toBe('DEBUGGEE');
    expect(d.dump).toBeUndefined(); // DUMP_ID and DUMP_URI are empty there
  });

  it('an impossible attach is read from IS_ATTACH_IMPOSSIBLE (the element of debugger-run-to-line--02-listen, set true)', () => {
    const xml = corpusBody(LISTEN).replace(
      '<IS_ATTACH_IMPOSSIBLE>false<',
      '<IS_ATTACH_IMPOSSIBLE>true<',
    );
    expect(readDebuggee(xml)!.attachImpossible).toBe(true);
  });

  it('a short dump catch carries the dump (the DUMP_* elements of debugger-run-to-line--02-listen, filled)', () => {
    const xml = corpusBody(LISTEN)
      .replace('<DUMP_ID/>', '<DUMP_ID>ID1</DUMP_ID>')
      .replace('<DUMP_URI/>', '<DUMP_URI>/dump/uri</DUMP_URI>')
      .replace('<DUMP_UNAME/>', '<DUMP_UNAME>SAPUSER01</DUMP_UNAME>');
    expect(readDebuggee(xml)!.dump).toMatchObject({
      id: 'ID1',
      uri: '/dump/uri',
      user: 'SAPUSER01',
      date: '0000-00-00',
      time: '00:00:00',
      host: '',
    });
  });

  it('the attach: post-mortem, non-exclusive, and the reached breakpoint with its condition (debugger-run-to-line--03-attach)', () => {
    const a = readAttach(corpusBody(ATTACH));
    expect(a.isPostMortem).toBe(false);
    expect(a.isNonExclusive).toBe(false);
    expect(a.reachedBreakpoints).toEqual([
      {
        id: 'KIND=0.SOURCETYPE=ABAP.MAIN_PROGRAM=ZCL_CV_DBG_MEASURE============CP.INCLUDE=ZCL_CV_DBG_MEASURE============CM002.LINE_NR=9',
      },
    ]);
  });

  it('a condition SAP could not evaluate stays with its breakpoint (attribute of debugger-run-to-line--03-attach, filled)', () => {
    const xml = corpusBody(ATTACH)
      .replace('unresolvableCondition=""', 'unresolvableCondition="X = 1"')
      .replace(
        'unresolvableConditionErrorOffset=""',
        'unresolvableConditionErrorOffset="4"',
      )
      .replace('isPostMortem="false"', 'isPostMortem="true"');
    const a = readAttach(xml);
    expect(a.isPostMortem).toBe(true);
    expect(a.reachedBreakpoints[0]).toMatchObject({
      unresolvableCondition: 'X = 1',
      unresolvableConditionErrorOffset: '4',
    });
  });

  it('the step answer says whether the debuggee changed (debugger-conversation--17-stepinto)', () => {
    const s = readAttach(corpusBody(STEP));
    expect(s.isDebuggeeChanged).toBe(false);
    expect(s.isNonExclusive).toBe(false);
    expect(s.isSteppingPossible).toBe(true);
    expect(
      readAttach(
        corpusBody(STEP).replace(
          'isDebuggeeChanged="false"',
          'isDebuggeeChanged="true"',
        ),
      ).isDebuggeeChanged,
    ).toBe(true);
  });

  it('terse without flags adds nothing', () => {
    const t = terseStop(
      readDebuggee(corpusBody(LISTEN))!,
      stack(),
      readAttach(corpusBody(ATTACH)),
    );
    expect(Object.keys(t).sort()).toEqual(['at', 'frames']);
  });

  it('terse with the flags names them', () => {
    const d = readDebuggee(
      corpusBody(LISTEN)
        .replace('<IS_ATTACH_IMPOSSIBLE>false<', '<IS_ATTACH_IMPOSSIBLE>true<')
        .replace('<DUMP_ID/>', '<DUMP_ID>ID1</DUMP_ID>')
        .replace('<DUMP_URI/>', '<DUMP_URI>/dump/uri</DUMP_URI>'),
    )!;
    const a = readAttach(
      corpusBody(ATTACH)
        .replace('unresolvableCondition=""', 'unresolvableCondition="X = 1"')
        .replace('isPostMortem="false"', 'isPostMortem="true"'),
    );
    const t = terseStop(d, stack(), a) as any;
    expect(t.attach_impossible).toBe(true);
    expect(t.dump).toMatchObject({ id: 'ID1', uri: '/dump/uri' });
    expect(t.is_post_mortem).toBe(true);
    expect(t.kind).toBeUndefined(); // DEBUGGEE is the ordinary catch
    expect(t.unresolvable_conditions).toEqual([
      { id: a.reachedBreakpoints[0].id, condition: 'X = 1' },
    ]);
  });
});
