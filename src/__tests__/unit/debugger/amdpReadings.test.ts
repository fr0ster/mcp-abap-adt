import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
import {
  locationId,
  readAmdpEvents,
  readAmdpPreview,
  readAmdpStart,
  terseAmdpEvent,
} from '../../../lib/debugger/amdpReadings';
import {
  AMDP_BREAK as BREAK,
  AMDP_START as START,
  AMDP_SYNCED as SYNCED,
} from './fakes';

describe('AMDP readings', () => {
  it('the start names the session in Location and the HANA session in the body', () => {
    expect(readAmdpStart(START)).toEqual({
      mainId: '0123456789ABCDEF0123456789ABCDEF',
      hanaSession: '123',
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
  it('an ON_BREAK: kind, line, debuggee, variables (NULL for a null)', () => {
    const [e] = readAmdpEvents(BREAK);
    expect(e).toMatchObject({ kind: 'ON_BREAK', debuggeeId: 'D1', line: 14 });
    expect(e.variables).toEqual([
      { name: 'LV_I', value: '1' },
      { name: 'LV_N', value: 'NULL' },
    ]);
    expect(terseAmdpEvent(e)).toEqual({
      kind: 'ON_BREAK',
      requestId: 'R1',
      debuggeeId: 'D1',
      line: 14,
      variables: e.variables,
    });
  });
  it('a SYNC_BREAKPOINTS carries its request id and the states', () => {
    expect(readAmdpEvents(SYNCED('Q1'))[0]).toMatchObject({
      kind: 'SYNC_BREAKPOINTS',
      requestId: 'Q1',
      states: ['PENDING'],
    });
  });
  it("each event keeps its whole body — a child's self-closing tag does not end it", () => {
    const xml = SYNCED('Q1').replace(
      '</amdpdbg:events>',
      '<amdpdbg:mainResponse amdpdbg:kind="ON_EXECUTION_END" amdpdbg:debuggeeId="D1"/></amdpdbg:events>',
    );
    const [sync, end] = readAmdpEvents(xml);
    expect(sync.body).toMatch(
      /^<amdpdbg:mainResponse[\s\S]*<\/amdpdbg:mainResponse>$/,
    );
    expect(sync.body).toContain('amdpdbg:state="PENDING"');
    expect(end.body).toBe(
      '<amdpdbg:mainResponse amdpdbg:kind="ON_EXECUTION_END" amdpdbg:debuggeeId="D1"/>',
    );
  });
  it('no events in an empty answer', () => {
    expect(readAmdpEvents('')).toEqual([]);
    expect(readAmdpEvents('<amdpdbg:events xmlns:amdpdbg="x"/>')).toEqual([]);
  });
  it('a data preview becomes rows', () => {
    const xml =
      '<dataPreview:tableData xmlns:dataPreview="z"><dataPreview:columns><dataPreview:metadata dataPreview:name="N"/><dataPreview:dataSet><dataPreview:data>1</dataPreview:data><dataPreview:data>2</dataPreview:data></dataPreview:dataSet></dataPreview:columns><dataPreview:columns><dataPreview:metadata dataPreview:name="SQUARE"/><dataPreview:dataSet><dataPreview:data>1</dataPreview:data><dataPreview:data>4</dataPreview:data></dataPreview:dataSet></dataPreview:columns></dataPreview:tableData>';
    expect(readAmdpPreview(xml)).toEqual({
      columns: ['N', 'SQUARE'],
      rows: [
        { N: '1', SQUARE: '1' },
        { N: '2', SQUARE: '4' },
      ],
    });
    expect(
      readAmdpPreview('<dataPreview:tableData xmlns:dataPreview="z"/>'),
    ).toEqual({ columns: [], rows: [] });
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
      expect(e.states).toEqual(['PENDING', 'PENDING']);
    });
    it('a toggle batch reads as one event per breakpoint, each VALID', () => {
      const events = readAmdpEvents(
        corpusBody('amdp-debugger--04-events-toggle-breakpoints'),
      );
      expect(events.map((e) => e.kind)).toEqual([
        'ON_TOGGLE_BREAKPOINTS',
        'ON_TOGGLE_BREAKPOINTS',
      ]);
      expect(events.flatMap((e) => e.states)).toEqual(['VALID', 'VALID']);
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
