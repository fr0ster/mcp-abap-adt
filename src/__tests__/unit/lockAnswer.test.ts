/**
 * `analyseLock`: a lock answer that names no handle is a refusal, and the
 * refusal carries SAP's answer — adt-clients 23 reads such an answer as `''`
 * and leaves the verdict to the caller.
 */
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../lib/answer';
import {
  analyseLock,
  carriesLockHandle,
} from '../../lib/strategies/lockAnswer';

const LOCKED =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>4D88C06807F74D8FF36049093A5016DE</LOCK_HANDLE><CORRNR/></DATA></asx:values></asx:abap>';
const LOGIN_PAGE = '<html><body>Logon</body></html>';

describe('analyseLock', () => {
  it('lets a lock that names a handle pass — in the body', () => {
    expect(carriesLockHandle({ data: LOCKED, status: 200 } as any)).toBe(true);
    expect(
      analyseLock(ADT_NO_FAILURE, { data: LOCKED, status: 200 } as any),
    ).toBe(ADT_NO_FAILURE);
  });

  it('lets a lock that names a handle pass — in the header, as a function group answers', () => {
    const wire = {
      data: '',
      status: 200,
      headers: { 'sap-adt-lm-handle': 'FUGR_HANDLE' },
    };
    expect(analyseLock(ADT_NO_FAILURE, wire as any)).toBe(ADT_NO_FAILURE);
  });

  it('refuses a 2xx that names no handle, with the answer beside it', () => {
    const wire = {
      data: LOGIN_PAGE,
      status: 200,
      request: {
        method: 'POST',
        url: '/sap/bc/adt/oo/classes/zcl_x?_action=LOCK',
      },
    };
    const failure: any = analyseLock(ADT_NO_FAILURE, wire as any);
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
      const wire = { data: LOGIN_PAGE, status: 200 };
      const failure = analyseLock(ADT_NO_FAILURE, wire as any) as any;
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
    expect(carriesLockHandle({ data: empty, status: 200 } as any)).toBe(false);
  });
});
