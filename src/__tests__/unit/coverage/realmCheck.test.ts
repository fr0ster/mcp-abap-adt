/**
 * The realm check before any logon (plan C2 Step 1), on the ADT stand-in:
 * nothing reaches SAP, and no credential travels with the check.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { assertRejects } from '../../helpers/assertions';
import { realmCheck } from '../../integration/helpers/realmCheck';

const REALM = 'STAND IN REALM [STD/100]';

let stand: AdtStandIn;

beforeEach(async () => {
  stand = await adtStandIn();
  // The system without a credential: 401 and its realm.
  stand.respond(
    () => true,
    () => ({
      status: 401,
      headers: { 'www-authenticate': `Basic realm="${REALM}"` },
    }),
  );
});

afterEach(async () => {
  await stand.close();
});

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT whose `exp` is `secondsFromNow` ahead (negative: past). */
const jwtExpiring = (secondsFromNow: number): string =>
  [
    base64url({ alg: 'none', typ: 'JWT' }),
    base64url({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
    'signature',
  ].join('.');

const withCredential = (request: StandInRequest): boolean =>
  request.authorization !== undefined;

describe('realmCheck', () => {
  it('a wrong realm throws before any credential is sent', async () => {
    await assertRejects(
      realmCheck('onprem', stand.url, 'ANOTHER REALM', { jwt: undefined }),
      `the system's realm is "${REALM}"`,
    );
    assert.deepStrictEqual(
      stand.requests.map((r) => `${r.method} ${r.url}`),
      ['GET /sap/bc/adt/discovery'],
    );
    assert.deepStrictEqual(stand.requests.filter(withCredential), []);
  });

  it('the expected realm passes, with no credential sent', async () => {
    assert.equal(
      await realmCheck('onprem', stand.url, REALM, { jwt: undefined }),
      undefined,
    );
    assert.deepStrictEqual(stand.requests.filter(withCredential), []);
  });

  it('an empty expected realm refuses', async () => {
    await assertRejects(
      realmCheck('onprem', stand.url, '', { jwt: undefined }),
      'environment.expected_realm is empty',
    );
    assert.deepStrictEqual(stand.requests, []);
  });

  it('an answer other than 401 refuses', async () => {
    const open = await adtStandIn();
    try {
      await assertRejects(
        realmCheck('onprem', open.url, REALM, { jwt: undefined }),
        'answered 200 without a credential, not 401',
      );
    } finally {
      await open.close();
    }
  });

  it('an expired JWT refuses with no request', async () => {
    await assertRejects(
      realmCheck('cloud', stand.url, '', { jwt: jwtExpiring(-60) }),
      'the session JWT expired at',
    );
    assert.deepStrictEqual(stand.requests, []);
  });

  it('a cloud session without a JWT refuses with no request', async () => {
    await assertRejects(
      realmCheck('cloud', stand.url, '', { jwt: undefined }),
      'the cloud session holds no JWT',
    );
    assert.deepStrictEqual(stand.requests, []);
  });

  it('a live JWT passes on the 401, with no credential sent', async () => {
    assert.equal(
      await realmCheck('cloud', stand.url, '', { jwt: jwtExpiring(600) }),
      undefined,
    );
    assert.deepStrictEqual(stand.requests.filter(withCredential), []);
    assert.equal(stand.requests.length, 1);
  });
});
