/**
 * The integration tests' `getSapConfigFromEnv` guesses nothing (#320): the
 * authentication is stated and is one the helper builds, and each needs what
 * it needs. A missing or unknown value is refused, naming it, instead of
 * becoming `basic` with an empty user.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject, assertThrows } from '../../helpers/assertions';
import { getSapConfigFromEnv } from '../../integration/helpers/configHelpers';

const KEYS = [
  'SAP_URL',
  'SAP_AUTH_TYPE',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_JWT_TOKEN',
  'SAP_CLIENT',
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
  'SAP_LANGUAGE',
  'SAP_ASHOST',
  'SAP_SYSNR',
  'SAP_MSHOST',
  'SAP_MSSERV',
  'SAP_SYSID',
  'SAP_GROUP',
  'SAP_SAPROUTER',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SAP_URL = 'https://system.example.test:44300';
  process.env.SAP_CONNECTION_TYPE = 'http';
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('getSapConfigFromEnv', () => {
  it('refuses a config that states no SAP_AUTH_TYPE', () => {
    process.env.SAP_USERNAME = 'user';
    process.env.SAP_PASSWORD = 'secret';
    assertThrows(
      () => getSapConfigFromEnv(),
      'SAP_AUTH_TYPE is not set. State one of: basic, jwt.',
    );
  });

  for (const value of ['basci', 'snc', 'certificate', 'xsuaa']) {
    it(
      format('refuses SAP_AUTH_TYPE=%s rather than reading it as basic', value),
      () => {
        process.env.SAP_AUTH_TYPE = value;
        process.env.SAP_USERNAME = 'user';
        process.env.SAP_PASSWORD = 'secret';
        assertThrows(
          () => getSapConfigFromEnv(),
          `SAP_AUTH_TYPE "${value}" is not one this test helper builds: basic, jwt.`,
        );
      },
    );
  }

  for (const [_missing, present] of [
    ['SAP_USERNAME', { SAP_PASSWORD: 'secret' }],
    ['SAP_PASSWORD', { SAP_USERNAME: 'user' }],
  ]) {
    it(format('refuses basic without %s', _missing), () => {
      process.env.SAP_AUTH_TYPE = 'basic';
      Object.assign(process.env, present);
      assertThrows(
        () => getSapConfigFromEnv(),
        'SAP_AUTH_TYPE is basic, but SAP_USERNAME or SAP_PASSWORD is not set.',
      );
    });
  }

  it('refuses jwt without SAP_JWT_TOKEN', () => {
    process.env.SAP_AUTH_TYPE = 'jwt';
    assertThrows(
      () => getSapConfigFromEnv(),
      'SAP_AUTH_TYPE is jwt, but SAP_JWT_TOKEN is not set.',
    );
  });

  for (const value of ['rfcc', 'tcp', 'https']) {
    it(
      format(
        'refuses SAP_CONNECTION_TYPE=%s rather than running over HTTP',
        value,
      ),
      () => {
        process.env.SAP_AUTH_TYPE = 'basic';
        process.env.SAP_USERNAME = 'user';
        process.env.SAP_PASSWORD = 'secret';
        process.env.SAP_CONNECTION_TYPE = value;
        assertThrows(
          () => getSapConfigFromEnv(),
          `SAP_CONNECTION_TYPE "${value}" is not one of: http, rfc.`,
        );
      },
    );
  }

  it('refuses a config that states no SAP_CONNECTION_TYPE rather than running over HTTP', () => {
    process.env.SAP_AUTH_TYPE = 'basic';
    process.env.SAP_USERNAME = 'user';
    process.env.SAP_PASSWORD = 'secret';
    delete process.env.SAP_CONNECTION_TYPE;
    assertThrows(
      () => getSapConfigFromEnv(),
      'SAP_CONNECTION_TYPE is not set. State one of: http, rfc.',
    );
  });

  for (const [value, wire] of [
    ['http', 'http'],
    ['rfc', 'rfc'],
    // In any case, as the launcher reads an enum.
    ['RFC', 'rfc'],
    ['Http', 'http'],
  ]) {
    it(format('reads SAP_CONNECTION_TYPE=%s as %s', value, wire), () => {
      process.env.SAP_AUTH_TYPE = 'basic';
      process.env.SAP_USERNAME = 'user';
      process.env.SAP_PASSWORD = 'secret';
      process.env.SAP_CONNECTION_TYPE = value;
      if (wire === 'rfc') statesRfcAddress();
      assert.equal(getSapConfigFromEnv().connectionType, wire);
    });
  }

  it('builds basic from what was stated', () => {
    process.env.SAP_AUTH_TYPE = 'basic';
    process.env.SAP_USERNAME = ' user ';
    process.env.SAP_PASSWORD = 'secret';
    process.env.SAP_CLIENT = '100';
    assertMatchObject(getSapConfigFromEnv(), {
      url: 'https://system.example.test:44300',
      authType: 'basic',
      username: 'user',
      password: 'secret',
      client: '100',
    });
  });

  it('builds jwt from what was stated', () => {
    process.env.SAP_AUTH_TYPE = 'jwt';
    process.env.SAP_JWT_TOKEN = 'token-value';
    assertMatchObject(getSapConfigFromEnv(), {
      authType: 'jwt',
      jwtToken: 'token-value',
    });
  });

  describe('per wire: RFC states its address, its client and language, no URL', () => {
    beforeEach(() => {
      process.env.SAP_AUTH_TYPE = 'basic';
      process.env.SAP_USERNAME = 'user';
      process.env.SAP_PASSWORD = 'secret';
      process.env.SAP_CONNECTION_TYPE = 'rfc';
    });

    it('an application server: the RFC config as stated, no URL', () => {
      statesRfcAddress();
      assert.deepStrictEqual(getSapConfigFromEnv(), {
        authType: 'basic',
        username: 'user',
        password: 'secret',
        connectionType: 'rfc',
        client: '100',
        language: 'EN',
        ashost: 'system.example.test',
        sysnr: '00',
      });
    });

    it('a message server: the RFC config as stated', () => {
      delete process.env.SAP_URL;
      Object.assign(process.env, {
        SAP_MSHOST: 'ms.example.test',
        SAP_SYSID: 'SYX',
        SAP_GROUP: 'PUBLIC_GROUP',
        SAP_CLIENT: '100',
        SAP_LANGUAGE: 'EN',
      });
      assertMatchObject(getSapConfigFromEnv(), {
        connectionType: 'rfc',
        mshost: 'ms.example.test',
        sysid: 'SYX',
        group: 'PUBLIC_GROUP',
      });
    });

    /** Each refusal case, alone, with the server's words for it; no value quoted. */
    const SENTINEL = 'sentinel-value-7f3a';
    for (const [_case, env, words] of [
      [
        'RFC stating SAP_URL',
        {
          SAP_URL: `https://${SENTINEL}.example.test`,
          SAP_ASHOST: SENTINEL,
          SAP_SYSNR: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
        },
        'is RFC and states SAP_URL, which an RFC destination does not take',
      ],
      [
        'two addresses',
        {
          SAP_ASHOST: SENTINEL,
          SAP_SYSNR: SENTINEL,
          SAP_MSHOST: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
        },
        'states two RFC addresses — an application server and a message server: SAP_ASHOST, SAP_SYSNR, SAP_MSHOST',
      ],
      [
        'no address',
        { SAP_CLIENT: SENTINEL, SAP_LANGUAGE: SENTINEL },
        'is RFC and states no address',
      ],
      [
        'an application server without SAP_SYSNR',
        { SAP_ASHOST: SENTINEL, SAP_CLIENT: SENTINEL, SAP_LANGUAGE: SENTINEL },
        'is RFC and its address lacks: SAP_SYSNR',
      ],
      [
        'an application server without SAP_ASHOST',
        { SAP_SYSNR: SENTINEL, SAP_CLIENT: SENTINEL, SAP_LANGUAGE: SENTINEL },
        'is RFC and its address lacks: SAP_ASHOST',
      ],
      [
        'a message server without SAP_GROUP',
        {
          SAP_MSHOST: SENTINEL,
          SAP_MSSERV: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
        },
        'is RFC and its address lacks: SAP_GROUP',
      ],
      [
        'a message server without a service',
        {
          SAP_MSHOST: SENTINEL,
          SAP_GROUP: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
        },
        'is RFC and its address lacks: SAP_MSSERV or SAP_SYSID',
      ],
      [
        'a message server without SAP_MSHOST',
        {
          SAP_SYSID: SENTINEL,
          SAP_GROUP: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
        },
        'is RFC and its address lacks: SAP_MSHOST',
      ],
      [
        'no SAP_CLIENT',
        { SAP_ASHOST: SENTINEL, SAP_SYSNR: SENTINEL, SAP_LANGUAGE: SENTINEL },
        'is RFC and lacks: SAP_CLIENT',
      ],
      [
        'no SAP_LANGUAGE',
        { SAP_ASHOST: SENTINEL, SAP_SYSNR: SENTINEL, SAP_CLIENT: SENTINEL },
        'is RFC and lacks: SAP_LANGUAGE',
      ],
      [
        'ABAP Cloud over RFC',
        {
          SAP_ASHOST: SENTINEL,
          SAP_SYSNR: SENTINEL,
          SAP_CLIENT: SENTINEL,
          SAP_LANGUAGE: SENTINEL,
          SAP_SYSTEM_TYPE: 'cloud',
        },
        'is ABAP Cloud over RFC, which ABAP Cloud does not offer: SAP_SYSTEM_TYPE, SAP_CONNECTION_TYPE',
      ],
    ] satisfies [string, Record<string, string>, string][]) {
      it(format('%s: refused in its words', _case), () => {
        delete process.env.SAP_URL;
        Object.assign(process.env, env);
        let thrown: unknown;
        try {
          getSapConfigFromEnv();
        } catch (error) {
          thrown = error;
        }
        assert.ok(thrown instanceof Error);
        const message = thrown instanceof Error ? thrown.message : '';
        assert.ok(message.includes(words));
        assert.ok(!message.includes(SENTINEL));
      });
    }
  });

  describe('per wire: HTTP requires SAP_URL and takes no RFC address key', () => {
    beforeEach(() => {
      process.env.SAP_AUTH_TYPE = 'basic';
      process.env.SAP_USERNAME = 'user';
      process.env.SAP_PASSWORD = 'secret';
    });

    it('without SAP_URL: refused naming it', () => {
      delete process.env.SAP_URL;
      assertThrows(() => getSapConfigFromEnv(), 'cannot be used: SAP_URL');
    });

    for (const key of [
      'SAP_ASHOST',
      'SAP_SYSNR',
      'SAP_MSHOST',
      'SAP_MSSERV',
      'SAP_SYSID',
      'SAP_GROUP',
      'SAP_SAPROUTER',
    ]) {
      it(format('with %s: refused naming it', key), () => {
        process.env[key] = 'sentinel-value-7f3a';
        assertThrows(
          () => getSapConfigFromEnv(),
          `is HTTP and states RFC address keys, which HTTP does not take: ${key}`,
        );
      });
    }
  });
});

/** An application-server address, its client and language; no URL. */
function statesRfcAddress(): void {
  delete process.env.SAP_URL;
  Object.assign(process.env, {
    SAP_ASHOST: 'system.example.test',
    SAP_SYSNR: '00',
    SAP_CLIENT: '100',
    SAP_LANGUAGE: 'EN',
  });
}
