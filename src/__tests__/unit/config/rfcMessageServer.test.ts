/**
 * RFC through a message server and a logon group: a destination's stated
 * keys, checked (`checkDestinationStatement`) and built into its
 * `ISapRfcConfig` (`rfcConfigOf`), reach `createConnection` as stated —
 * `mshost`, `group`, `msserv`, `sysid`, `saprouter`, the client and the
 * language — with no default and no key that does not belong. The server's
 * own reading of the keys (the start parameters, the destination's means) is
 * `destinationKeys.test.ts`'s.
 */

jest.mock('@mcp-abap-adt/connection', () => {
  const actual = jest.requireActual('@mcp-abap-adt/connection');
  return {
    ...actual,
    createConnection: jest.fn((spec: unknown) => actual.createConnection(spec)),
  };
});

import { createConnection } from '@mcp-abap-adt/connection';
import type { DestinationKeyValues } from '../../../lib/config/messageServer';
import {
  checkDestinationStatement,
  rfcConfigOf,
} from '../../../lib/config/rfcDestination';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';

const saved = process.env.SAP_SYSTEM_TYPE;

beforeEach(() => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  jest.mocked(createConnection).mockClear();
});

afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

/** The config `keys` build, handed to connection: what it received. */
function handedToCreateConnection(keys: DestinationKeyValues) {
  const checked = checkDestinationStatement({
    connectionType: 'rfc',
    authType: 'basic',
    urlKey: 'SAP_URL',
    keys,
  });
  if (!('rfc' in checked)) throw new Error('the keys were refused');
  const config = rfcConfigOf(
    {
      authType: 'basic',
      username: 'placeholder-user',
      password: 'placeholder-password',
    },
    checked.rfc,
  );
  createAbapConnection(config, credentialFromSapConfig(config));
  const calls = jest.mocked(createConnection).mock.calls;
  expect(calls).toHaveLength(1);
  const [spec] = calls[0] ?? [];
  if (spec === undefined) throw new Error('no spec');
  expect(spec.transport).toBe('rfc');
  return spec.config;
}

const LOGON = { client: '100', language: 'EN' } as const;

describe('a message-server destination reaches createConnection as stated', () => {
  it('every field stated reaches it as given', () => {
    const config = handedToCreateConnection({
      ...LOGON,
      mshost: 'ms.example.test',
      msserv: 'sapmsXYZ',
      sysid: 'XYZ',
      group: 'SPACE',
      saprouter: '/H/router.example.test/S/3299/H/',
    });
    expect(config).toEqual({
      authType: 'basic',
      username: 'placeholder-user',
      password: 'placeholder-password',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      mshost: 'ms.example.test',
      msserv: 'sapmsXYZ',
      sysid: 'XYZ',
      group: 'SPACE',
      saprouter: '/H/router.example.test/S/3299/H/',
    });
  });

  it.each([
    ['msserv alone', { msserv: 'sapmsXYZ' }],
    ['sysid alone', { sysid: 'XYZ' }],
  ])('%s names the service; the other key is absent', (_name, service) => {
    const config = handedToCreateConnection({
      ...LOGON,
      mshost: 'ms.example.test',
      group: 'SPACE',
      ...service,
    });
    for (const key of ['msserv', 'sysid'] as const) {
      expect(Object.hasOwn(config, key)).toBe(key in service);
    }
    expect(Object.hasOwn(config, 'saprouter')).toBe(false);
  });

  it('no application-server key and no URL: the address is the message server alone', () => {
    const config = handedToCreateConnection({
      ...LOGON,
      mshost: 'ms.example.test',
      group: 'SPACE',
      sysid: 'XYZ',
    });
    for (const key of ['url', 'ashost', 'sysnr']) {
      expect(Object.hasOwn(config, key)).toBe(false);
    }
  });
});
