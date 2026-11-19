/**
 * `analyseLock`: a lock answer that names no handle is a refusal, and the
 * refusal carries SAP's answer — adt-clients 23 reads such an answer as `''`
 * and leaves the verdict to the caller.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { answer } from '../../lib/answer';
import {
  analyseLock,
  carriesLockHandle,
} from '../../lib/strategies/lockAnswer';
import { corpusBody } from '../helpers/adtCorpus';

const LOCKED =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>4D88C06807F74D8FF36049093A5016DE</LOCK_HANDLE><CORRNR/></DATA></asx:values></asx:abap>';
const LOGIN_PAGE = '<html><body>Logon</body></html>';

/** A 200 as the transport answers it: headers included. */
function wireAnswer(data: string): IAdtWireResponse {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('analyseLock', () => {
  it('lets a lock that names a handle pass — in the body', () => {
    assert.equal(carriesLockHandle(wireAnswer(LOCKED)), true);
    assert.equal(
      analyseLock(ADT_NO_FAILURE, wireAnswer(LOCKED)),
      ADT_NO_FAILURE,
    );
  });

  it('lets a lock that names a handle pass — in the header, as a function group answers', () => {
    const wire = {
      ...wireAnswer(''),
      headers: { 'sap-adt-lm-handle': 'FUGR_HANDLE' },
    };
    assert.equal(analyseLock(ADT_NO_FAILURE, wire), ADT_NO_FAILURE);
  });

  it('reads a handle header given as a list by its first entry, and only when it is text', () => {
    const withHeader = (value: IAdtWireResponse['headers'][string]) => ({
      ...wireAnswer(''),
      headers: { 'sap-adt-lm-handle': value },
    });
    assert.equal(
      carriesLockHandle(withHeader([' FUGR_HANDLE ', 'other'])),
      true,
    );
    assert.equal(carriesLockHandle(withHeader(['  ', 'FUGR_HANDLE'])), false);
    assert.equal(carriesLockHandle(withHeader([])), false);
    // A hole at 0 is no entry, though a later one is text.
    const holed = new Array<string>(2);
    holed[1] = 'late-handle';
    assert.equal(carriesLockHandle(withHeader(holed)), false);
    assert.equal(carriesLockHandle(withHeader(42)), false);
    assert.equal(carriesLockHandle(withHeader(null)), false);
    assert.equal(
      carriesLockHandle(withHeader({ handle: 'FUGR_HANDLE' })),
      false,
    );
  });

  it('refuses a 2xx that names no handle, with the answer beside it', () => {
    const wire = {
      ...wireAnswer(LOGIN_PAGE),
      request: {
        method: 'POST',
        url: '/sap/bc/adt/oo/classes/zcl_x?_action=LOCK',
      },
    };
    const failure: any = analyseLock(ADT_NO_FAILURE, wire);
    assert.equal(failure.origin, 'refusal');
    assert.ok(failure.message.includes('without a lock handle'));
    assert.deepStrictEqual(failure.request, {
      method: 'POST',
      url: '/sap/bc/adt/oo/classes/zcl_x?_action=LOCK',
    });
  });

  // A refusal of a `2xx` (SAP did not refuse; the strategy did) carries the
  // body only with `detail: 'raw'`.
  for (const [detail, expected] of [
    ['terse', undefined],
    ['full', undefined],
    ['raw', LOGIN_PAGE],
  ] as const) {
    it(
      format(
        'reaches the caller as an error; detail %s carries SAP answer as raw_body: %s',
        detail,
        expected,
      ),
      async () => {
        const wire = wireAnswer(LOGIN_PAGE);
        const failure = analyseLock(ADT_NO_FAILURE, wire) as any;
        const result = await answer(
          { tool: 'LockClassLow', detail },
          async () =>
            ({
              ok: false,
              getResult: () => {
                throw new Error('no result');
              },
              getError: () => ({ ...failure, response: wire }),
            }) as any,
          (v) => v,
        );
        assert.equal(result.isError, true);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.raw_body, expected);
        assert.ok(payload.message.includes('without a lock handle'));
      },
    );
  }

  it('refuses an empty handle element too', () => {
    const empty = LOCKED.replace(
      '<LOCK_HANDLE>4D88C06807F74D8FF36049093A5016DE</LOCK_HANDLE>',
      '<LOCK_HANDLE/>',
    );
    assert.equal(carriesLockHandle(wireAnswer(empty)), false);
  });

  // The handle is read where adt-clients reads it, through the XML parser:
  // `asx:abap/asx:values/DATA/LOCK_HANDLE`.
  it('reads the handle of the recorded lock answer — tests/fixtures/adt/lock-success--01-lock.body.xml', () => {
    assert.equal(
      carriesLockHandle(wireAnswer(corpusBody('lock-success--01-lock'))),
      true,
    );
  });

  it('reads a handle written as CDATA', () => {
    const cdata = LOCKED.replace(
      '4D88C06807F74D8FF36049093A5016DE',
      '<![CDATA[4D88C06807F74D8FF36049093A5016DE]]>',
    );
    assert.equal(carriesLockHandle(wireAnswer(cdata)), true);
  });

  it('does not take a LOCK_HANDLE outside asx:values/DATA for a handle — adt-clients reads none there', () => {
    const elsewhere =
      '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><OTHER><LOCK_HANDLE>4D88</LOCK_HANDLE></OTHER></asx:values></asx:abap>';
    assert.equal(carriesLockHandle(wireAnswer(elsewhere)), false);
  });
});
