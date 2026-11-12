/**
 * The realm check before any logon (plan C2 Step 1), on the ADT stand-in:
 * nothing reaches SAP, and no credential travels with the check.
 */

import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
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
    await expect(
      realmCheck('onprem', stand.url, 'ANOTHER REALM', { jwt: undefined }),
    ).rejects.toThrow(`the system's realm is "${REALM}"`);
    expect(stand.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /sap/bc/adt/discovery',
    ]);
    expect(stand.requests.filter(withCredential)).toEqual([]);
  });

  it('the expected realm passes, with no credential sent', async () => {
    await expect(
      realmCheck('onprem', stand.url, REALM, { jwt: undefined }),
    ).resolves.toBeUndefined();
    expect(stand.requests.filter(withCredential)).toEqual([]);
  });

  it('an empty expected realm refuses', async () => {
    await expect(
      realmCheck('onprem', stand.url, '', { jwt: undefined }),
    ).rejects.toThrow('environment.expected_realm is empty');
    expect(stand.requests).toEqual([]);
  });

  it('an answer other than 401 refuses', async () => {
    const open = await adtStandIn();
    try {
      await expect(
        realmCheck('onprem', open.url, REALM, { jwt: undefined }),
      ).rejects.toThrow('answered 200 without a credential, not 401');
    } finally {
      await open.close();
    }
  });

  it('an expired JWT refuses with no request', async () => {
    await expect(
      realmCheck('cloud', stand.url, '', { jwt: jwtExpiring(-60) }),
    ).rejects.toThrow('the session JWT expired at');
    expect(stand.requests).toEqual([]);
  });

  it('a cloud session without a JWT refuses with no request', async () => {
    await expect(
      realmCheck('cloud', stand.url, '', { jwt: undefined }),
    ).rejects.toThrow('the cloud session holds no JWT');
    expect(stand.requests).toEqual([]);
  });

  it('a live JWT passes on the 401, with no credential sent', async () => {
    await expect(
      realmCheck('cloud', stand.url, '', { jwt: jwtExpiring(600) }),
    ).resolves.toBeUndefined();
    expect(stand.requests.filter(withCredential)).toEqual([]);
    expect(stand.requests).toHaveLength(1);
  });
});
