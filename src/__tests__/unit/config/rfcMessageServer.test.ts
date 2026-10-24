/**
 * RFC through a message server and a logon group: the environment's
 * `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP` and `SAP_SAPROUTER`
 * reach the `SapConfig` that `createConnection` is handed, as given — trimmed
 * as `SAP_CLIENT` is, nothing else. The server adds no default (`group`'s
 * `PUBLIC` is connection's) and decides nothing: connection refuses a
 * message server with neither `msserv` nor `sysid`, and that refusal reaches
 * the caller as it came.
 *
 * The reader is `applyMessageServerFields` (`@mcp-abap-adt/lib/config`), on a
 * basic config built here: the two `getConfig()` copies that called it, and
 * guessed the rest of the config from the environment, are gone (#320).
 */

jest.mock('@mcp-abap-adt/connection', () => {
  const actual = jest.requireActual('@mcp-abap-adt/connection');
  return {
    ...actual,
    // Recorded, then connection's own: its refusal is what the caller gets.
    createConnection: jest.fn((spec: unknown) => actual.createConnection(spec)),
  };
});

import { createConnection, rfcParamsFrom } from '@mcp-abap-adt/connection';
import { applyMessageServerFields } from '../../../lib/config/messageServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';

const FIELDS = {
  SAP_MSHOST: 'mshost',
  SAP_MSSERV: 'msserv',
  SAP_SYSID: 'sysid',
  SAP_GROUP: 'group',
  SAP_SAPROUTER: 'saprouter',
} as const;

const BASE_ENV: Record<string, string> = {
  SAP_URL: 'https://system.example.test:44300',
  SAP_CLIENT: '100',
  SAP_AUTH_TYPE: 'basic',
  SAP_USERNAME: 'placeholder-user',
  SAP_PASSWORD: 'placeholder-password',
  SAP_CONNECTION_TYPE: 'rfc',
  SAP_SYSTEM_TYPE: 'onprem',
};

const TOUCHED = [...Object.keys(BASE_ENV), ...Object.keys(FIELDS), 'SAP_SYSNR'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of TOUCHED) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, BASE_ENV);
  (createConnection as unknown as jest.Mock).mockClear();
});

afterEach(() => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

type Reader = () => import('@mcp-abap-adt/connection').SapConfig;

/** A basic RFC config, with the message-server fields the environment holds now. */
function readerOf(): Reader {
  return () => {
    const config: import('@mcp-abap-adt/connection').SapConfig = {
      url: BASE_ENV.SAP_URL,
      authType: 'basic',
      connectionType: 'rfc',
      username: BASE_ENV.SAP_USERNAME,
      password: BASE_ENV.SAP_PASSWORD,
    };
    const client = process.env.SAP_CLIENT?.trim();
    if (client) config.client = client;
    applyMessageServerFields(config, process.env);
    return config;
  };
}

/** The config the server reads, handed to connection: what it received. */
function handedToCreateConnection(read: Reader) {
  const config = read();
  createAbapConnection(config, credentialFromSapConfig(config));
  const calls = (createConnection as unknown as jest.Mock).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][0].config as Record<string, unknown>;
}

describe('applyMessageServerFields', () => {
  it('each of SAP_MSHOST, SAP_MSSERV, SAP_SYSID, SAP_GROUP, SAP_SAPROUTER reaches the SapConfig handed to createConnection, as given (trimmed only as SAP_CLIENT is)', () => {
    process.env.SAP_CLIENT = '  100  ';
    process.env.SAP_MSHOST = '  ms.example.test  ';
    process.env.SAP_MSSERV = ' sapmsXYZ ';
    process.env.SAP_SYSID = ' XYZ ';
    process.env.SAP_GROUP = ' SPACE ';
    process.env.SAP_SAPROUTER = ' /H/router.example.test/S/3299/H/ ';

    const config = handedToCreateConnection(readerOf());

    expect(config.client).toBe('100');
    expect(config.mshost).toBe('ms.example.test');
    expect(config.msserv).toBe('sapmsXYZ');
    expect(config.sysid).toBe('XYZ');
    expect(config.group).toBe('SPACE');
    expect(config.saprouter).toBe('/H/router.example.test/S/3299/H/');
  });

  it.each(Object.entries(FIELDS))('%s alone reaches %s', (env, field) => {
    process.env[env] = 'value-one';
    // A message server needs msserv or sysid: one is given beside mshost.
    if (env === 'SAP_MSHOST') process.env.SAP_SYSID = 'XYZ';
    const config = handedToCreateConnection(readerOf());
    expect(config[field]).toBe('value-one');
  });

  it('absent fields are absent, not defaulted (no group: PUBLIC from the server)', () => {
    process.env.SAP_MSHOST = 'ms.example.test';
    process.env.SAP_SYSID = 'XYZ';
    const config = handedToCreateConnection(readerOf());
    expect(config.mshost).toBe('ms.example.test');
    expect(config.sysid).toBe('XYZ');
    for (const key of ['msserv', 'group', 'saprouter']) {
      expect(Object.hasOwn(config, key)).toBe(false);
    }
  });

  it('none of them set: no key of them', () => {
    const config = handedToCreateConnection(readerOf());
    for (const key of Object.values(FIELDS)) {
      expect(Object.hasOwn(config, key)).toBe(false);
    }
  });

  it('an empty or blank value is no value', () => {
    process.env.SAP_GROUP = '   ';
    process.env.SAP_SAPROUTER = '';
    const config = handedToCreateConnection(readerOf());
    expect(Object.hasOwn(config, 'group')).toBe(false);
    expect(Object.hasOwn(config, 'saprouter')).toBe(false);
  });

  it('mshost without msserv and sysid: connection’s refusal reaches the caller as it came, naming both', () => {
    process.env.SAP_MSHOST = 'ms.example.test';
    const read = readerOf();
    const config = read();
    expect(config.mshost).toBe('ms.example.test');

    // connection's own words, read from connection itself.
    let expected: unknown;
    try {
      rfcParamsFrom(config);
    } catch (error) {
      expected = error;
    }
    expect(expected).toBeInstanceOf(Error);
    expect((expected as Error).message).toContain('msserv');
    expect((expected as Error).message).toContain('sysid');

    let thrown: unknown;
    try {
      createAbapConnection(config, credentialFromSapConfig(config));
    } catch (error) {
      thrown = error;
    }
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).constructor).toBe((expected as Error).constructor);
    expect((thrown as Error).message).toBe((expected as Error).message);
  });

  it('with mshost, SAP_SYSNR is not read by the server either', () => {
    process.env.SAP_MSHOST = 'ms.example.test';
    process.env.SAP_MSSERV = 'sapmsXYZ';
    process.env.SAP_SYSNR = '42';
    const config = handedToCreateConnection(readerOf());
    expect(Object.hasOwn(config, 'sysnr')).toBe(false);
    const params = rfcParamsFrom(config as never);
    expect(params).not.toHaveProperty('sysnr');
    expect(params).not.toHaveProperty('ashost');
    expect(params).toMatchObject({ mshost: 'ms.example.test' });
  });
});
