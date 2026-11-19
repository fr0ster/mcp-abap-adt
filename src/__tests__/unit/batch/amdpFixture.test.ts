/**
 * When the AMDP gate of the debugger batch test runs, skips or fails
 * (`integration/helpers/amdpFixture.ts`): it skips only where the database
 * system — stated by the test config, else named by SAP's system
 * information — is not HANA, and fails on any other reason it cannot run —
 * so an enabled gate never passes having tested nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amdpGateVerdict,
  breakpointLineOf,
  type DatabaseSource,
  databaseSource,
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
  database?: DatabaseSource;
  classRead?: FixtureRead;
  ddlRead?: FixtureRead;
}) {
  return amdpGateVerdict({
    database: over.database ?? { systemInformation: ok(feed('HDB')) },
    className: 'ZCLS',
    classRead: over.classRead ?? ok(CLASS_SOURCE),
    ddlName: 'ZTF',
    ddlRead: over.ddlRead ?? ok('define table function ZTF'),
  });
}

/**
 * `actual` holds `words` in its string field `key`, and equals `rest` in
 * every other field.
 */
function assertWithWords(
  actual: object,
  key: string,
  words: string,
  rest: Record<string, unknown>,
): void {
  const value: unknown = Reflect.get(actual, key);
  assert.ok(typeof value === 'string' && value.includes(words));
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(actual).filter(([k]) => k !== key)),
    rest,
  );
}

describe('the AMDP gate: run, skip or fail', () => {
  it('reads DBSystem from the system information feed', () => {
    assert.equal(databaseSystemOf(feed('HDB')), 'HDB');
    assert.equal(databaseSystemOf(feed('ORA')), 'ORA');
    assert.equal(databaseSystemOf('<atom:feed/>'), undefined);
  });

  it('runs on HANA with both shared objects active, at the marker line SAP answered', () => {
    assert.equal(breakpointLineOf(CLASS_SOURCE), 3);
    assert.deepStrictEqual(verdict({}), { run: true, breakpointLine: 3 });
  });

  it('skips only when SAP names another database system, and names it', () => {
    const answered = verdict({
      database: { systemInformation: ok(feed('ORA')) },
    });
    assertWithWords(answered, 'skip', 'the database system ORA', {
      run: false,
    });
  });

  it('fails when the system information cannot be read or names no database', () => {
    assertWithWords(
      verdict({
        database: { systemInformation: { status: 403, text: 'no' } },
      }),
      'fail',
      'status 403',
      { run: false },
    );
    assertWithWords(
      verdict({
        database: { systemInformation: ok('<atom:feed/>') },
      }),
      'fail',
      'names no DBSystem',
      { run: false },
    );
  });

  it('takes the database system the test config states, and names where it came from', () => {
    assert.deepStrictEqual(verdict({ database: { stated: 'HDB' } }), {
      run: true,
      breakpointLine: 3,
    });
    assertWithWords(
      verdict({ database: { stated: 'ORA' } }),
      'skip',
      'the test config states the database system ORA',
      { run: false },
    );
  });

  it('reads SAP only when the test config states no database system', async () => {
    let reads = 0;
    const read = async (): Promise<FixtureRead> => {
      reads += 1;
      return ok(feed('HDB'));
    };
    assert.deepStrictEqual(await databaseSource('HDB', read), {
      stated: 'HDB',
    });
    assert.equal(reads, 0);
    assert.deepStrictEqual(await databaseSource(undefined, read), {
      systemInformation: ok(feed('HDB')),
    });
    assert.equal(reads, 1);
  });

  it('fails, never skips, when a shared object has no active version', () => {
    assertWithWords(
      verdict({ classRead: { status: 404, text: 'not found' } }),
      'fail',
      'CLASS ZCLS has no active version',
      { run: false },
    );
    assertWithWords(
      verdict({ ddlRead: { status: 404, text: 'not found' } }),
      'fail',
      'DDLS ZTF has no active version',
      { run: false },
    );
  });

  it('fails when the class carries no breakpoint marker', () => {
    assertWithWords(
      verdict({ classRead: ok('CLASS zcls IMPLEMENTATION.') }),
      'fail',
      'no "-- BP:tf" line',
      { run: false },
    );
  });
});
