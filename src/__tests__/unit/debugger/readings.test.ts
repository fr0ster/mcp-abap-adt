import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  breakpointKey,
  failureText,
  readAttach,
  readBreakpoints,
  readDebuggee,
  readDebuggeeEnd,
  readSettings,
  readStack,
  readVariables,
  terseSettings,
  terseStop,
  terseVariables,
} from '../../../lib/debugger/readings';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject, assertNoProperty } from '../../helpers/assertions';
import { settingsXml } from './fakes';

describe('a blank document reads as an empty one', () => {
  for (const xml of ['', ' \n\t ']) {
    it(format('%j: no debuggee, no frames, no breakpoints', xml), () => {
      assert.equal(readDebuggee(xml), undefined);
      assert.deepStrictEqual(readStack(xml), { cursor: 0, frames: [] });
      assert.deepStrictEqual(readBreakpoints(xml), []);
      assert.deepStrictEqual(readVariables(xml), {
        variables: [],
        children: [],
      });
    });
  }
});

describe('readings of the debugger documents (recorded answers)', () => {
  it('the listener catch names the debuggee and its server', () => {
    const d = readDebuggee(corpusBody('debugger-run-to-line--02-listen'));
    assertMatchObject(d, {
      debuggeeId: '194B2024D1671FE1B0DDF891EDADF59C',
      user: 'SAPUSER01',
      include: 'ZCL_CV_DBG_MEASURE============CM002',
      line: 9,
      instance: 'appserver_SYS_00',
      objectType: 'CLAS/OC',
    });
  });

  it('an empty listener answer is no catch', () => {
    assert.equal(readDebuggee(''), undefined);
  });

  it('the attach says whether stepping is possible', () => {
    const a = readAttach(corpusBody('debugger-run-to-line--03-attach'));
    assert.equal(a.isSteppingPossible, true);
    assert.equal(a.reachedBreakpoints.length, 1);
  });

  it('the stack, top frame first', () => {
    const s = readStack(corpusBody('debugger-run-to-line--04-stack'));
    assertMatchObject(s.frames[0], {
      position: 12,
      line: 32,
      event: 'IF_OO_ADT_CLASSRUN~MAIN',
    });
    assert.ok(s.frames.length > 5);
  });

  it('variables with values; children with their parents', () => {
    const v = readVariables(
      corpusBody('debugger-run-to-line--07-variables-at-write'),
    );
    assertMatchObject(v.variables[0], {
      name: 'LV_COUNTER',
      type: 'I',
      value: '241',
    });
    const root = readVariables(
      corpusBody('debugger-conversation--07-children-root'),
    );
    assert.deepStrictEqual(
      root.children.map((c) => c.child),
      ['ME', '@PARAMETERS', '@LOCALS'],
    );
  });

  it('breakpoints: placed with ids, refused with the message, in the answer order', () => {
    const b = readBreakpoints(
      corpusBody('debugger-conversation--01-breakpoints-set'),
    );
    assertMatchObject(b[0], {
      kind: 'line',
      error: 'Cannot create a breakpoint at this position',
    });
    assert.match(b[1].id ?? '', /^KIND=0\./);
    assert.equal(
      b[1].uri,
      '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
    );
  });

  it('matches a placed breakpoint to the request by content', () => {
    const placed = readBreakpoints(
      corpusBody(
        'debugger-kinds-and-exception--04-kind-message-with-condition',
      ),
    )[0];
    assert.equal(
      breakpointKey(placed),
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
    assert.equal(
      breakpointKey(exc),
      breakpointKey({ kind: 'exception', exceptionClass: 'CX_SY_ZERODIVIDE' }),
    );
  });

  it('the end of a debuggee is read from the exception subtype', () => {
    assert.equal(
      readDebuggeeEnd(corpusBody('debugger-terminate--01-terminate-debuggee')),
      'terminateDebuggee',
    );
    assert.equal(
      readDebuggeeEnd(corpusBody('debugger-run-to-line--05-stepruntoline')),
      undefined,
    );
  });

  it('terse: where the stop stands — the object address AND the technical place — and every frame of an ordinary stack', () => {
    const stack = readStack(corpusBody('debugger-run-to-line--04-stack'));
    const t = terseStop(
      readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
      stack,
      readAttach(corpusBody('debugger-run-to-line--03-attach')),
    );
    assert.deepStrictEqual(t.at, {
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
    assert.equal(t.frames.length, stack.frames.length);
    assert.ok(t.frames.length > 5);
    assertNoProperty(t, 'stack_depth');
    assert.deepStrictEqual(t.frames[1].address, {
      object_type: 'CLAS',
      object_name: 'CL_OO_ADT_RES_CLASSRUN',
      line: 105,
    });
  });
  // No cut of the server's (#391, the owner): terse lists every frame.
  it('terse lists every frame of a deep stack', () => {
    const stack = readStack(corpusBody('debugger-run-to-line--04-stack'));
    const deep = {
      ...stack,
      frames: Array.from(
        { length: 57 },
        (_, i) => stack.frames[i % stack.frames.length],
      ),
    };
    const t = terseStop(
      readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
      deep,
      readAttach(corpusBody('debugger-run-to-line--03-attach')),
    );
    assert.equal(t.frames.length, 57);
    assertNoProperty(t, 'stack_depth');
  });

  it('terse variables: name, type, value', () => {
    assert.deepStrictEqual(
      terseVariables(
        readVariables(
          corpusBody('debugger-run-to-line--07-variables-at-write'),
        ),
      ),
      [{ id: 'LV_COUNTER', name: 'LV_COUNTER', type: 'I', value: '241' }],
    );
  });
});

describe('fields SAP answers that were dropped (recorded answers)', () => {
  const LISTEN = 'debugger-run-to-line--02-listen';
  const ATTACH = 'debugger-run-to-line--03-attach';
  const STEP = 'debugger-conversation--17-stepinto';
  const stack = () => readStack(corpusBody('debugger-run-to-line--04-stack'));

  it('the catch: attach possibility, listener identity and server routing (debugger-run-to-line--02-listen)', () => {
    const d = readDebuggee(corpusBody(LISTEN))!;
    assert.equal(d.attachImpossible, false);
    assert.equal(d.terminalId, '');
    assert.equal(d.ideId, '');
    assert.equal(d.isSameServer, true);
    assert.equal(d.canAdtCrossServer, true);
    assert.equal(d.kind, 'DEBUGGEE');
    assert.equal(d.dump, undefined); // DUMP_ID and DUMP_URI are empty there
  });

  it('an impossible attach is read from IS_ATTACH_IMPOSSIBLE (the element of debugger-run-to-line--02-listen, set true)', () => {
    const xml = corpusBody(LISTEN).replace(
      '<IS_ATTACH_IMPOSSIBLE>false<',
      '<IS_ATTACH_IMPOSSIBLE>true<',
    );
    assert.equal(readDebuggee(xml)!.attachImpossible, true);
  });

  it('a short dump catch carries the dump (the DUMP_* elements of debugger-run-to-line--02-listen, filled)', () => {
    const xml = corpusBody(LISTEN)
      .replace('<DUMP_ID/>', '<DUMP_ID>ID1</DUMP_ID>')
      .replace('<DUMP_URI/>', '<DUMP_URI>/dump/uri</DUMP_URI>')
      .replace('<DUMP_UNAME/>', '<DUMP_UNAME>SAPUSER01</DUMP_UNAME>');
    assertMatchObject(readDebuggee(xml)!.dump, {
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
    assert.equal(a.isPostMortem, false);
    assert.equal(a.isNonExclusive, false);
    assert.deepStrictEqual(a.reachedBreakpoints, [
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
    assert.equal(a.isPostMortem, true);
    assertMatchObject(a.reachedBreakpoints[0], {
      unresolvableCondition: 'X = 1',
      unresolvableConditionErrorOffset: '4',
    });
  });

  it('the step answer says whether the debuggee changed (debugger-conversation--17-stepinto)', () => {
    const s = readAttach(corpusBody(STEP));
    assert.equal(s.isDebuggeeChanged, false);
    assert.equal(s.isNonExclusive, false);
    assert.equal(s.isSteppingPossible, true);
    assert.equal(
      readAttach(
        corpusBody(STEP).replace(
          'isDebuggeeChanged="false"',
          'isDebuggeeChanged="true"',
        ),
      ).isDebuggeeChanged,
      true,
    );
  });

  it('terse without flags adds nothing', () => {
    const t = terseStop(
      readDebuggee(corpusBody(LISTEN))!,
      stack(),
      readAttach(corpusBody(ATTACH)),
    );
    assert.deepStrictEqual(Object.keys(t).sort(), ['at', 'frames']);
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
    assert.equal(t.attach_impossible, true);
    assertMatchObject(t.dump, { id: 'ID1', uri: '/dump/uri' });
    assert.equal(t.is_post_mortem, true);
    assert.equal(t.kind, undefined); // DEBUGGEE is the ordinary catch
    assert.deepStrictEqual(t.unresolvable_conditions, [
      { id: a.reachedBreakpoints[0].id, condition: 'X = 1' },
    ]);
  });

  describe('a failed answer keeps what SAP said (recorded 409s)', () => {
    const failed = (name: string) => ({
      message: 'Request failed with status code 409',
      response: { data: corpusBody(name) },
    });
    it('a refused listener: the conflict text, the subtype and the T100 key', () => {
      assert.equal(
        failureText(failed('debugger-conflict--01-listen-refused')),
        'Request failed with status code 409: Another session (user SAPUSER01) exists with global debugging scope for user SAPUSER01 [conflictDetected, SY 530]',
      );
    });
    it('a poll taken over: the subtype tells it from a refusal', () => {
      assert.ok(
        failureText(failed('debugger-conflict--02-poll-taken-over')).includes(
          '[conflictNotification, SY 530]',
        ),
      );
    });
    it('no exception document: the line as it was', () => {
      assert.equal(
        failureText({ message: 'socket hang up' }),
        'socket hang up',
      );
    });
  });
});

describe('readSettings', () => {
  it('reads the five settings a caller may set; showDataAging is not read', () => {
    assert.deepStrictEqual(
      readSettings(settingsXml({ systemDebugging: true, backgroundRFC: true })),
      {
        systemDebugging: true,
        createExceptionObject: false,
        backgroundRFC: true,
        sharedObjectDebugging: false,
        updateDebugging: false,
      },
    );
  });
  it('an empty answer reads as nothing known', () => {
    assert.deepStrictEqual(readSettings(''), {});
  });
  it('terse names them as the tools do', () => {
    assert.deepStrictEqual(
      terseSettings({ systemDebugging: false, backgroundRFC: true }),
      {
        system_debugging: false,
        background_rfc: true,
      },
    );
  });
});
