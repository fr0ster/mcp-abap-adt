/**
 * CreateCdsUnitTest / UpdateCdsUnitTest, driven through a real (unmocked)
 * `AdtClient` against a recording connection.
 *
 * Fix round 2: both handlers previously called `getCdsUnitTest(results)
 * .create()` / `.update()`. `AdtUnitTest`'s constructor — which
 * `AdtCdsUnitTest` inherits — builds its inner delegates
 * (`this.adtClass`, `this.adtLocalTestClass`) with no result set of their
 * own, so whatever `results` a caller injects at `getCdsUnitTest(results)`
 * never reaches the object that actually answers `create`/`update`. The
 * answer came back read through the shipped default reading — not this
 * repository's `AdtReading`-producing one — and `project(detail,
 * terseWrite)` then read `.value`/`.status` off something that was not a
 * reading at all: every success became a local `projection_failed`,
 * `isError: true`, at every `detail` level, every time.
 *
 * `fakeClientOf`/`fakeClientOfWithFactory` mock `createAdtClient` itself,
 * so `AdtUnitTest`'s real constructor — and its real inner delegates —
 * never run under them; that is exactly why a defect that reproduced on
 * every single call was invisible to a member-mocked test. This file
 * exercises the real `AdtClient` classes against `recordingConnection`
 * (`../helpers/recordingConnection.ts`), which answers only
 * `makeAdtRequest` — nothing about `@mcp-abap-adt/adt-clients` is mocked.
 *
 * Both handlers were rewritten to call `getClass()` / `getLocalTestClass()`
 * directly instead of delegating through `getCdsUnitTest()` — the same wire
 * request, through an accessor that does honour the injected result set.
 * Response bodies below are taken from the captured corpus
 * (`create-class--01-oo-classes`, `update-source-success--01-lock`) where a
 * shape is on record; the CDS test-doubles check has no corpus fixture, so
 * its body is hand-built from the shipped `checkCdsTestDoublesAvailability`
 * reading.
 */

import { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { recordingConnection } from '../helpers/recordingConnection';

const context = { connection: undefined as any, logger: undefined };

const TEST_DOUBLES_OK =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  '<asx:values><DATA><SEVERITY>OK</SEVERITY></DATA></asx:values></asx:abap>';

/** `lock-success--01-lock.body.xml` from the captured corpus. */
const LOCK_SUCCESS_XML =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  '<asx:values><DATA><LOCK_HANDLE>B92E65858E83454C783181344F429D4BFD8E395D</LOCK_HANDLE>' +
  '<CORRNR/><CORRUSER/><CORRTEXT/><IS_LOCAL>X</IS_LOCAL><IS_LINK_UP/>' +
  '<MODIFICATION_SUPPORT>NoModification</MODIFICATION_SUPPORT><LINK_UP_MODE/>' +
  '<CORR_LOCKS/><CORR_CONTENTS/><SCOPE_MESSAGES/></DATA></asx:values></asx:abap>';

describe('CreateCdsUnitTest: real AdtClient, no mocked member', () => {
  it('answers SUCCESS — not the local projection_failed the delegation bug produced', async () => {
    // create-class--01-oo-classes: 200, zero-byte body.
    const conn = recordingConnection([
      { status: 200, data: TEST_DOUBLES_OK },
      { status: 200, data: '' },
    ]);

    const result: any = await handleCreateCdsUnitTest(
      { ...context, connection: conn } as any,
      { class_name: 'ZCL_X', package_name: 'ZP', cds_view_name: 'ZI_VIEW' },
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('SUCCESS');
    expect(conn.requests).toHaveLength(2);
    expect(conn.requests[0].url).toContain(
      '/aunit/dbtestdoubles/cds/validation',
    );
    expect(conn.requests[1].method).toBe('POST');
    expect(conn.requests[1].url).toBe('/sap/bc/adt/oo/classes');
  });

  it('surfaces a refused test-doubles check, and never reaches create', async () => {
    const conn = recordingConnection([
      {
        status: 200,
        data:
          '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
          '<asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>View cannot be tested</SHORT_TEXT></DATA></asx:values></asx:abap>',
      },
    ]);

    const result: any = await handleCreateCdsUnitTest(
      { ...context, connection: conn } as any,
      { class_name: 'ZCL_X', package_name: 'ZP', cds_view_name: 'ZI_VIEW' },
    );

    expect(result.isError).toBe(true);
    expect(conn.requests).toHaveLength(1);
  });
});

describe('UpdateCdsUnitTest: real AdtClient, no mocked member', () => {
  it('answers SUCCESS — not the local projection_failed the delegation bug produced', async () => {
    const conn = recordingConnection([
      { status: 200, data: LOCK_SUCCESS_XML },
      { status: 200, data: '' },
      { status: 200, data: '' },
    ]);

    const result: any = await handleUpdateCdsUnitTest(
      { ...context, connection: conn } as any,
      {
        class_name: 'ZCL_X',
        test_class_source: 'CLASS ltcl_test DEFINITION...',
      },
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('SUCCESS');
    expect(conn.requests).toHaveLength(3);
    // lock, then the include PUT under that handle, then unlock.
    expect(conn.requests[0].url).toContain('_action=LOCK');
    expect(conn.requests[1].method).toBe('PUT');
    expect(conn.requests[1].url).toContain(
      'B92E65858E83454C783181344F429D4BFD8E395D',
    );
    expect(conn.requests[2].url).toContain('_action=UNLOCK');
  });

  it('releases the lock and reports the failure when the write is refused', async () => {
    const conn = recordingConnection([
      { status: 200, data: LOCK_SUCCESS_XML },
      {
        status: 400,
        data:
          '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
          '<message>Syntax error in source</message></exc:exception>',
      },
      { status: 200, data: '' },
    ]);

    const result: any = await handleUpdateCdsUnitTest(
      { ...context, connection: conn } as any,
      { class_name: 'ZCL_X', test_class_source: 'not valid abap' },
    );

    expect(result.isError).toBe(true);
    expect(conn.requests).toHaveLength(3);
    expect(conn.requests[2].url).toContain('_action=UNLOCK');
  });
});
