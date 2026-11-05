/**
 * `analyseLock`: a lock answer that names no handle is a refusal, and the
 * refusal carries SAP's answer — adt-clients 23 reads such an answer as `''`
 * and leaves the verdict to the caller.
 */
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../lib/adtCorpus';
import { answer } from '../../lib/answer';
import {
  analyseLock,
  carriesLockHandle,
} from '../../lib/strategies/lockAnswer';

const LOCKED =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>4D88C06807F74D8FF36049093A5016DE</LOCK_HANDLE><CORRNR/></DATA></asx:values></asx:abap>';
const LOGIN_PAGE = '<html><body>Logon</body></html>';

/** A 200 as the transport answers it: headers included. */
function wireAnswer(data: string): IAdtWireResponse {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('analyseLock', () => {
  it('lets a lock that names a handle pass — in the body', () => {
    expect(carriesLockHandle(wireAnswer(LOCKED))).toBe(true);
    expect(analyseLock(ADT_NO_FAILURE, wireAnswer(LOCKED))).toBe(
      ADT_NO_FAILURE,
    );
  });

  it('lets a lock that names a handle pass — in the header, as a function group answers', () => {
    const wire = {
      ...wireAnswer(''),
      headers: { 'sap-adt-lm-handle': 'FUGR_HANDLE' },
    };
    expect(analyseLock(ADT_NO_FAILURE, wire)).toBe(ADT_NO_FAILURE);
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
    expect(failure.origin).toBe('refusal');
    expect(failure.message).toContain('without a lock handle');
    expect(failure.request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes/zcl_x?_action=LOCK',
    });
  });

  // A refusal of a `2xx` (SAP did not refuse; the strategy did) carries the
  // body only with `detail: 'raw'`.
  it.each([
    ['terse', undefined],
    ['full', undefined],
    ['raw', LOGIN_PAGE],
  ] as const)(
    'reaches the caller as an error; detail %s carries SAP answer as raw_body: %s',
    async (detail, expected) => {
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
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0].text);
      expect(payload.raw_body).toBe(expected);
      expect(payload.message).toContain('without a lock handle');
    },
  );

  it('refuses an empty handle element too', () => {
    const empty = LOCKED.replace(
      '<LOCK_HANDLE>4D88C06807F74D8FF36049093A5016DE</LOCK_HANDLE>',
      '<LOCK_HANDLE/>',
    );
    expect(carriesLockHandle(wireAnswer(empty))).toBe(false);
  });

  // The handle is read where adt-clients reads it, through the XML parser:
  // `asx:abap/asx:values/DATA/LOCK_HANDLE`.
  it('reads the handle of the recorded lock answer — tests/fixtures/adt/lock-success--01-lock.body.xml', () => {
    expect(
      carriesLockHandle(wireAnswer(corpusBody('lock-success--01-lock'))),
    ).toBe(true);
  });

  it('reads a handle written as CDATA', () => {
    const cdata = LOCKED.replace(
      '4D88C06807F74D8FF36049093A5016DE',
      '<![CDATA[4D88C06807F74D8FF36049093A5016DE]]>',
    );
    expect(carriesLockHandle(wireAnswer(cdata))).toBe(true);
  });

  it('does not take a LOCK_HANDLE outside asx:values/DATA for a handle — adt-clients reads none there', () => {
    const elsewhere =
      '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><OTHER><LOCK_HANDLE>4D88</LOCK_HANDLE></OTHER></asx:values></asx:abap>';
    expect(carriesLockHandle(wireAnswer(elsewhere))).toBe(false);
  });
});
