import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  locationId,
  readAmdpEvents,
  readAmdpPreview,
  readAmdpStart,
  terseAmdpEvent,
} from '../../../lib/debugger/amdpReadings';
import { corpusBody, corpusSidecar } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';
import {
  AMDP_BREAK_LINE,
  AMDP_MAIN_ID,
  AMDP_STOPPED,
  AMDP_BREAK as BREAK,
  AMDP_END as END,
  AMDP_START as START,
  AMDP_SYNCED as SYNCED,
} from './fakes';

describe('AMDP readings', () => {
  it('the start names the session in Location and the HANA session in the body', () => {
    assert.deepStrictEqual(readAmdpStart(START), {
      mainId: AMDP_MAIN_ID,
      hanaSession: 'sap.example.local:PORT:225615',
    });
    assert.equal(
      locationId({
        headers: { Location: '/x/y/ABCDEF0123456789ABCDEF0123456789' },
      }),
      'ABCDEF0123456789ABCDEF0123456789',
    );
  });
  it('the sync names its request by a bare id in Location', () => {
    assert.equal(
      locationId({ headers: { location: 'ABCDEF0123456789ABCDEF0123456789' } }),
      'ABCDEF0123456789ABCDEF0123456789',
    );
    assert.equal(locationId({ headers: {} }), '');
  });
  it('an ON_BREAK: kind, line, debuggee, every variable at any depth', () => {
    const [e] = readAmdpEvents(BREAK);
    assertMatchObject(e, {
      kind: 'ON_BREAK',
      requestId: '',
      debuggeeId: 'D1',
      line: AMDP_BREAK_LINE,
    });
    assert.deepStrictEqual(e.variables, [
      { name: '::CURRENT_OBJECT_NAME', value: 'ZMCP_DBG_AMDP=>SUM_TO' },
      { name: '::CURRENT_OBJECT_SCHEMA', value: 'SAPHANADB' },
      { name: '::ROWCOUNT', value: '0' },
      { name: 'EV_STEPS', value: '0' },
      { name: 'EV_TOTAL', value: '0' },
      { name: 'IV_LIMIT', value: '3' },
      { name: 'LV_I', value: '1' },
    ]);
    assert.deepStrictEqual(e.breakpoints, []);
    assert.deepStrictEqual(terseAmdpEvent(e), {
      kind: 'ON_BREAK',
      debuggeeId: 'D1',
      line: AMDP_BREAK_LINE,
      variables: e.variables,
      stack: [
        {
          procedure: 'ZMCP_DBG_AMDP=>SUM_TO',
          address: {
            object_type: 'CLAS',
            object_name: 'ZMCP_DBG_AMDP',
            line: AMDP_BREAK_LINE,
          },
          native_line: 14,
        },
      ],
    });
  });
  it('an ON_BREAK carries its call stack: the procedure, the ABAP position, the native line', () => {
    const [e] = readAmdpEvents(corpusBody('amdp-debugger--05-events-on-break'));
    assert.deepStrictEqual(e.stack, [
      {
        index: 1,
        procedure: 'ZMCP_DBG_AMDP=>SUM_TO',
        language: 'sql',
        type: 'line',
        isDebugCompiled: true,
        uri: '/sap/bc/adt/oo/classes/zmcp_dbg_amdp/source/main#start=27',
        objectType: 'CLAS/OC',
        objectName: 'ZMCP_DBG_AMDP',
        line: 27,
        schema: 'SAPHANADB',
        nativeLine: 14,
      },
    ]);
  });
  it('the table function stop carries its own frame; terse keeps the address and the native line', () => {
    const [e] = readAmdpEvents(
      corpusBody('amdp-debugger--07-events-on-break-table-function'),
    );
    assertMatchObject(e.stack, [
      { index: 0, procedure: 'ZMCP_DBG_AMDP=>TF', line: 37, nativeLine: 16 },
    ]);
    assert.deepStrictEqual(terseAmdpEvent(e).stack, [
      {
        procedure: 'ZMCP_DBG_AMDP=>TF',
        address: {
          object_type: 'CLAS',
          object_name: 'ZMCP_DBG_AMDP',
          line: 37,
        },
        native_line: 16,
      },
    ]);
  });
  it('terse names a frame not compiled for debugging; a deep stack keeps every frame', () => {
    const recorded = corpusBody('amdp-debugger--05-events-on-break');
    const entry =
      /<amdpdbg:callstackEntry\b[\s\S]*?<\/amdpdbg:callstackEntry>/.exec(
        recorded,
      )![0];
    const cold = entry.replace(
      'amdpdbg:isDebugCompiled="true"',
      'amdpdbg:isDebugCompiled="false"',
    );
    assert.notEqual(cold, entry);
    const xml = recorded.replace(entry, cold + entry.repeat(52));
    const terse = terseAmdpEvent(readAmdpEvents(xml)[0]);
    // No cut of the server's (#391, the owner): every frame.
    assert.equal(terse.stack?.length, 53);
    assert.equal('stack_depth' in terse, false);
    assert.equal(terse.stack?.[0].not_debug_compiled, true);
    assert.equal(terse.stack?.[1].not_debug_compiled, undefined);
  });
  it('a nested stop: the innermost frame first; the callers keep their object, not their lines', () => {
    const [e] = readAmdpEvents(
      corpusBody('amdp-debugger--10-events-on-break-nested'),
    );
    assert.deepStrictEqual(
      e.stack?.map((f) => [f.index, f.procedure, f.isDebugCompiled]),
      [
        [3, 'ZMCP_DBG_AMDP=>INNER', true],
        [2, 'ZMCP_DBG_AMDP=>MIDDLE', false],
        [1, 'ZMCP_DBG_AMDP=>OUTER', false],
      ],
    );
    assertMatchObject(e.stack?.[1], { line: 27, nativeLine: 0 });
    const object = { object_type: 'CLAS', object_name: 'ZMCP_DBG_AMDP' };
    assert.deepStrictEqual(terseAmdpEvent(e).stack, [
      {
        procedure: 'ZMCP_DBG_AMDP=>INNER',
        address: { ...object, line: 37 },
        native_line: 9,
      },
      {
        procedure: 'ZMCP_DBG_AMDP=>MIDDLE',
        address: object,
        not_debug_compiled: true,
      },
      {
        procedure: 'ZMCP_DBG_AMDP=>OUTER',
        address: object,
        not_debug_compiled: true,
      },
    ]);
  });
  it('an event without a call stack has none', () => {
    assert.equal(readAmdpEvents(END)[0].stack, undefined);
    assert.equal(terseAmdpEvent(readAmdpEvents(END)[0]).stack, undefined);
  });
  it('a variable the system marks null reads NULL', () => {
    const xml = BREAK.replace(
      'amdpdbg:name="LV_I" amdpdbg:type="INTEGER" amdpdbg:isNullValue="false"',
      'amdpdbg:name="LV_I" amdpdbg:type="INTEGER" amdpdbg:isNullValue="true"',
    );
    assert.notEqual(xml, BREAK);
    assert.ok(
      readAmdpEvents(xml)[0].variables.some((e) =>
        isDeepStrictEqual(e, {
          name: 'LV_I',
          value: 'NULL',
        }),
      ),
    );
  });
  it('an ON_EXECUTION_END names the debuggee that ended', () => {
    // objectContaining: its primitive fields matched, its array fields
    // compared whole (spec §3.1).
    const events = readAmdpEvents(END);
    assert.equal(events.length, 1);
    const [end] = events;
    assertMatchObject(end, { kind: 'ON_EXECUTION_END', debuggeeId: 'D1' });
    assert.ok(end !== undefined && 'variables' in end && 'breakpoints' in end);
    assert.deepStrictEqual(end.variables, []);
    assert.deepStrictEqual(end.breakpoints, []);
  });
  it('a stopped session answers the open read with a STOP event', () => {
    assert.deepStrictEqual(
      readAmdpEvents(AMDP_STOPPED).map((e) => e.kind),
      ['STOP'],
    );
  });
  it('a SYNC_BREAKPOINTS carries its request id and the states', () => {
    assertMatchObject(readAmdpEvents(SYNCED('Q1'))[0], {
      kind: 'SYNC_BREAKPOINTS',
      requestId: 'Q1',
      breakpoints: [{ state: 'PENDING' }, { state: 'PENDING' }],
    });
  });
  it("each event keeps its whole body — a child's self-closing tag does not end it", () => {
    const [first, second] = readAmdpEvents(
      corpusBody('amdp-debugger--04-events-toggle-breakpoints'),
    );
    for (const e of [first, second])
      assert.match(
        e.body,
        /^<amdpdbg:mainResponse[\s\S]*<\/amdpdbg:mainResponse>$/,
      );
    assert.ok(first.body.includes('#start=37'));
    assert.ok(second.body.includes('#start=27'));
    assert.ok(readAmdpEvents(END)[0].body.includes('<amdpdbg:value/>'));
  });
  it('no events in an empty answer', () => {
    assert.deepStrictEqual(readAmdpEvents(''), []);
  });
  it('a data preview becomes rows: one per position across the columns, none without columns', () => {
    const recorded = corpusBody('amdp-debugger--08-data-preview-table');
    // The recorded answer with a second row: one more value in each column, in order.
    let n = 0;
    const twoRows = recorded.replace(
      /<dataPreview:data>1<\/dataPreview:data>/g,
      (row) =>
        `${row}<dataPreview:data>${++n === 1 ? '2' : '4'}</dataPreview:data>`,
    );
    assert.deepStrictEqual(readAmdpPreview(twoRows), {
      columns: ['N', 'SQUARE'],
      rows: [
        { N: '1', SQUARE: '1' },
        { N: '2', SQUARE: '4' },
      ],
    });
    const noColumns = recorded.replace(
      /<dataPreview:columns>[\s\S]*<\/dataPreview:columns>/,
      '',
    );
    assert.deepStrictEqual(readAmdpPreview(noColumns), {
      columns: [],
      rows: [],
    });
  });

  describe('recorded on a system', () => {
    it('the events answer is a mainResponseList: a sync carries its request id and every state', () => {
      const [e] = readAmdpEvents(
        corpusBody('amdp-debugger--03-events-sync-breakpoints'),
      );
      assert.equal(e.kind, 'SYNC_BREAKPOINTS');
      assert.equal(
        e.requestId,
        corpusSidecar('amdp-debugger--02-sync-breakpoints').response.headers
          .location,
      );
      assert.deepStrictEqual(
        e.breakpoints.map((b) => b.state),
        ['PENDING', 'PENDING'],
      );
    });
    it('a toggle batch reads as one event per breakpoint, each VALID, with its place and no reason', () => {
      const events = readAmdpEvents(
        corpusBody('amdp-debugger--04-events-toggle-breakpoints'),
      );
      assert.deepStrictEqual(
        events.map((e) => e.kind),
        ['ON_TOGGLE_BREAKPOINTS', 'ON_TOGGLE_BREAKPOINTS'],
      );
      assert.deepStrictEqual(
        events.flatMap((e) => e.breakpoints),
        [
          { class_name: 'ZMCP_DBG_AMDP', line: 37, state: 'VALID' },
          { class_name: 'ZMCP_DBG_AMDP', line: 27, state: 'VALID' },
        ],
      );
      assert.deepStrictEqual(terseAmdpEvent(events[0]).breakpoints, [
        { class_name: 'ZMCP_DBG_AMDP', line: 37, state: 'VALID' },
      ]);
    });
    it('an INVALID breakpoint and the reason the system gives reach the terse event', () => {
      const invalid = corpusBody('amdp-debugger--04-events-toggle-breakpoints')
        .replace('amdpdbg:state="VALID"', 'amdpdbg:state="INVALID"')
        .replace(
          'amdpdbg:errorMessage=""',
          'amdpdbg:errorMessage="No executable statement at this line"',
        );
      const [first, second] = readAmdpEvents(invalid);
      assert.deepStrictEqual(terseAmdpEvent(first).breakpoints, [
        {
          class_name: 'ZMCP_DBG_AMDP',
          line: 37,
          state: 'INVALID',
          errorMessage: 'No executable statement at this line',
        },
      ]);
      assert.deepStrictEqual(terseAmdpEvent(second).breakpoints, [
        { class_name: 'ZMCP_DBG_AMDP', line: 27, state: 'VALID' },
      ]);
    });
    it('the table function stops as a debuggee of its own; its table variable reads as a count', () => {
      const [e] = readAmdpEvents(
        corpusBody('amdp-debugger--07-events-on-break-table-function'),
      );
      assertMatchObject(e, { kind: 'ON_BREAK', line: 37 });
      assert.match(e.debuggeeId, /:2$/);
      assert.ok(
        e.variables.some((e) =>
          isDeepStrictEqual(e, {
            name: 'LT_ROWS',
            value: 'TABLE[0]',
          }),
        ),
      );
    });
    it('the data preview of a table variable reads as rows', () => {
      assert.deepStrictEqual(
        readAmdpPreview(corpusBody('amdp-debugger--08-data-preview-table')),
        { columns: ['N', 'SQUARE'], rows: [{ N: '1', SQUARE: '1' }] },
      );
    });
    it('the start names the session in Location and the HANA session in the body', () => {
      const start = corpusSidecar('amdp-debugger--01-start');
      const read = readAmdpStart({
        headers: start.response.headers,
        data: corpusBody('amdp-debugger--01-start'),
      });
      assert.match(read.mainId, /^[0-9A-F]{32}$/);
      assert.ok(read.hanaSession.includes(':'));
    });
  });
});

