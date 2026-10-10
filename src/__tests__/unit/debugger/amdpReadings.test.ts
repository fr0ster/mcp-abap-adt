import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
import {
  locationId,
  readAmdpEvents,
  readAmdpPreview,
  readAmdpStart,
  terseAmdpEvent,
} from '../../../lib/debugger/amdpReadings';
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
    expect(readAmdpStart(START)).toEqual({
      mainId: AMDP_MAIN_ID,
      hanaSession: 'sap.example.local:PORT:225615',
    });
    expect(
      locationId({
        headers: { Location: '/x/y/ABCDEF0123456789ABCDEF0123456789' },
      }),
    ).toBe('ABCDEF0123456789ABCDEF0123456789');
  });
  it('the sync names its request by a bare id in Location', () => {
    expect(
      locationId({ headers: { location: 'ABCDEF0123456789ABCDEF0123456789' } }),
    ).toBe('ABCDEF0123456789ABCDEF0123456789');
    expect(locationId({ headers: {} })).toBe('');
  });
  it('an ON_BREAK: kind, line, debuggee, every variable at any depth', () => {
    const [e] = readAmdpEvents(BREAK);
    expect(e).toMatchObject({
      kind: 'ON_BREAK',
      requestId: '',
      debuggeeId: 'D1',
      line: AMDP_BREAK_LINE,
    });
    expect(e.variables).toEqual([
      { name: '::CURRENT_OBJECT_NAME', value: 'ZMCP_DBG_AMDP=>SUM_TO' },
      { name: '::CURRENT_OBJECT_SCHEMA', value: 'SAPHANADB' },
      { name: '::ROWCOUNT', value: '0' },
      { name: 'EV_STEPS', value: '0' },
      { name: 'EV_TOTAL', value: '0' },
      { name: 'IV_LIMIT', value: '3' },
      { name: 'LV_I', value: '1' },
    ]);
    expect(e.breakpoints).toEqual([]);
    expect(terseAmdpEvent(e)).toEqual({
      kind: 'ON_BREAK',
      debuggeeId: 'D1',
      line: AMDP_BREAK_LINE,
      variables: e.variables,
    });
  });
  it('a variable the system marks null reads NULL', () => {
    const xml = BREAK.replace(
      'amdpdbg:name="LV_I" amdpdbg:type="INTEGER" amdpdbg:isNullValue="false"',
      'amdpdbg:name="LV_I" amdpdbg:type="INTEGER" amdpdbg:isNullValue="true"',
    );
    expect(xml).not.toBe(BREAK);
    expect(readAmdpEvents(xml)[0].variables).toContainEqual({
      name: 'LV_I',
      value: 'NULL',
    });
  });
  it('an ON_EXECUTION_END names the debuggee that ended', () => {
    expect(readAmdpEvents(END)).toEqual([
      expect.objectContaining({
        kind: 'ON_EXECUTION_END',
        debuggeeId: 'D1',
        variables: [],
        breakpoints: [],
      }),
    ]);
  });
  it('a stopped session answers the open read with a STOP event', () => {
    expect(readAmdpEvents(AMDP_STOPPED).map((e) => e.kind)).toEqual(['STOP']);
  });
  it('a SYNC_BREAKPOINTS carries its request id and the states', () => {
    expect(readAmdpEvents(SYNCED('Q1'))[0]).toMatchObject({
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
      expect(e.body).toMatch(
        /^<amdpdbg:mainResponse[\s\S]*<\/amdpdbg:mainResponse>$/,
      );
    expect(first.body).toContain('#start=37');
    expect(second.body).toContain('#start=27');
    expect(readAmdpEvents(END)[0].body).toContain('<amdpdbg:value/>');
  });
  it('no events in an empty answer', () => {
    expect(readAmdpEvents('')).toEqual([]);
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
    expect(readAmdpPreview(twoRows)).toEqual({
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
    expect(readAmdpPreview(noColumns)).toEqual({ columns: [], rows: [] });
  });

  describe('recorded on a system', () => {
    it('the events answer is a mainResponseList: a sync carries its request id and every state', () => {
      const [e] = readAmdpEvents(
        corpusBody('amdp-debugger--03-events-sync-breakpoints'),
      );
      expect(e.kind).toBe('SYNC_BREAKPOINTS');
      expect(e.requestId).toBe(
        corpusSidecar('amdp-debugger--02-sync-breakpoints').response.headers
          .location,
      );
      expect(e.breakpoints.map((b) => b.state)).toEqual(['PENDING', 'PENDING']);
    });
    it('a toggle batch reads as one event per breakpoint, each VALID, with its place and no reason', () => {
      const events = readAmdpEvents(
        corpusBody('amdp-debugger--04-events-toggle-breakpoints'),
      );
      expect(events.map((e) => e.kind)).toEqual([
        'ON_TOGGLE_BREAKPOINTS',
        'ON_TOGGLE_BREAKPOINTS',
      ]);
      expect(events.flatMap((e) => e.breakpoints)).toEqual([
        { class_name: 'ZMCP_DBG_AMDP', line: 37, state: 'VALID' },
        { class_name: 'ZMCP_DBG_AMDP', line: 27, state: 'VALID' },
      ]);
      expect(terseAmdpEvent(events[0]).breakpoints).toEqual([
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
      expect(terseAmdpEvent(first).breakpoints).toEqual([
        {
          class_name: 'ZMCP_DBG_AMDP',
          line: 37,
          state: 'INVALID',
          errorMessage: 'No executable statement at this line',
        },
      ]);
      expect(terseAmdpEvent(second).breakpoints).toEqual([
        { class_name: 'ZMCP_DBG_AMDP', line: 27, state: 'VALID' },
      ]);
    });
    it('the table function stops as a debuggee of its own; its table variable reads as a count', () => {
      const [e] = readAmdpEvents(
        corpusBody('amdp-debugger--07-events-on-break-table-function'),
      );
      expect(e).toMatchObject({ kind: 'ON_BREAK', line: 37 });
      expect(e.debuggeeId).toMatch(/:2$/);
      expect(e.variables).toContainEqual({
        name: 'LT_ROWS',
        value: 'TABLE[0]',
      });
    });
    it('the data preview of a table variable reads as rows', () => {
      expect(
        readAmdpPreview(corpusBody('amdp-debugger--08-data-preview-table')),
      ).toEqual({ columns: ['N', 'SQUARE'], rows: [{ N: '1', SQUARE: '1' }] });
    });
    it('the start names the session in Location and the HANA session in the body', () => {
      const start = corpusSidecar('amdp-debugger--01-start');
      const read = readAmdpStart({
        headers: start.response.headers,
        data: corpusBody('amdp-debugger--01-start'),
      });
      expect(read.mainId).toMatch(/^[0-9A-F]{32}$/);
      expect(read.hanaSession).toContain(':');
    });
  });
});
