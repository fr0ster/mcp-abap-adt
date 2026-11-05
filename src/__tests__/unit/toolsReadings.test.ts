/**
 * What the developer tools under tools/ read, in plain code
 * (tools/readings.js): names, TODO lines, path lists, trace and dump ids,
 * and a profiler trace entry's user and title by field.
 */
const readings = require('../../../tools/readings.js');

describe('tools/readings.js', () => {
  it('finds a TODO in any case, on every line it is asked about', () => {
    // A global pattern's `test` kept its position between lines: every second
    // TODO line was missed.
    const lines = ['// TODO: a', '// todo: b', '// @Todo c', '// done'];
    expect(lines.map((line) => readings.hasTodo(line))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('reads an upper-case ABAP name and an ABAP user', () => {
    expect(readings.isUpperAbapName('ZCL_X1')).toBe(true);
    expect(readings.isUpperAbapName('1ZCL')).toBe(false);
    expect(readings.isUpperAbapName('ZCL-X')).toBe(false);
    expect(readings.isUpperAbapName('')).toBe(false);
    expect(readings.isAbapUser('DEV.USER$-1')).toBe(true);
    expect(readings.isAbapUser('dev')).toBe(false);
    expect(readings.isAbapUser('')).toBe(false);
  });

  it('replaces a name as written, a dot included', () => {
    expect(readings.replacedEverywhere('Z.A Z.A ZXA', 'Z.A', 'ZB')).toBe(
      'ZB ZB ZXA',
    );
    expect(readings.asNameCharacters('A-B c')).toBe('A_B__');
    expect(readings.collapseBlanks('a \n\t b')).toBe('a b');
  });

  it('splits a path list on ":" and ";", keeping an empty segment', () => {
    expect(readings.splitPathList('/a::/b;/c')).toEqual(['/a', '', '/b', '/c']);
  });

  it('reads a trace id and every dump id', () => {
    const id = 'ABCDEF0123456789ABCDEF0123456789';
    expect(
      readings.traceIdIn(`/SAP/bc/ADT/runtime/traces/abaptraces/${id}/x`),
    ).toBe(id);
    expect(
      readings.traceIdIn('/runtime/traces/abaptraces/XYZ'),
    ).toBeUndefined();
    // A dotted capital I lower-cases to two code units: the id stays where it is.
    expect(readings.traceIdIn(`\u0130 /runtime/traces/abaptraces/${id}`)).toBe(
      id,
    );
    expect(
      readings.traceIdIn(`/runtime/traces/abaptraces/${id.slice(1)}\u212A`),
    ).toBeUndefined();
    expect(
      readings.dumpIdsIn(
        'href="/sap/bc/adt/runtime/dumps/D1" /sap/bc/adt/runtime/dumps/D2?x /sap/bc/adt/runtime/dumps/ ',
      ),
    ).toEqual(['D1', 'D2']);
  });

  it("reads a trace entry's user and title by field, not by its words", () => {
    const entry = {
      'atom:title': 'Run marker',
      'atom:author': { 'atom:name': 'other' },
      'trc:extendedData': { 'trc:user': 'dev_user' },
      'atom:summary': 'mentions SOMEONE and RUN MARKER',
    };
    expect(readings.traceEntryUser(entry)).toBe('DEV_USER');
    expect(readings.traceEntryTitle(entry)).toBe('RUN MARKER');
    expect(
      readings.traceEntryUser({ 'atom:author': { 'atom:name': 'a' } }),
    ).toBe('A');
    expect(readings.traceEntryUser({})).toBe('');
  });
});