/**
 * The start and the events read through the XML parser: each recorded event's
 * body is its `mainResponse` as recorded, and what the text search mishandled
 * reads as XML says.
 */
describe('AMDP documents read through the XML parser', () => {
  /** The recorded `mainResponse` elements of a body, found by plain string search. */
  function recordedSpans(body: string): string[] {
    const open = '<amdpdbg:mainResponse ';
    const close = '</amdpdbg:mainResponse>';
    const spans: string[] = [];
    let at = body.indexOf(open);
    while (at >= 0) {
      const end = body.indexOf(close, at) + close.length;
      spans.push(body.slice(at, end));
      at = body.indexOf(open, end);
    }
    return spans;
  }

  for (const name of [
    'amdp-debugger--03-events-sync-breakpoints',
    'amdp-debugger--04-events-toggle-breakpoints',
    'amdp-debugger--05-events-on-break',
    'amdp-debugger--06-events-on-execution-end',
    'amdp-debugger--07-events-on-break-table-function',
    'amdp-debugger--10-events-on-break-nested',
  ]) {
    it(format('each event of %s keeps its recorded body', name), () => {
      const body = corpusBody(name);
      const spans = recordedSpans(body);
      assert.ok(spans.length > 0);
      assert.deepStrictEqual(
        readAmdpEvents(body).map((e) => e.body),
        spans,
      );
    });
  }

  it("an event's body runs to its own end, past a closing tag written inside CDATA", () => {
    const body =
      '<amdpdbg:mainResponseList xmlns:amdpdbg="http://www.sap.com/adt/amdp/debugger">' +
      '<amdpdbg:mainResponse amdpdbg:kind="ON_BREAK" amdpdbg:requestId="R1" amdpdbg:debuggeeId="D1">' +
      '<amdpdbg:value><![CDATA[a</amdpdbg:mainResponse>b]]></amdpdbg:value>' +
      '</amdpdbg:mainResponse></amdpdbg:mainResponseList>';
    const [event] = readAmdpEvents(body);
    assert.equal(
      event.body,
      '<amdpdbg:mainResponse amdpdbg:kind="ON_BREAK" amdpdbg:requestId="R1" amdpdbg:debuggeeId="D1">' +
        '<amdpdbg:value><![CDATA[a</amdpdbg:mainResponse>b]]></amdpdbg:value>' +
        '</amdpdbg:mainResponse>',
    );
  });

  it('the HANA session of a start whose attributes are quoted with apostrophes, its key after its value', () => {
    assert.deepStrictEqual(
      readAmdpStart({
        headers: { location: '/x/ABCDEF0123456789ABCDEF0123456789' },
        data: "<amdpdbg:startParameters xmlns:amdpdbg='http://www.sap.com/adt/amdp/debugger'><amdpdbg:parameter amdpdbg:value='host:30015:42' amdpdbg:key='HANA_SESSION_ID'/></amdpdbg:startParameters>",
      }),
      {
        mainId: 'ABCDEF0123456789ABCDEF0123456789',
        hanaSession: 'host:30015:42',
      },
    );
  });

  it('no HANA session in a start that names none', () => {
    assert.equal(
      readAmdpStart({
        headers: {},
        data: '<amdpdbg:startParameters xmlns:amdpdbg="http://www.sap.com/adt/amdp/debugger"><amdpdbg:parameter amdpdbg:key="OTHER" amdpdbg:value="x"/></amdpdbg:startParameters>',
      }).hanaSession,
      '',
    );
  });
});
