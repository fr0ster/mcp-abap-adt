/**
 * When the AMDP gate of the debugger batch test runs, skips or fails
 * (`integration/helpers/amdpFixture.ts`): it skips only where SAP's system
 * information names a database system other than HANA, and fails on any
 * other reason it cannot run — so an enabled gate never passes having
 * tested nothing.
 */
import {
  amdpGateVerdict,
  breakpointLineOf,
  databaseSystemOf,
  type FixtureRead,
} from '../../integration/helpers/amdpFixture';

const feed = (db: string): string =>
  '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom">' +
  '<atom:entry><atom:id>DBName</atom:id><atom:title>XYZ/01</atom:title></atom:entry>' +
  `<atom:entry><atom:id>DBSystem</atom:id><atom:title>${db}</atom:title></atom:entry>` +
  '<atom:entry><atom:id>KernelRelease</atom:id><atom:title>916</atom:title></atom:entry>' +
  '</atom:feed>';

const CLASS_SOURCE = [
  'CLASS zcls IMPLEMENTATION.',
  '  METHOD tf BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT.',
  '    :lt.INSERT( ( 1, 1 ) ); -- BP:tf',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const ok = (text: string): FixtureRead => ({ status: 200, text });

function verdict(over: {
  systemInformation?: FixtureRead;
  classRead?: FixtureRead;
  ddlRead?: FixtureRead;
}) {
  return amdpGateVerdict({
    systemInformation: over.systemInformation ?? ok(feed('HDB')),
    className: 'ZCLS',
    classRead: over.classRead ?? ok(CLASS_SOURCE),
    ddlName: 'ZTF',
    ddlRead: over.ddlRead ?? ok('define table function ZTF'),
  });
}

describe('the AMDP gate: run, skip or fail', () => {
  it('reads DBSystem from the system information feed', () => {
    expect(databaseSystemOf(feed('HDB'))).toBe('HDB');
    expect(databaseSystemOf(feed('ORA'))).toBe('ORA');
    expect(databaseSystemOf('<atom:feed/>')).toBeUndefined();
  });

  it('runs on HANA with both shared objects active, at the marker line SAP answered', () => {
    expect(breakpointLineOf(CLASS_SOURCE)).toBe(3);
    expect(verdict({})).toEqual({ run: true, breakpointLine: 3 });
  });

  it('skips only when SAP names another database system, and names it', () => {
    const answered = verdict({ systemInformation: ok(feed('ORA')) });
    expect(answered).toEqual({
      run: false,
      skip: expect.stringContaining('the database system ORA'),
    });
  });

  it('fails when the system information cannot be read or names no database', () => {
    expect(verdict({ systemInformation: { status: 403, text: 'no' } })).toEqual(
      { run: false, fail: expect.stringContaining('status 403') },
    );
    expect(verdict({ systemInformation: ok('<atom:feed/>') })).toEqual({
      run: false,
      fail: expect.stringContaining('names no DBSystem'),
    });
  });

  it('fails, never skips, when a shared object has no active version', () => {
    expect(verdict({ classRead: { status: 404, text: 'not found' } })).toEqual({
      run: false,
      fail: expect.stringContaining('CLASS ZCLS has no active version'),
    });
    expect(verdict({ ddlRead: { status: 404, text: 'not found' } })).toEqual({
      run: false,
      fail: expect.stringContaining('DDLS ZTF has no active version'),
    });
  });

  it('fails when the class carries no breakpoint marker', () => {
    expect(verdict({ classRead: ok('CLASS zcls IMPLEMENTATION.') })).toEqual({
      run: false,
      fail: expect.stringContaining('no "-- BP:tf" line'),
    });
  });
});
